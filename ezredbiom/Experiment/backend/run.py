# backend/run.py
from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS
from openai import OpenAI
from qiita_db.sql_connection import TRN
import json
from dotenv import load_dotenv
import os

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
    list_chats,
    list_global_chats,
    list_projects,
    remove_study_from_project,
    update_project,
    upsert_project_context_summary,
    upsert_project_study_summary,
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
- Use bullet points and short paragraphs where helpful.
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


def _study_detail_block(study: dict):
    sid = study.get("study_id")
    title = _truncate(study.get("study_title") or "Untitled study", 160)
    abstract = _truncate(study.get("study_abstract") or "Not available", 900)
    pi_name = _truncate(study.get("pi_name") or "Not available", 120)
    pi_email = _truncate(study.get("pi_email") or "Not available", 140)
    pi_affiliation = _truncate(study.get("pi_affiliation") or "Not available", 200)
    lab_person_name = _truncate(study.get("lab_person_name") or "Not available", 140)

    extra_lines = []
    for key, value in study.items():
        if key in {"study_id", "study_title", "study_abstract", "pi_name", "pi_email", "pi_affiliation", "lab_person_name", "summary_text", "added_at", "updated_at"}:
            continue
        if value is None:
            continue
        val = _truncate(value, 180)
        if not val:
            continue
        extra_lines.append(f"  {key}: {val}")

    return (
        f"- ID {sid}: {title}\n"
        f"  Abstract: {abstract}\n"
        f"  PI: {pi_name}\n"
        f"  PI Email: {pi_email}\n"
        f"  PI Affiliation: {pi_affiliation}\n"
        f"  Lab Contact: {lab_person_name}"
        + (f"\n{chr(10).join(extra_lines)}" if extra_lines else "")
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
            model="gemma3",
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
            if value is None:
                continue
            val = str(value).strip()
            if not val:
                continue
            if len(val) > 180:
                val = val[:177] + "..."
            extra_lines.append(f"  {key}: {val}")
        if not sid:
            continue
        if len(title) > 120:
            title = title[:117] + "..."
        if len(abstract) > 400:
            abstract = abstract[:397] + "..."
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


def llm_chat(messages, study_context_text: str):
    system_content = CHAT_SYSTEM_PROMPT
    if study_context_text:
        system_content = f"{system_content}\n\nSTUDY CONTEXT:\n{study_context_text}"
    else:
        system_content = (
            f"{system_content}\n\nSTUDY CONTEXT:\n"
            "No study records were provided for this request. Do not list specific studies."
        )

    api_messages = [{"role": "system", "content": system_content}]
    api_messages.extend(_normalize_messages(messages))

    r = client.chat.completions.create(model="gemma3", messages=api_messages)
    return (r.choices[0].message.content or "").strip()


def llm_chat_stream(messages, study_context_text: str):
    system_content = CHAT_SYSTEM_PROMPT
    if study_context_text:
        system_content = f"{system_content}\n\nSTUDY CONTEXT:\n{study_context_text}"
    else:
        system_content = (
            f"{system_content}\n\nSTUDY CONTEXT:\n"
            "No study records were provided for this request. Do not list specific studies."
        )

    api_messages = [{"role": "system", "content": system_content}]
    api_messages.extend(_normalize_messages(messages))

    stream = client.chat.completions.create(
        model="gemma3",
        messages=api_messages,
        stream=True,
    )
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        token = getattr(delta, "content", None)
        if token:
            yield token


def search_studies_with_sql(custom_sql_where="", params=None):
    if params is None:
        params = []

    with TRN:
        sql = f"""
        SELECT DISTINCT s.study_id, s.study_title, s.study_abstract,
               sp_pi.name as pi_name, sp_pi.email as pi_email,
               sp_pi.affiliation as pi_affiliation,
               sp_lab.name as lab_person_name
        FROM qiita.study s
        LEFT JOIN qiita.study_person sp_pi
            ON s.principal_investigator_id = sp_pi.study_person_id
        LEFT JOIN qiita.study_person sp_lab
            ON s.lab_person_id = sp_lab.study_person_id
        LEFT JOIN qiita.study_artifact sa ON s.study_id = sa.study_id
        LEFT JOIN qiita.artifact a ON sa.artifact_id = a.artifact_id
        LEFT JOIN qiita.visibility v ON a.visibility_id = v.visibility_id
        WHERE {custom_sql_where if custom_sql_where else '1=1'}
        ORDER BY s.study_id
        """
        TRN.add(sql, params)
        results = TRN.execute_fetchindex()

    if not results:
        return []

    studies = []
    for row in results:
        studies.append({
            "study_id": row[0],
            "study_title": row[1],
            "study_abstract": row[2],
            "pi_name": row[3],
            "pi_email": row[4],
            "pi_affiliation": row[5],
            "lab_person_name": row[6],
        })
    return studies


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
               sp_pi.name as pi_name, sp_pi.email as pi_email,
               sp_pi.affiliation as pi_affiliation,
               sp_lab.name as lab_person_name
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
            "pi_name": row[3],
            "pi_email": row[4],
            "pi_affiliation": row[5],
            "lab_person_name": row[6],
        })
    return studies


def llm_query_to_sql(user_query):
    system_prompt = """You are a SQL query generator for a microbiome study database (Qiita).

        Available tables and columns:
        - s.study_id (integer)
        - s.study_title (text)
        - s.study_abstract (text)
        - sp_pi.name (text) - Principal Investigator name
        - sp_pi.email (text) - PI email
        - sp_pi.affiliation (text) - PI institution
        - sp_lab.name (text) - Lab person name
        - v.visibility (text) - Values: 'public', 'private', 'sandbox', 'awaiting_approval'

        Your task:
        1. Convert the user's natural language query into a PostgreSQL WHERE clause
        2. Use ILIKE for case-insensitive text matching (e.g., field ILIKE '%keyword%')
        3. Use parameterized queries with %s placeholders
        4. Return ONLY a JSON object with 'where_clause' and 'params' fields

        Examples:

        User: "Find studies about soil microbiome"
        Response: {
        "where_clause": "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s)",
        "params": ["%soil%", "%soil%"]
        }

        User: "Studies by Rob Knight"
        Response: {
        "where_clause": "sp_pi.name ILIKE %s",
        "params": ["%Rob Knight%"]
        }

        Return ONLY valid JSON, no other text."""

    message = client.chat.completions.create(
        model="gemma3",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query}
        ]
    )

    raw = message.choices[0].message.content
    if raw is None:
        raw = ""
    response_text = (raw or "").strip()
    if not response_text:
        response_text = "{}"
    if response_text.startswith("```"):
        parts = response_text.split("```")
        response_text = parts[1] if len(parts) > 1 else response_text
        if response_text.startswith("json"):
            response_text = response_text[4:]
        response_text = response_text.strip()

    try:
        out = json.loads(response_text)
        if not isinstance(out, dict) or "where_clause" not in out or "params" not in out:
            raise ValueError("missing where_clause or params")
        return out
    except (json.JSONDecodeError, ValueError):
        keywords = user_query.lower().replace("find", "").replace("studies", "").replace("about", "").strip()
        if not keywords:
            keywords = user_query.strip() or "%"
        return {
            "where_clause": "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s)",
            "params": [f"%{keywords}%", f"%{keywords}%"],
        }


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
    user_id = request.args.get('user_id') or request.get_json(silent=True) or {}
    if isinstance(user_id, dict):
        user_id = user_id.get('user_id') or 'default'
    else:
        user_id = user_id or 'default'
    delete_project(project_id, user_id)
    return jsonify({'ok': True})


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
    return jsonify(proj)


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
    rebuilt = 0
    for study in studies:
        summary = _generate_study_summary(study)
        if upsert_project_study_summary(project_id, user_id, study.get('study_id'), summary):
            rebuilt += 1

    refreshed_proj = get_project(project_id, user_id)
    project_summary = _generate_project_summary(refreshed_proj.get('studies') or [])
    upsert_project_context_summary(
        project_id,
        user_id,
        project_summary,
        source_updated_at=refreshed_proj.get('updated_at'),
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
    selected_studies = data.get('selected_studies') or []
    if not user_content:
        return jsonify({'error': 'message required'}), 400

    chat = get_global_chat(user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    study_ctx = _build_selected_studies_context(selected_studies)
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
