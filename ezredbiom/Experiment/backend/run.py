# backend/run.py
from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS
from openai import OpenAI
from qiita_db.sql_connection import TRN
import json
from dotenv import load_dotenv
import os
from concurrent.futures import ThreadPoolExecutor

from services.llm import llm_query_to_sql
from services.study_service import search_studies_with_sql

from store import (
    add_study_to_project,
    append_chat_messages,
    append_global_chat_messages,
    create_chat,
    create_global_chat,
    create_project,
    delete_chat,
    delete_global_chat,
    delete_project,
    get_chat,
    get_global_chat,
    get_project,
    get_project_context_summary,
    get_study_detail_cache,
    list_chats,
    list_global_chats,
    list_projects,
    remove_study_from_project,
    update_project,
    update_project_study_data,
    upsert_project_context_summary,
    upsert_project_study_summary,
    upsert_study_detail_cache,
)

load_dotenv()
API_KEY = os.getenv("API_KEY")

app = Flask(__name__)
CORS(app)

client = OpenAI(
    api_key=API_KEY,
    base_url="https://ellm.nrp-nautilus.io/v1"
)
PROJECT_CONTEXT_MAX_CHARS = int(os.getenv("PROJECT_CONTEXT_MAX_CHARS", "12000"))
PROJECT_SUMMARY_GEN_LIMIT = int(os.getenv("PROJECT_SUMMARY_GEN_LIMIT", "5"))
GLOBAL_CONTEXT_MAX_CHARS  = int(os.getenv("GLOBAL_CONTEXT_MAX_CHARS", "24000"))

CHAT_SYSTEM_PROMPT = """You are a helpful assistant for researchers using the Qiita microbiome database.

Your primary goals:
- Help users reason about microbiome concepts, analysis strategies, and how to use Qiita.
- NEVER invent specific Qiita study IDs, titles, sample counts, metadata fields, or publication details.
- When you mention specific studies, ONLY use the study IDs and titles that are explicitly provided to you in the project context.

Behavioral rules:
- If the user asks about a study that is not present in the provided context, say that you do not have that study's details and suggest using the Qiita search interface in this app.
- NEVER list "available studies" unless they are explicitly present in the provided study context for this request.
- If no study context is provided, explicitly say that no studies are currently loaded in chat context and ask the user to use search/select studies.
- NEVER invent external accession IDs (for example PRJEB/PRJNA) or claim database records that were not provided in context.
- When a study context includes metadata fields (for example abstract, PI name, affiliation, lab contact), use them directly to answer user questions and study overviews.
- If a requested field is missing in context, explicitly say it is unavailable instead of guessing.
- If you are unsure about any factual detail, clearly say you are unsure instead of guessing.
- It is always acceptable to answer at a high-level (conceptual explanation) without naming specific studies.
- If the user asks about obviously out-of-domain or fictional entities, make it clear that these are not Qiita studies and do NOT fabricate any matching study records.

When answering:
- Prefer concise, technically accurate explanations.
- Format all responses using Markdown (bold, bullets, code blocks, headers where appropriate).
- Do not output SQL or code unless the user explicitly asks for it."""

GLOBAL_CHAT_SYSTEM_PROMPT = """You are a discovery assistant for the Qiita microbiome database.

Your primary goal is to help researchers find studies from the entire Qiita database that match their scientific criteria.

Behavioral rules:
- You will be given a set of studies retrieved from the database that are relevant to the user's query. Use them to give specific, accurate answers.
- When describing studies, include study ID, title, PI, sample count, data types, and a brief description of scope.
- If no studies were found, say so clearly and suggest rephrasing the search or broadening the criteria.
- NEVER invent study IDs, sample counts, or metadata fields not present in the provided context.
- You may suggest which studies look most relevant to the researcher's goals.
- You may suggest follow-up searches or filtering criteria to narrow or broaden results.
- If the user asks a conceptual question, answer it but also offer to help find relevant studies.

When answering:
- Prefer organized, scannable responses — use tables or bullet lists for multiple studies.
- Format all responses using Markdown (bold, bullets, code blocks, headers where appropriate).
- Be concise about individual studies; prioritize breadth over depth unless asked to go deep on one study.
- Do not output SQL or code unless the user explicitly asks for it."""


def _sse(event: str, payload: dict):
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def _normalize_messages(messages):
    trimmed = messages[-10:] if len(messages) > 10 else list(messages)
    out = []
    for m in trimmed:
        role = m.get("role") or "user"
        if role not in ("user", "assistant"):
            role = "user"
        content = (m.get("content") or "").strip()
        out.append({"role": role, "content": content})
    return out


def _truncate(value, limit):
    if value is None:
        return ""
    text = str(value).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


_STUDY_BLOCK_SKIP_KEYS = {
    "study_id", "study_title", "study_abstract", "pi_name", "pi_email",
    "pi_affiliation", "lab_person_name", "summary_text", "added_at", "updated_at",
    "study_alias", "metadata_complete", "data_types", "num_samples", "num_preps",
    "preps_json", "samples_context",
}


def _study_detail_block(study: dict):
    sid = study.get("study_id")
    title = _truncate(study.get("study_title") or "Untitled study", 160)
    abstract = _truncate(study.get("study_abstract") or "Not available", 900)
    pi_name = _truncate(study.get("pi_name") or "Not available", 120)
    pi_email = _truncate(study.get("pi_email") or "Not available", 140)
    pi_affiliation = _truncate(study.get("pi_affiliation") or "Not available", 200)
    lab_person_name = _truncate(study.get("lab_person_name") or "Not available", 140)

    enriched_lines = []
    data_types = (study.get("data_types") or "").strip()
    num_samples = study.get("num_samples")
    num_preps = study.get("num_preps")
    preps_json = study.get("preps_json") or "[]"

    if data_types:
        enriched_lines.append(f"  Data Types: {data_types}")
    if num_samples is not None:
        enriched_lines.append(f"  Num Samples: {num_samples}")
    if num_preps is not None:
        enriched_lines.append(f"  Num Preps: {num_preps}")
    if preps_json and preps_json != "[]":
        try:
            preps = json.loads(preps_json)
            for p in preps[:5]:
                prep_id = p.get("prep_template_id", "?")
                dtype = p.get("data_type", "?")
                inv_type = p.get("investigation_type") or "N/A"
                status = p.get("preprocessing_status") or "N/A"
                enriched_lines.append(f"    Prep {prep_id}: {dtype} | {inv_type} | {status}")
        except Exception:
            pass

    extra_lines = []
    for key, value in study.items():
        if key in _STUDY_BLOCK_SKIP_KEYS:
            continue
        if value is None:
            continue
        val = _truncate(value, 180)
        if not val:
            continue
        extra_lines.append(f"  {key}: {val}")

    samples_context = (study.get("samples_context") or "").strip()

    return (
        f"- ID {sid}: {title}\n"
        f"  Abstract: {abstract}\n"
        f"  PI: {pi_name}\n"
        f"  PI Email: {pi_email}\n"
        f"  PI Affiliation: {pi_affiliation}\n"
        f"  Lab Contact: {lab_person_name}"
        + (f"\n{chr(10).join(enriched_lines)}" if enriched_lines else "")
        + (f"\n{chr(10).join(extra_lines)}" if extra_lines else "")
        + (f"\n{samples_context}" if samples_context else "")
    )


def _study_seed_text(study: dict):
    sid = study.get("study_id")
    title = _truncate(study.get("study_title") or "Untitled study", 160)
    abstract = _truncate(study.get("study_abstract") or "", 700)
    pi_name = _truncate(study.get("pi_name") or "", 120)
    pi_affiliation = _truncate(study.get("pi_affiliation") or "", 180)
    return (
        f"Study ID: {sid}\n"
        f"Title: {title}\n"
        f"Abstract: {abstract or 'Not available'}\n"
        f"PI: {pi_name or 'Not available'}\n"
        f"Affiliation: {pi_affiliation or 'Not available'}"
    )


def _summarize_text(prompt: str, fallback: str):
    try:
        r = client.chat.completions.create(
            model="qwen3",
            messages=[
                {"role": "system", "content": "Summarize provided study metadata for retrieval context. Be factual and concise. Do not invent details."},
                {"role": "user", "content": prompt},
            ],
        )
        return (r.choices[0].message.content or "").strip() or fallback
    except Exception:
        return fallback


def _generate_study_summary(study: dict):
    fallback = (
        f"ID {study.get('study_id')}: {_truncate(study.get('study_title') or 'Untitled study', 140)}. "
        f"Abstract: {_truncate(study.get('study_abstract') or 'Not available', 260)}"
    )
    prompt = (
        "Create a concise factual summary in 4-6 bullets (max 120 words total). "
        "Include what this study is about, major topic, and any known PI/affiliation fields. "
        "If fields are missing, say unavailable.\n\n"
        f"{_study_seed_text(study)}"
    )
    return _summarize_text(prompt, fallback)


def _generate_project_summary(studies: list):
    seeds = [_study_seed_text(s) for s in studies[:30]]
    fallback = "Project includes multiple Qiita studies. Use detailed study entries when available."
    prompt = (
        "Summarize this project study collection for chat grounding. "
        "Return at most 10 concise bullets with themes, study IDs covered, and known metadata availability.\n\n"
        + "\n\n".join(seeds)
    )
    return _summarize_text(prompt, fallback)


def _build_project_study_context(project: dict, user_id: str = "default"):
    if not project:
        return None
    studies = project.get("studies") or []
    if not studies:
        return None
    project_id = project.get("project_id")
    header = (
        "You have access to the following saved Qiita studies in this project. "
        "When referencing specific studies, ONLY use these IDs and titles:\n"
    )

    # Attach cached sample context to each study dict for the LLM
    for s in studies:
        sid = s.get("study_id")
        if sid and not s.get("samples_context"):
            cached_detail = get_study_detail_cache(sid)
            if cached_detail and cached_detail.get("samples_context"):
                s["samples_context"] = cached_detail["samples_context"]

    detailed_blocks = [_study_detail_block(s) for s in studies]
    full_context = header + "\n".join(detailed_blocks)
    if len(full_context) <= PROJECT_CONTEXT_MAX_CHARS:
        return full_context

    budget = max(1000, PROJECT_CONTEXT_MAX_CHARS - len(header) - 400)
    kept_details = []
    overflow = []
    running = 0
    for idx, block in enumerate(detailed_blocks):
        if running + len(block) <= int(budget * 0.65):
            kept_details.append(block)
            running += len(block)
        else:
            overflow.append((studies[idx], block))

    summary_lines = []
    generated = 0
    for study, _block in overflow:
        summary = (study.get("summary_text") or "").strip()
        if not summary and generated < PROJECT_SUMMARY_GEN_LIMIT and project_id:
            summary = _generate_study_summary(study)
            upsert_project_study_summary(project_id, user_id, study.get("study_id"), summary)
            generated += 1
        if not summary:
            summary = _truncate(study.get("study_abstract") or "Not available", 240)
        summary_lines.append(
            f"- ID {study.get('study_id')}: {_truncate(study.get('study_title') or 'Untitled study', 130)}\n"
            f"  Summary: {_truncate(summary, 480)}"
        )

    candidate_parts = [header]
    if kept_details:
        candidate_parts.append("Detailed studies:\n" + "\n".join(kept_details))
    if summary_lines:
        candidate_parts.append("Summaries for remaining studies:\n" + "\n".join(summary_lines))
    candidate = "\n\n".join(candidate_parts)
    if len(candidate) <= PROJECT_CONTEXT_MAX_CHARS:
        return candidate

    project_summary = None
    if project_id:
        cached = get_project_context_summary(project_id, user_id)
        source_updated_at = project.get("updated_at")
        if cached and cached.get("summary_text") and cached.get("source_updated_at") == source_updated_at:
            project_summary = cached.get("summary_text")
        else:
            project_summary = _generate_project_summary(studies)
            upsert_project_context_summary(project_id, user_id, project_summary, source_updated_at=source_updated_at)

    ids_line = ", ".join(str(s.get("study_id")) for s in studies[:60])
    fallback = (
        header
        + f"Study IDs in this project: {ids_line}\n\n"
        + "Project summary:\n"
        + (project_summary or "No cached summary available.")
    )
    return fallback[:PROJECT_CONTEXT_MAX_CHARS]


def _build_selected_studies_context(selected_studies):
    selected_studies = selected_studies or []
    if not selected_studies:
        return None
    lines = []
    for s in selected_studies[:20]:
        sid = s.get("study_id")
        title = (s.get("study_title") or "").strip()
        abstract = (s.get("study_abstract") or "").strip()
        pi_name = (s.get("pi_name") or "").strip()
        pi_email = (s.get("pi_email") or "").strip()
        pi_affiliation = (s.get("pi_affiliation") or "").strip()
        lab_person_name = (s.get("lab_person_name") or "").strip()
        extra_lines = []
        for key, value in s.items():
            if key in {"study_id", "study_title", "study_abstract", "pi_name", "pi_email", "pi_affiliation", "lab_person_name", "added_at"}:
                continue
            val = _truncate(value, 180)
            if not val:
                continue
            extra_lines.append(f"  {key}: {val}")
        if not sid:
            continue
        title = _truncate(title, 120)
        abstract = _truncate(abstract, 400)
        extra_text = "\n".join(extra_lines)
        lines.append(
            f"- ID {sid}: {title}\n"
            f"  Abstract: {abstract or 'Not available'}\n"
            f"  PI: {pi_name or 'Not available'}\n"
            f"  PI Email: {pi_email or 'Not available'}\n"
            f"  PI Affiliation: {pi_affiliation or 'Not available'}\n"
            f"  Lab Contact: {lab_person_name or 'Not available'}"
            + (f"\n{extra_text}" if extra_text else "")
        )
    if not lines:
        return None
    return (
        "You have access to the following user-selected Qiita studies from global search. "
        "When referencing specific studies, ONLY use these IDs and titles:\n"
        + "\n".join(lines)
    )


def _build_api_messages(messages, study_context_text: str, system_prompt: str = None):
    prompt = system_prompt or CHAT_SYSTEM_PROMPT
    if study_context_text:
        context_block = f"\n\nSTUDY CONTEXT:\n{study_context_text}"
    else:
        context_block = (
            "\n\nSTUDY CONTEXT:\n"
            "No study records were provided for this request. Do not list specific studies."
        )
    system_content = prompt + context_block
    return [{"role": "system", "content": system_content}] + _normalize_messages(messages)


def _build_global_search_context(studies, user_query: str):
    """Build LLM context from auto-searched studies for global chat."""
    if not studies:
        return f'A database search for "{user_query}" returned no matching studies in Qiita. Suggest rephrasing or broadening the query.'
    lines = [f'The following {len(studies)} studies were retrieved from Qiita based on the query "{user_query}":\n']
    running = len(lines[0])
    for s in studies:
        block = _study_detail_block(s)
        if running + len(block) > GLOBAL_CONTEXT_MAX_CHARS:
            break
        lines.append(block)
        running += len(block)
    return "\n".join(lines)


def llm_chat(messages, study_context_text: str, system_prompt: str = None):
    r = client.chat.completions.create(
        model="qwen3", messages=_build_api_messages(messages, study_context_text, system_prompt)
    )
    return (r.choices[0].message.content or "").strip()


def llm_chat_stream(messages, study_context_text: str, system_prompt: str = None):
    stream = client.chat.completions.create(
        model="qwen3",
        messages=_build_api_messages(messages, study_context_text, system_prompt),
        stream=True,
    )
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        token = getattr(delta, "content", None)
        if token:
            yield token


def first_studies(limit=20):
    """Return deterministic first studies by study_id from PostgreSQL."""
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(100, limit))

    with TRN:
        sql = """
        SELECT DISTINCT s.study_id, s.study_title, s.study_abstract,
               s.study_alias, s.metadata_complete,
               sp_pi.name as pi_name, sp_pi.email as pi_email,
               sp_pi.affiliation as pi_affiliation,
               sp_lab.name as lab_person_name,
               (SELECT COUNT(*)
                FROM qiita.study_sample ss
                WHERE ss.study_id = s.study_id) AS num_samples,
               (SELECT STRING_AGG(DISTINCT dt2.data_type, ', ')
                FROM qiita.study_prep_template spt2
                JOIN qiita.prep_template pt2 ON spt2.prep_template_id = pt2.prep_template_id
                JOIN qiita.data_type dt2 ON pt2.data_type_id = dt2.data_type_id
                WHERE spt2.study_id = s.study_id) AS data_types,
               (SELECT COUNT(DISTINCT spt3.prep_template_id)
                FROM qiita.study_prep_template spt3
                WHERE spt3.study_id = s.study_id) AS num_preps
        FROM qiita.study s
        LEFT JOIN qiita.study_person sp_pi
            ON s.principal_investigator_id = sp_pi.study_person_id
        LEFT JOIN qiita.study_person sp_lab
            ON s.lab_person_id = sp_lab.study_person_id
        ORDER BY s.study_id
        LIMIT %s
        """
        TRN.add(sql, [limit])
        results = TRN.execute_fetchindex()

    if not results:
        return []

    studies = []
    for row in results:
        studies.append({
            "study_id": row[0],
            "study_title": row[1],
            "study_abstract": row[2],
            "study_alias": row[3],
            "metadata_complete": row[4],
            "pi_name": row[5],
            "pi_email": row[6],
            "pi_affiliation": row[7],
            "lab_person_name": row[8],
            "num_samples": row[9],
            "data_types": row[10],
            "num_preps": row[11],
        })
    return studies


def _fetch_study_samples(study_id: int, limit: int = 200):
    """Return sample list for a study using dynamic sample_{study_id} table."""
    study_id = int(study_id)
    total = 0
    samples = []
    try:
        with TRN:
            TRN.add(
                "SELECT COUNT(*) FROM qiita.study_sample WHERE study_id = %s",
                [study_id],
            )
            cnt = TRN.execute_fetchindex()
        total = cnt[0][0] if cnt else 0
    except Exception:
        return [], 0

    try:
        with TRN:
            # Dynamic table — study_id is already cast to int so safe to interpolate
            TRN.add(
                f"""
                SELECT ss.sample_id,
                       sm.sample_values->>'anonymized_name'    AS anonymized_name,
                       sm.sample_values->>'collection_timestamp' AS collection_timestamp,
                       sm.sample_values->>'env_package'        AS env_package
                FROM qiita.study_sample ss
                JOIN qiita.sample_{study_id} sm ON ss.sample_id = sm.sample_id
                WHERE ss.study_id = %s
                ORDER BY ss.sample_id
                LIMIT %s
                """,
                [study_id, limit],
            )
            rows = TRN.execute_fetchindex()
        samples = [
            {
                "sample_id": r[0],
                "anonymized_name": r[1],
                "collection_timestamp": r[2],
                "env_package": r[3],
            }
            for r in (rows or [])
        ]
    except Exception:
        pass

    return samples, total


def _fetch_prep_metadata_summary(prep_template_id: int):
    """Return one row of sequencing metadata for a prep template (platform, target_gene, etc.)."""
    prep_template_id = int(prep_template_id)
    try:
        with TRN:
            TRN.add(
                f"""
                SELECT pm.sample_values->>'platform'         AS platform,
                       pm.sample_values->>'target_gene'      AS target_gene,
                       pm.sample_values->>'instrument_model' AS instrument_model,
                       pm.sample_values->>'target_subfragment' AS target_subfragment
                FROM qiita.prep_template_sample pts
                JOIN qiita.prep_{prep_template_id} pm ON pts.sample_id = pm.sample_id
                WHERE pts.prep_template_id = %s
                LIMIT 1
                """,
                [prep_template_id],
            )
            rows = TRN.execute_fetchindex()
        if rows:
            r = rows[0]
            return {
                "platform": r[0],
                "target_gene": r[1],
                "instrument_model": r[2],
                "target_subfragment": r[3],
            }
    except Exception:
        pass
    return {}


def _build_samples_context_text(samples_with_values: list, total: int, max_chars: int = 3500) -> str:
    """Format sample metadata dicts into a compact LLM-readable text block."""
    if not samples_with_values:
        return ""
    _skip = {"qiita_study_id"}
    lines = [f"  Samples ({total} total, showing {len(samples_with_values)}):"]
    for s in samples_with_values:
        sid = s.get("sample_id", "?")
        fields = s.get("fields") or {}
        parts = []
        for k, v in sorted(fields.items()):
            if k in _skip or v is None:
                continue
            val = str(v).strip()
            if not val or val.lower() in ("none", "null", "nan", "not applicable", "not provided"):
                continue
            parts.append(f"{k}={_truncate(val, 60)}")
        lines.append(f"    {sid}: " + ", ".join(parts))
    text = "\n".join(lines)
    if len(text) > max_chars:
        text = text[: max_chars - 3] + "..."
    return text


def _fetch_sample_context_text(study_id: int, max_chars: int = 3500) -> str:
    """Fetch all sample metadata fields from Qiita and return compact context text."""
    study_id = int(study_id)
    try:
        with TRN:
            TRN.add(
                "SELECT COUNT(*) FROM qiita.study_sample WHERE study_id = %s",
                [study_id],
            )
            cnt = TRN.execute_fetchindex()
        total = cnt[0][0] if cnt else 0
    except Exception:
        return ""

    try:
        with TRN:
            TRN.add(
                f"""
                SELECT ss.sample_id, sm.sample_values
                FROM qiita.study_sample ss
                JOIN qiita.sample_{study_id} sm ON ss.sample_id = sm.sample_id
                WHERE ss.study_id = %s
                  AND ss.sample_id <> 'qiita_sample_column_names'
                ORDER BY ss.sample_id
                LIMIT 200
                """,
                [study_id],
            )
            rows = TRN.execute_fetchindex()
        samples = [{"sample_id": r[0], "fields": dict(r[1])} for r in (rows or [])]
        return _build_samples_context_text(samples, total, max_chars=max_chars)
    except Exception:
        return ""


def _fetch_study_detail_from_qiita(study_id: int):
    """Run prep.sql and artifacts.sql queries for a study and return (preps, artifacts)."""
    preps = []
    artifacts = []
    try:
        with TRN:
            TRN.add(
                """
                SELECT pt.prep_template_id, pt.name AS prep_name,
                       dt.data_type, pt.investigation_type,
                       pt.preprocessing_status,
                       pt.creation_timestamp, pt.modification_timestamp
                FROM qiita.study_prep_template spt
                JOIN qiita.prep_template pt ON spt.prep_template_id = pt.prep_template_id
                JOIN qiita.data_type dt ON pt.data_type_id = dt.data_type_id
                WHERE spt.study_id = %s
                ORDER BY pt.prep_template_id
                """,
                [study_id],
            )
            rows = TRN.execute_fetchindex()
        preps = [
            {
                "prep_template_id": r[0],
                "prep_name": r[1],
                "data_type": r[2],
                "investigation_type": r[3],
                "preprocessing_status": r[4],
                "creation_timestamp": str(r[5]) if r[5] else None,
                "modification_timestamp": str(r[6]) if r[6] else None,
            }
            for r in (rows or [])
        ]
    except Exception:
        import traceback; traceback.print_exc()

    try:
        with TRN:
            TRN.add(
                """
                SELECT pt.prep_template_id, pt.name AS prep_name,
                       a.artifact_id, at.artifact_type, dt.data_type,
                       dd.mountpoint || '/' || a.artifact_id || '/' || f.filepath AS full_path,
                       a.generated_timestamp
                FROM qiita.study_prep_template spt
                JOIN qiita.prep_template pt ON spt.prep_template_id = pt.prep_template_id
                JOIN qiita.data_type dt ON pt.data_type_id = dt.data_type_id
                JOIN qiita.preparation_artifact pa ON pt.prep_template_id = pa.prep_template_id
                JOIN qiita.artifact a ON pa.artifact_id = a.artifact_id
                JOIN qiita.artifact_type at ON a.artifact_type_id = at.artifact_type_id
                JOIN qiita.artifact_filepath af ON a.artifact_id = af.artifact_id
                JOIN qiita.filepath f ON af.filepath_id = f.filepath_id
                JOIN qiita.data_directory dd ON f.data_directory_id = dd.data_directory_id
                WHERE spt.study_id = %s
                ORDER BY pt.prep_template_id, a.artifact_id
                """,
                [study_id],
            )
            rows = TRN.execute_fetchindex()
        artifacts = [
            {
                "prep_template_id": r[0],
                "prep_name": r[1],
                "artifact_id": r[2],
                "artifact_type": r[3],
                "data_type": r[4],
                "full_path": r[5],
                "generated_timestamp": str(r[6]) if r[6] else None,
            }
            for r in (rows or [])
        ]
    except Exception:
        import traceback; traceback.print_exc()

    return preps, artifacts


@app.route('/api/studies/<int:study_id>/detail', methods=['GET'])
def api_study_detail(study_id):
    """Return prep templates, artifacts, and samples for a study, with SQLite caching for preps/artifacts."""
    # --- preps + artifacts (cached) ---
    cached = get_study_detail_cache(study_id)
    if cached:
        preps = json.loads(cached.get("preps_json") or "[]")
        artifacts = json.loads(cached.get("artifacts_json") or "[]")
        cache_hit = True
    else:
        try:
            preps, artifacts = _fetch_study_detail_from_qiita(study_id)
            upsert_study_detail_cache(study_id, json.dumps(preps), json.dumps(artifacts))
            cache_hit = False
        except Exception as e:
            import traceback; traceback.print_exc()
            return jsonify({"error": str(e)}), 500

    # Attach per-prep sequencing metadata (platform, target_gene, instrument)
    for prep in preps:
        pid = prep.get("prep_template_id")
        if pid is not None:
            prep.update(_fetch_prep_metadata_summary(pid))

    # --- samples (always fetched fresh — not cached, can be large) ---
    samples, total_samples = _fetch_study_samples(study_id, limit=200)

    # Cache sample context text for LLM if not already present
    if not (cached and cached.get("samples_context")):
        samples_ctx = _fetch_sample_context_text(study_id)
        if samples_ctx:
            upsert_study_detail_cache(
                study_id,
                json.dumps(preps),
                json.dumps(artifacts),
                samples_context=samples_ctx,
            )

    return jsonify({
        "study_id": study_id,
        "preps": preps,
        "artifacts": artifacts,
        "samples": samples,
        "total_samples": total_samples,
        "cached": cache_hit,
    })


@app.route('/api/studies/<int:study_id>/samples/<path:sample_id>', methods=['GET'])
def api_sample_detail(study_id, sample_id):
    """Return all metadata fields for a single sample from qiita.sample_{study_id}."""
    try:
        with TRN:
            TRN.add(f"""
                SELECT sample_values
                FROM qiita.sample_{study_id}
                WHERE sample_id = %s
                  AND sample_id <> 'qiita_sample_column_names'
            """, [sample_id])
            rows = TRN.execute_fetchindex()
        if not rows:
            return jsonify({'error': 'Sample not found'}), 404
        fields = dict(rows[0][0])
        fields.pop('qiita_study_id', None)
        return jsonify({'sample_id': sample_id, 'fields': fields})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/search', methods=['POST'])
def search():
    try:
        data = request.get_json() or {}
        user_query = data.get('query', '')

        if not user_query:
            return jsonify({'error': 'Query is required'}), 400

        sql_query = llm_query_to_sql(user_query)
        where_clause = sql_query.get('where_clause') or '1=1'
        params = sql_query.get('params') if isinstance(sql_query.get('params'), list) else []
        results = search_studies_with_sql(custom_sql_where=where_clause, params=params)

        return jsonify({
            'results': results if isinstance(results, list) else [],
            'sql_query': sql_query,
            'count': len(results) if isinstance(results, list) else 0
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/studies/first', methods=['GET'])
def api_first_studies():
    try:
        limit = request.args.get('limit', 20)
        rows = first_studies(limit=limit)
        return jsonify({
            "results": rows,
            "count": len(rows),
            "limit": max(1, min(100, int(limit) if str(limit).isdigit() else 20)),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# --- Projects API ---

@app.route('/api/projects', methods=['GET'])
def api_list_projects():
    user_id = request.args.get('user_id') or 'default'
    return jsonify({'projects': list_projects(user_id)})


@app.route('/api/projects', methods=['POST'])
def api_create_project():
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    name = (data.get('name') or 'Untitled').strip() or 'Untitled'
    proj = create_project(user_id, name)
    if not proj:
        return jsonify({'error': 'Failed to create project'}), 500
    return jsonify(proj)


@app.route('/api/projects/<project_id>', methods=['GET'])
def api_get_project(project_id):
    user_id = request.args.get('user_id') or 'default'
    proj = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(proj)


@app.route('/api/projects/<project_id>', methods=['PATCH'])
def api_update_project(project_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    name = data.get('name')
    proj = update_project(project_id, user_id, name=name)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(proj)


@app.route('/api/projects/<project_id>', methods=['DELETE'])
def api_delete_project(project_id):
    user_id = (
        request.args.get('user_id')
        or (request.get_json(silent=True) or {}).get('user_id')
        or 'default'
    )
    delete_project(project_id, user_id)
    return jsonify({'ok': True})


_bg_executor = ThreadPoolExecutor(max_workers=4)


def _enrich_study_in_project(project_id: str, study_id: int):
    """Background task: fetch num_samples + prep detail from Qiita and update project_studies."""
    # num_samples
    num_samples = None
    try:
        with TRN:
            TRN.add(
                "SELECT COUNT(*) FROM qiita.study_sample WHERE study_id = %s",
                [int(study_id)],
            )
            cnt = TRN.execute_fetchindex()
        num_samples = cnt[0][0] if cnt else 0
    except Exception:
        pass

    # preps + artifacts
    preps = []
    try:
        cached = get_study_detail_cache(study_id)
        if cached:
            preps = json.loads(cached.get("preps_json") or "[]")
        else:
            preps, artifacts = _fetch_study_detail_from_qiita(study_id)
            upsert_study_detail_cache(study_id, json.dumps(preps), json.dumps(artifacts))
    except Exception:
        pass

    data_types = None
    num_preps = None
    preps_json = None
    if preps:
        types = sorted({p.get("data_type") for p in preps if p.get("data_type")})
        data_types = ", ".join(types) or None
        num_preps = len(preps)
        preps_json = json.dumps(preps)

    update_project_study_data(
        project_id,
        study_id,
        data_types=data_types,
        num_samples=num_samples,
        num_preps=num_preps,
        preps_json=preps_json,
    )


@app.route('/api/projects/<project_id>/studies', methods=['POST'])
def api_add_study(project_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    study = data.get('study')
    if not study or study.get('study_id') is None:
        return jsonify({'error': 'study with study_id required'}), 400

    proj = add_study_to_project(project_id, user_id, study)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404

    # Kick off enrichment in background (non-blocking)
    study_id = study.get('study_id')
    _bg_executor.submit(_enrich_study_in_project, project_id, int(study_id))

    return jsonify(proj)


@app.route('/api/projects/<project_id>/studies/enrich-all', methods=['POST'])
def api_enrich_all_studies(project_id):
    """Re-fetch enriched data (num_samples, data_types, preps) for all studies in a project."""
    data = request.get_json(silent=True) or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    proj = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404

    studies = proj.get('studies') or []
    futures = []
    for s in studies:
        sid = s.get('study_id')
        if sid is not None:
            futures.append(_bg_executor.submit(_enrich_study_in_project, project_id, int(sid)))

    # Wait for all enrichment to finish, then return updated project
    for f in futures:
        try:
            f.result(timeout=30)
        except Exception:
            pass

    updated = get_project(project_id, user_id)
    return jsonify({'ok': True, 'updated': len(futures), 'project': updated})


@app.route('/api/projects/<project_id>/studies/<int:study_id>', methods=['DELETE'])
def api_remove_study(project_id, study_id):
    user_id = request.args.get('user_id') or 'default'
    proj = remove_study_from_project(project_id, user_id, study_id)
    if proj is None:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(proj)


@app.route('/api/projects/<project_id>/summaries/rebuild', methods=['POST'])
def api_rebuild_project_summaries(project_id):
    data = request.get_json(silent=True) or {}
    user_id = (data.get('user_id') or request.args.get('user_id') or 'default').strip() or 'default'
    proj = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404

    studies = proj.get('studies') or []

    def _rebuild_one(study):
        summary = _generate_study_summary(study)
        upsert_project_study_summary(project_id, user_id, study.get('study_id'), summary)
        return True

    with ThreadPoolExecutor() as pool:
        rebuilt = sum(pool.map(_rebuild_one, studies))

    project_summary = _generate_project_summary(studies)
    upsert_project_context_summary(
        project_id,
        user_id,
        project_summary,
        source_updated_at=proj.get('updated_at'),
    )
    return jsonify({
        'ok': True,
        'project_id': project_id,
        'study_summaries_rebuilt': rebuilt,
    })


# --- Project Chats API ---

@app.route('/api/projects/<project_id>/chats', methods=['GET'])
def api_list_chats(project_id):
    user_id = request.args.get('user_id') or 'default'
    chats = list_chats(project_id, user_id)
    return jsonify({'chats': chats})


@app.route('/api/projects/<project_id>/chats', methods=['POST'])
def api_create_chat(project_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    proj = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404
    first_message = (data.get('message') or data.get('first_message') or '').strip()
    chat = create_chat(project_id, user_id, first_message or data.get('title'))
    if first_message:
        study_ctx = _build_project_study_context(proj, user_id=user_id)
        assistant_content = llm_chat([{"role": "user", "content": first_message}], study_context_text=study_ctx)
        append_chat_messages(project_id, user_id, chat["chat_id"], first_message, assistant_content)
        chat = get_chat(project_id, user_id, chat["chat_id"])
    return jsonify(chat)


@app.route('/api/projects/<project_id>/chats/<chat_id>', methods=['GET'])
def api_get_chat(project_id, chat_id):
    user_id = request.args.get('user_id') or 'default'
    chat = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    return jsonify(chat)


@app.route('/api/projects/<project_id>/chats/<chat_id>', methods=['DELETE'])
def api_delete_chat(project_id, chat_id):
    user_id = request.args.get('user_id') or 'default'
    delete_chat(project_id, user_id, chat_id)
    return jsonify({'ok': True})


@app.route('/api/projects/<project_id>/chats/<chat_id>/message', methods=['POST'])
def api_chat_message(project_id, chat_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    user_content = (data.get('message') or data.get('content') or '').strip()
    if not user_content:
        return jsonify({'error': 'message required'}), 400
    chat = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    proj = get_project(project_id, user_id)
    study_ctx = _build_project_study_context(proj, user_id=user_id)
    messages = chat.get('messages') or []
    full_messages = [{"role": m.get("role"), "content": m.get("content")} for m in messages]
    full_messages.append({"role": "user", "content": user_content})
    assistant_content = llm_chat(full_messages, study_context_text=study_ctx)
    append_chat_messages(project_id, user_id, chat_id, user_content, assistant_content)
    updated = get_chat(project_id, user_id, chat_id)
    return jsonify(updated)


@app.route('/api/projects/<project_id>/chats/<chat_id>/message/stream', methods=['POST'])
def api_chat_message_stream(project_id, chat_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    user_content = (data.get('message') or data.get('content') or '').strip()
    if not user_content:
        return jsonify({'error': 'message required'}), 400

    chat = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    proj = get_project(project_id, user_id)
    study_ctx = _build_project_study_context(proj, user_id=user_id)
    messages = chat.get('messages') or []
    full_messages = [{"role": m.get("role"), "content": m.get("content")} for m in messages]
    full_messages.append({"role": "user", "content": user_content})

    def generate():
        assistant_parts = []
        try:
            for token in llm_chat_stream(full_messages, study_context_text=study_ctx):
                assistant_parts.append(token)
                yield _sse("token", {"token": token})
            assistant_content = "".join(assistant_parts).strip()
            append_chat_messages(project_id, user_id, chat_id, user_content, assistant_content)
            yield _sse("done", {"chat_id": chat_id, "persisted": True})
        except Exception as e:
            yield _sse("error", {"error": str(e)})

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route('/api/projects/<project_id>/chats/stream', methods=['POST'])
def api_create_chat_stream(project_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    user_content = (data.get('message') or data.get('content') or '').strip()
    if not user_content:
        return jsonify({'error': 'message required'}), 400

    proj = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404

    chat = create_chat(project_id, user_id, user_content)
    if not chat:
        return jsonify({'error': 'Failed to create chat'}), 500

    study_ctx = _build_project_study_context(proj, user_id=user_id)

    def generate():
        assistant_parts = []
        try:
            for token in llm_chat_stream([{"role": "user", "content": user_content}], study_context_text=study_ctx):
                assistant_parts.append(token)
                yield _sse("token", {"token": token, "chat_id": chat["chat_id"]})
            assistant_content = "".join(assistant_parts).strip()
            append_chat_messages(project_id, user_id, chat["chat_id"], user_content, assistant_content)
            yield _sse("done", {"chat_id": chat["chat_id"], "persisted": True})
        except Exception as e:
            yield _sse("error", {"error": str(e), "chat_id": chat["chat_id"]})

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- Global Chats API ---

@app.route('/api/global-chats', methods=['GET'])
def api_list_global_chats():
    user_id = request.args.get('user_id') or 'default'
    return jsonify({'chats': list_global_chats(user_id)})


@app.route('/api/global-chats', methods=['POST'])
def api_create_global_chat():
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    title = data.get('title')
    chat = create_global_chat(user_id, title=title)
    if not chat:
        return jsonify({'error': 'Failed to create global chat'}), 500
    return jsonify(chat)


@app.route('/api/global-chats/<chat_id>', methods=['GET'])
def api_get_global_chat(chat_id):
    user_id = request.args.get('user_id') or 'default'
    chat = get_global_chat(user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    return jsonify(chat)


@app.route('/api/global-chats/<chat_id>', methods=['DELETE'])
def api_delete_global_chat(chat_id):
    user_id = request.args.get('user_id') or 'default'
    delete_global_chat(user_id, chat_id)
    return jsonify({'ok': True})


@app.route('/api/global-chats/<chat_id>/message/stream', methods=['POST'])
def api_global_chat_message_stream(chat_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    user_content = (data.get('message') or data.get('content') or '').strip()
    if not user_content:
        return jsonify({'error': 'message required'}), 400

    chat = get_global_chat(user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    # Auto-search the Qiita DB based on the user's message before streaming
    try:
        sql_spec = llm_query_to_sql(user_content)
        studies = search_studies_with_sql(
            sql_spec.get("where_clause", "1=1"),
            sql_spec.get("params", [])
        )
    except Exception:
        studies = []

    study_ctx = _build_global_search_context(studies, user_content)
    messages = chat.get('messages') or []
    full_messages = [{"role": m.get("role"), "content": m.get("content")} for m in messages]
    full_messages.append({"role": "user", "content": user_content})

    def generate():
        assistant_parts = []
        try:
            for token in llm_chat_stream(
                full_messages,
                study_context_text=study_ctx,
                system_prompt=GLOBAL_CHAT_SYSTEM_PROMPT,
            ):
                assistant_parts.append(token)
                yield _sse("token", {"token": token})
            assistant_content = "".join(assistant_parts).strip()
            append_global_chat_messages(user_id, chat_id, user_content, assistant_content)
            yield _sse("done", {"chat_id": chat_id, "persisted": True})
        except Exception as e:
            yield _sse("error", {"error": str(e)})

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == '__main__':
    print("QIITA SEARCH API -- http://localhost:5001")
    app.run(debug=False, host='0.0.0.0', port=5001, use_reloader=False)
