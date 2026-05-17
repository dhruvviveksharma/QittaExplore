import logging
import os

from flask import Response, jsonify, request, stream_with_context

from run import app
from store import (
    SCOPE_PROJECT,
    append_chat_messages,
    create_chat,
    delete_chat,
    get_chat,
    get_project,
    get_project_studies_only,
    list_chats,
    list_pinned_studies,
    pin_study_to_chat,
    unpin_study_from_chat,
    append_entry,
    build_chat_context,
    set_chat_leaf,
    append_branch_summary,
    get_chat_tree,
)
from helpers.llm_helpers import (
    _sse,
    _build_project_study_context,
    llm_chat,
    llm_chat_stream,
    friendly_llm_error,
)
from helpers.qiita_fetch import (
    _build_pinned_reports_context,
    _build_samples_report_payload,
    _detect_mentioned_study_ids,
)

USE_AGENT_LOOP = os.getenv("USE_AGENT_LOOP", "1").strip().lower() not in ("0", "false", "no")

logger = logging.getLogger(__name__)


@app.route('/api/projects/<project_id>/chats', methods=['GET'])
def api_list_chats(project_id):
    user_id = request.args.get('user_id') or 'default'
    chats   = list_chats(project_id, user_id)
    return jsonify({'chats': chats})


@app.route('/api/projects/<project_id>/chats', methods=['POST'])
def api_create_chat(project_id):
    data          = request.get_json() or {}
    user_id       = (data.get('user_id') or 'default').strip() or 'default'
    proj          = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404
    first_message = (data.get('message') or data.get('first_message') or '').strip()
    model         = data.get('model')
    chat          = create_chat(project_id, user_id, first_message or data.get('title'))
    if first_message:
        study_ctx         = _build_project_study_context(proj, user_id=user_id)
        assistant_content = llm_chat([{"role": "user", "content": first_message}], study_context_text=study_ctx, model=model)
        append_chat_messages(project_id, user_id, chat["chat_id"], first_message, assistant_content)
    chat = get_chat(project_id, user_id, chat["chat_id"])
    return jsonify(chat)


@app.route('/api/projects/<project_id>/chats/<chat_id>', methods=['GET'])
def api_get_chat(project_id, chat_id):
    user_id = request.args.get('user_id') or 'default'
    chat    = get_chat(project_id, user_id, chat_id)
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
    data         = request.get_json() or {}
    user_id      = (data.get('user_id') or 'default').strip() or 'default'
    user_content = (data.get('message') or data.get('content') or '').strip()
    model        = data.get('model')
    if not user_content:
        return jsonify({'error': 'message required'}), 400
    chat = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    proj      = get_project_studies_only(project_id)
    study_ctx = _build_project_study_context(proj, user_id=user_id)
    messages  = chat.get('messages') or []
    full_msgs = [{"role": m.get("role"), "content": m.get("content")} for m in messages]
    full_msgs.append({"role": "user", "content": user_content})
    assistant_content = llm_chat(full_msgs, study_context_text=study_ctx, model=model)
    append_chat_messages(project_id, user_id, chat_id, user_content, assistant_content)
    updated = get_chat(project_id, user_id, chat_id)
    return jsonify(updated)


@app.route('/api/projects/<project_id>/chats/<chat_id>/message/stream', methods=['POST'])
def api_chat_message_stream(project_id, chat_id):
    data            = request.get_json() or {}
    user_id         = (data.get('user_id') or 'default').strip() or 'default'
    user_content    = (data.get('message') or data.get('content') or '').strip()
    model           = data.get('model')
    report_study_id = data.get("report_study_id")
    if report_study_id is not None:
        try:
            report_study_id = int(report_study_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'report_study_id must be an integer'}), 400
    if not user_content:
        return jsonify({'error': 'message required'}), 400

    chat = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    proj = get_project_studies_only(project_id)

    if USE_AGENT_LOOP and report_study_id is None:
        # Agent loop path: LLM drives tool calls; context is built lazily per-turn
        from services.agent_loop import run_agent_turn

        def generate_agent():
            try:
                # Provide a lightweight study overview as initial context hint
                # (the agent will call list_project_studies / get_study_detail as needed)
                num_proj_studies = len((proj or {}).get("studies") or [])
                study_overview = None
                if num_proj_studies > 0 and num_proj_studies <= 5:
                    # For small projects, pre-load the overview so the model can answer
                    # simple questions without a tool round-trip
                    study_overview = _build_project_study_context(proj, user_id=user_id)

                yield from run_agent_turn(
                    chat_id=chat_id,
                    project_id=project_id,
                    user_content=user_content,
                    model=model,
                    project_context=study_overview,
                )
            except Exception as e:
                logger.exception("agent loop error in project chat %s", chat_id)
                yield _sse("error", {"error": friendly_llm_error(e, model)})

        return Response(
            stream_with_context(generate_agent()),
            mimetype='text/event-stream',
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Legacy path (report_study_id supplied, or agent loop disabled)
    messages  = chat.get('messages') or []
    full_msgs = [{"role": m.get("role"), "content": m.get("content")} for m in messages]
    full_msgs.append({"role": "user", "content": user_content})

    def generate():
        yield ': keepalive\n\n'
        assistant_parts = []
        ui_payload      = None
        try:
            if report_study_id is not None:
                yield _sse("step_start", {"name": "load_samples", "label": f"Loading sample data for study {report_study_id}…"})
                try:
                    ui_payload  = _build_samples_report_payload(report_study_id)
                    num_samples = (ui_payload.get("header") or {}).get("num_samples") or len(ui_payload.get("samples") or [])
                    assistant_parts = [f"Loaded full sample metadata for study {report_study_id} ({num_samples} samples). See inline browser."]
                    yield _sse("step_done", {"name": "load_samples", "label": "Sample data loaded", "detail": f"{num_samples} samples"})
                    yield _sse("ui", ui_payload)
                except ValueError:
                    assistant_parts = [f"Study {report_study_id} is private or has no accessible sample data in Qiita."]
                    yield _sse("step_done", {"name": "load_samples", "label": f"Study {report_study_id} is private — no accessible data"})
                    ui_payload = None
            else:
                num_proj_studies = len((proj or {}).get("studies") or [])
                yield _sse("step_start", {"name": "build_context", "label": "Loading study context…"})
                study_ctx = _build_project_study_context(proj, user_id=user_id)
                yield _sse("step_done", {"name": "build_context", "label": "Study context ready", "detail": f"{num_proj_studies} studies"})
                yield ': keepalive\n\n'
                detected_ids   = _detect_mentioned_study_ids(user_content, proj)
                pinned_studies = chat.get("pinned_studies") or []
                deep_ids       = list(dict.fromkeys(detected_ids + [s for s in pinned_studies if s not in detected_ids]))
                deep_ctx = None
                if deep_ids:
                    if detected_ids:
                        ids_label = f"study {detected_ids[0]}" if len(detected_ids) == 1 else f"{len(detected_ids)} studies"
                        fetch_label = f"Fetching data for {ids_label}…"
                        done_label  = "Study data ready"
                    else:
                        fetch_label = "Loading pinned study data…"
                        done_label  = "Pinned reports ready"
                    yield _sse("step_start", {"name": "deep_context", "label": fetch_label})
                    deep_ctx = _build_pinned_reports_context(deep_ids)
                    yield _sse("step_done", {"name": "deep_context", "label": done_label, "detail": f"{len(deep_ids)} studies"})
                    yield ': keepalive\n\n'
                combined_ctx = "\n\n".join(x for x in (study_ctx, deep_ctx) if x) or None
                yield _sse("step_start", {"name": "llm_generate", "label": "Generating response…"})
                for token in llm_chat_stream(full_msgs, study_context_text=combined_ctx, model=model):
                    assistant_parts.append(token)
                    yield _sse("token", {"token": token})
            assistant_content = "".join(assistant_parts).strip()
            append_chat_messages(project_id, user_id, chat_id, user_content, assistant_content, assistant_ui_payload=ui_payload)
            if report_study_id is not None and ui_payload is not None:
                try:
                    pin_study_to_chat(chat_id, SCOPE_PROJECT, report_study_id)
                except Exception:
                    logger.exception("failed to pin study %s to project chat %s", report_study_id, chat_id)
            yield _sse("done", {"chat_id": chat_id, "persisted": True, "pinned_study_id": report_study_id if ui_payload else None})
        except Exception as e:
            logger.exception("stream error in project chat %s", chat_id)
            yield _sse("error", {"error": friendly_llm_error(e, model)})

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route('/api/projects/<project_id>/chats/stream', methods=['POST'])
def api_create_chat_stream(project_id):
    data         = request.get_json() or {}
    user_id      = (data.get('user_id') or 'default').strip() or 'default'
    user_content = (data.get('message') or data.get('content') or '').strip()
    model        = data.get('model')
    if not user_content:
        return jsonify({'error': 'message required'}), 400

    proj = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404

    chat = create_chat(project_id, user_id, user_content)
    if not chat:
        return jsonify({'error': 'Failed to create chat'}), 500
    num_proj_studies = len((proj or {}).get("studies") or [])

    def generate():
        assistant_parts = []
        try:
            yield ': keepalive\n\n'
            yield _sse("step_start", {"name": "build_context", "label": "Loading study context…"})
            study_ctx = _build_project_study_context(proj, user_id=user_id)
            yield _sse("step_done", {"name": "build_context", "label": "Study context ready", "detail": f"{num_proj_studies} studies"})
            yield ': keepalive\n\n'
            detected_ids = _detect_mentioned_study_ids(user_content, proj)
            deep_ctx = None
            if detected_ids:
                ids_label = f"study {detected_ids[0]}" if len(detected_ids) == 1 else f"{len(detected_ids)} studies"
                yield _sse("step_start", {"name": "deep_context", "label": f"Fetching data for {ids_label}…"})
                deep_ctx = _build_pinned_reports_context(detected_ids)
                yield _sse("step_done", {"name": "deep_context", "label": "Study data ready", "detail": f"{len(detected_ids)} studies"})
                yield ': keepalive\n\n'
            combined_ctx = "\n\n".join(x for x in (study_ctx, deep_ctx) if x) or None
            yield _sse("step_start", {"name": "llm_generate", "label": "Generating response…"})
            for token in llm_chat_stream([{"role": "user", "content": user_content}], study_context_text=combined_ctx, model=model):
                assistant_parts.append(token)
                yield _sse("token", {"token": token, "chat_id": chat["chat_id"]})
            assistant_content = "".join(assistant_parts).strip()
            append_chat_messages(project_id, user_id, chat["chat_id"], user_content, assistant_content)
            yield _sse("done", {"chat_id": chat["chat_id"], "persisted": True})
        except Exception as e:
            logger.exception("stream error in create_chat_stream for project %s", project_id)
            yield _sse("error", {"error": friendly_llm_error(e, model), "chat_id": chat["chat_id"]})

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route('/api/projects/<project_id>/chats/<chat_id>/pinned/<int:study_id>', methods=['DELETE'])
def api_unpin_project_chat_study(project_id, chat_id, study_id):
    user_id = request.args.get('user_id') or 'default'
    chat    = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    unpin_study_from_chat(chat_id, SCOPE_PROJECT, study_id)
    return jsonify({'ok': True, 'pinned_studies': list_pinned_studies(chat_id, SCOPE_PROJECT)})


# ============================================================================
# Tree / branch endpoints
# ============================================================================

@app.route('/api/projects/<project_id>/chats/<chat_id>/tree', methods=['GET'])
def api_chat_tree(project_id, chat_id):
    """Return the full tree structure for a chat."""
    user_id = request.args.get('user_id') or 'default'
    chat = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    tree = get_chat_tree(chat_id)
    return jsonify(tree)


@app.route('/api/projects/<project_id>/chats/<chat_id>/branch', methods=['POST'])
def api_chat_branch(project_id, chat_id):
    """
    Move the active leaf to from_entry_id, enabling a new branch from that point.
    Subsequent messages will be children of from_entry_id.
    """
    data        = request.get_json() or {}
    user_id     = (data.get('user_id') or 'default').strip() or 'default'
    from_entry  = data.get('from_entry_id', '').strip()
    chat = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    if not from_entry:
        return jsonify({'error': 'from_entry_id required'}), 400
    ok = set_chat_leaf(chat_id, from_entry)
    if not ok:
        return jsonify({'error': f'Entry {from_entry!r} not found in this chat'}), 404
    return jsonify({'ok': True, 'leaf_id': from_entry})


@app.route('/api/projects/<project_id>/chats/<chat_id>/branch_summary', methods=['POST'])
def api_chat_branch_summary(project_id, chat_id):
    """
    Summarize the work on an abandoned branch and inject it as a branch_summary entry.
    If summary is omitted the server generates one via LLM.
    """
    data          = request.get_json() or {}
    user_id       = (data.get('user_id') or 'default').strip() or 'default'
    from_entry_id = data.get('from_entry_id', '').strip()
    summary       = (data.get('summary') or '').strip()

    chat = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    if not from_entry_id:
        return jsonify({'error': 'from_entry_id required'}), 400

    if not summary:
        # Auto-generate summary from the abandoned branch entries
        from sql_store_crud import get_branch_entries
        from services.agent_tools import accumulate_resources
        import json as _json

        abandoned = get_branch_entries(chat_id, from_entry_id=from_entry_id)
        # Serialize for LLM
        lines = []
        for e in abandoned:
            role = e.get('role') or 'user'
            etype = e.get('entry_type') or 'message'
            if etype == 'tool_call':
                args = e.get('tool_args') or '{}'
                lines.append(f"[Tool call: {e.get('tool_name')}] {args}")
            elif etype == 'tool_result':
                lines.append(f"[Tool result: {e.get('tool_name')}] {(e.get('content') or '')[:400]}")
            elif e.get('content'):
                lines.append(f"[{role}]: {(e.get('content') or '')[:600]}")

        conversation_text = "\n\n".join(lines)

        # Collect cumulative resources from tool_details
        tool_details_list = [
            _json.loads(e['tool_details']) if e.get('tool_details') else {}
            for e in abandoned
        ]
        resources = accumulate_resources(tool_details_list)

        # Call LLM for summary using pi-style format
        from config import client, DEFAULT_MODEL
        SUMMARY_PROMPT = (
            "Summarize this conversation branch for context handoff. Use this format:\n\n"
            "## Goal\n[What was attempted]\n\n"
            "## Progress\n### Done\n- [x] [Completed]\n### In Progress\n- [ ] [Ongoing]\n\n"
            "## Key Decisions\n- **[Decision]**: [Rationale]\n\n"
            "## Next Steps\n1. [What should happen next]\n\n"
            "## Critical Context\n- [Data needed to continue]\n\n"
            "Be concise. Preserve exact IDs and field names."
        )
        try:
            resp = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": "You are a context summarization assistant. Output only the structured summary."},
                    {"role": "user", "content": f"<conversation>\n{conversation_text}\n</conversation>\n\n{SUMMARY_PROMPT}"},
                ],
            )
            summary = (resp.choices[0].message.content or "").strip()
        except Exception as e:
            summary = f"Branch summary (auto-generation failed: {e})"

        # Append resource tracking XML (mirrors pi's formatFileOperations)
        reads = resources.get("resources_read") or []
        mods = resources.get("resources_modified") or []
        if reads:
            summary += f"\n\n<resources-read>\n" + "\n".join(reads) + "\n</resources-read>"
        if mods:
            summary += f"\n\n<resources-modified>\n" + "\n".join(mods) + "\n</resources-modified>"

    else:
        resources = {}

    entry_id = append_branch_summary(chat_id, from_entry_id, summary, resources=resources)
    return jsonify({'ok': True, 'entry_id': entry_id, 'summary': summary})
