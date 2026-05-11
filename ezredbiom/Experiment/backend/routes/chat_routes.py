import logging

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
)
from helpers.llm_helpers import (
    _sse,
    _build_project_study_context,
    llm_chat,
    llm_chat_stream,
)
from helpers.qiita_fetch import (
    _auto_pin_project_studies,
    _build_pinned_reports_context,
    _build_samples_report_payload,
)

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
    chat          = create_chat(project_id, user_id, first_message or data.get('title'))
    _auto_pin_project_studies(chat["chat_id"], proj)
    if first_message:
        study_ctx         = _build_project_study_context(proj, user_id=user_id)
        assistant_content = llm_chat([{"role": "user", "content": first_message}], study_context_text=study_ctx)
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
    assistant_content = llm_chat(full_msgs, study_context_text=study_ctx)
    append_chat_messages(project_id, user_id, chat_id, user_content, assistant_content)
    updated = get_chat(project_id, user_id, chat_id)
    return jsonify(updated)


@app.route('/api/projects/<project_id>/chats/<chat_id>/message/stream', methods=['POST'])
def api_chat_message_stream(project_id, chat_id):
    data            = request.get_json() or {}
    user_id         = (data.get('user_id') or 'default').strip() or 'default'
    user_content    = (data.get('message') or data.get('content') or '').strip()
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

    proj        = get_project_studies_only(project_id)
    study_ctx   = _build_project_study_context(proj, user_id=user_id)
    pinned_ctx  = _build_pinned_reports_context(chat.get("pinned_studies") or []) if report_study_id is None else None
    combined_ctx = "\n\n".join(x for x in (study_ctx, pinned_ctx) if x) or None
    messages    = chat.get('messages') or []
    full_msgs   = [{"role": m.get("role"), "content": m.get("content")} for m in messages]
    full_msgs.append({"role": "user", "content": user_content})

    def generate():
        assistant_parts = []
        ui_payload      = None
        try:
            if report_study_id is not None:
                yield _sse("token", {"token": f"Loading sample metadata for study {report_study_id}…"})
                ui_payload  = _build_samples_report_payload(report_study_id)
                num_samples = (ui_payload.get("header") or {}).get("num_samples") or len(ui_payload.get("samples") or [])
                assistant_parts = [f"Loaded full sample metadata for study {report_study_id} ({num_samples} samples). See inline browser."]
                yield _sse("ui", ui_payload)
            else:
                for token in llm_chat_stream(full_msgs, study_context_text=combined_ctx):
                    assistant_parts.append(token)
                    yield _sse("token", {"token": token})
            assistant_content = "".join(assistant_parts).strip()
            append_chat_messages(project_id, user_id, chat_id, user_content, assistant_content, assistant_ui_payload=ui_payload)
            if report_study_id is not None:
                try:
                    pin_study_to_chat(chat_id, SCOPE_PROJECT, report_study_id)
                except Exception:
                    logger.exception("failed to pin study %s to project chat %s", report_study_id, chat_id)
            yield _sse("done", {"chat_id": chat_id, "persisted": True, "pinned_study_id": report_study_id})
        except Exception as e:
            yield _sse("error", {"error": str(e)})

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
    if not user_content:
        return jsonify({'error': 'message required'}), 400

    proj = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404

    chat = create_chat(project_id, user_id, user_content)
    if not chat:
        return jsonify({'error': 'Failed to create chat'}), 500
    _auto_pin_project_studies(chat["chat_id"], proj)
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


@app.route('/api/projects/<project_id>/chats/<chat_id>/pinned/<int:study_id>', methods=['DELETE'])
def api_unpin_project_chat_study(project_id, chat_id, study_id):
    user_id = request.args.get('user_id') or 'default'
    chat    = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    unpin_study_from_chat(chat_id, SCOPE_PROJECT, study_id)
    return jsonify({'ok': True, 'pinned_studies': list_pinned_studies(chat_id, SCOPE_PROJECT)})
