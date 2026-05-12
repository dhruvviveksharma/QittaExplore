"""LLM context builders, SSE formatter, and streaming wrappers."""

import json

from config import (
    client,
    CHAT_SYSTEM_PROMPT,
    PROJECT_CONTEXT_MAX_CHARS,
    GLOBAL_CONTEXT_MAX_CHARS,
    DEFAULT_MODEL,
    ALLOWED_MODELS,
)


def _resolve_model(model):
    if model and model in ALLOWED_MODELS:
        return model
    return DEFAULT_MODEL


def friendly_llm_error(exc, model=None):
    raw = str(exc) or exc.__class__.__name__
    lowered = raw.lower()
    connection_markers = (
        "upstream connect error",
        "connection refused",
        "remote connection failure",
        "delayed connect error",
        "connection reset",
        "service unavailable",
        "502", "503", "504",
    )
    if any(m in lowered for m in connection_markers):
        name = model or "the selected model"
        return f"{name} is currently unavailable on NRP-Nautilus. Try selecting a different model from the dropdown below the chat box."
    return raw
from store import (
    get_project_context_summary,
    get_study_detail_cache,
    upsert_study_detail_cache,
)


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
    title         = _truncate(study.get("study_title") or "Untitled study", 160)
    abstract      = _truncate(study.get("study_abstract") or "Not available", 900)
    pi_name       = _truncate(study.get("pi_name") or "Not available", 120)
    pi_email      = _truncate(study.get("pi_email") or "Not available", 140)
    pi_affiliation= _truncate(study.get("pi_affiliation") or "Not available", 200)
    lab_person    = _truncate(study.get("lab_person_name") or "Not available", 140)

    enriched_lines = []
    data_types  = (study.get("data_types") or "").strip()
    num_samples = study.get("num_samples")
    num_preps   = study.get("num_preps")
    preps_json  = study.get("preps_json") or "[]"

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
                prep_id  = p.get("prep_template_id", "?")
                dtype    = p.get("data_type", "?")
                inv_type = p.get("investigation_type") or "N/A"
                status   = p.get("preprocessing_status") or "N/A"
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
        f"  Lab Contact: {lab_person}"
        + (f"\n{chr(10).join(enriched_lines)}" if enriched_lines else "")
        + (f"\n{chr(10).join(extra_lines)}" if extra_lines else "")
        + (f"\n{samples_context}" if samples_context else "")
    )


def _study_seed_text(study: dict):
    sid           = study.get("study_id")
    title         = _truncate(study.get("study_title") or "Untitled study", 160)
    abstract      = _truncate(study.get("study_abstract") or "", 700)
    pi_name       = _truncate(study.get("pi_name") or "", 120)
    pi_affiliation= _truncate(study.get("pi_affiliation") or "", 180)
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
            model=DEFAULT_MODEL,
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
    seeds    = [_study_seed_text(s) for s in studies[:30]]
    fallback = "Project includes multiple Qiita studies. Use detailed study entries when available."
    prompt   = (
        "Summarize this project study collection for chat grounding. "
        "Return at most 10 concise bullets with themes, study IDs covered, and known metadata availability.\n\n"
        + "\n\n".join(seeds)
    )
    return _summarize_text(prompt, fallback)


def _build_project_study_context(project: dict, user_id: str = "default"):
    if not project:
        return None
    studies    = project.get("studies") or []
    if not studies:
        return None
    project_id = project.get("project_id")

    # Lazy-import to avoid circular dependency at module load time
    from helpers.qiita_fetch import _fetch_sample_context_text

    for s in studies:
        sid = s.get("study_id")
        if sid and not s.get("samples_context"):
            cached_detail = get_study_detail_cache(sid)
            if cached_detail and cached_detail.get("samples_context"):
                s["samples_context"] = cached_detail["samples_context"]
            else:
                ctx = _fetch_sample_context_text(sid)
                if ctx:
                    s["samples_context"] = ctx
                    upsert_study_detail_cache(sid, None, None, samples_context=ctx)

    header         = (
        "You have access to the following saved Qiita studies in this project. "
        "When referencing specific studies, ONLY use these IDs and titles:\n"
    )
    detailed_blocks = [_study_detail_block(s) for s in studies]
    full_context    = header + "\n".join(detailed_blocks)
    if len(full_context) <= PROJECT_CONTEXT_MAX_CHARS:
        return full_context

    budget      = max(1000, PROJECT_CONTEXT_MAX_CHARS - len(header) - 400)
    kept_details = []
    overflow     = []
    running      = 0
    for idx, block in enumerate(detailed_blocks):
        if running + len(block) <= int(budget * 0.65):
            kept_details.append(block)
            running += len(block)
        else:
            overflow.append((studies[idx], block))

    summary_lines = []
    for study, _block in overflow:
        summary = (study.get("summary_text") or "").strip()
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

    project_summary    = None
    if project_id:
        cached             = get_project_context_summary(project_id, user_id)
        source_updated_at  = project.get("updated_at")
        if cached and cached.get("summary_text") and cached.get("source_updated_at") == source_updated_at:
            project_summary = cached.get("summary_text")

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
        sid            = s.get("study_id")
        title          = (s.get("study_title") or "").strip()
        abstract       = (s.get("study_abstract") or "").strip()
        pi_name        = (s.get("pi_name") or "").strip()
        pi_email       = (s.get("pi_email") or "").strip()
        pi_affiliation = (s.get("pi_affiliation") or "").strip()
        lab_person     = (s.get("lab_person_name") or "").strip()
        extra_lines    = []
        for key, value in s.items():
            if key in {"study_id", "study_title", "study_abstract", "pi_name", "pi_email",
                       "pi_affiliation", "lab_person_name", "added_at"}:
                continue
            val = _truncate(value, 180)
            if not val:
                continue
            extra_lines.append(f"  {key}: {val}")
        if not sid:
            continue
        title    = _truncate(title, 120)
        abstract = _truncate(abstract, 400)
        lines.append(
            f"- ID {sid}: {title}\n"
            f"  Abstract: {abstract or 'Not available'}\n"
            f"  PI: {pi_name or 'Not available'}\n"
            f"  PI Email: {pi_email or 'Not available'}\n"
            f"  PI Affiliation: {pi_affiliation or 'Not available'}\n"
            f"  Lab Contact: {lab_person or 'Not available'}"
            + (f"\n{''.join(extra_lines)}" if extra_lines else "")
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
    lines   = [f'The following {len(studies)} studies were retrieved from Qiita based on the query "{user_query}":\n']
    running = len(lines[0])
    for s in studies:
        block = _study_detail_block(s)
        if running + len(block) > GLOBAL_CONTEXT_MAX_CHARS:
            break
        lines.append(block)
        running += len(block)
    return "\n".join(lines)


def llm_chat(messages, study_context_text: str, system_prompt: str = None, model: str = None):
    r = client.chat.completions.create(
        model=_resolve_model(model),
        messages=_build_api_messages(messages, study_context_text, system_prompt),
    )
    return (r.choices[0].message.content or "").strip()


def llm_chat_stream(messages, study_context_text: str, system_prompt: str = None, model: str = None):
    stream  = client.chat.completions.create(
        model=_resolve_model(model),
        messages=_build_api_messages(messages, study_context_text, system_prompt),
        stream=True,
    )
    yielded = False
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        token = getattr(delta, "content", None) or getattr(delta, "reasoning_content", None)
        if token:
            yield token
            yielded = True
    if not yielded:
        yield "(No response received from model)"
