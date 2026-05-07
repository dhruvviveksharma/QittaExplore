import logging

from flask import Response, jsonify, request, stream_with_context

from run import app
from config import GLOBAL_CHAT_SYSTEM_PROMPT
from services.llm import llm_query_to_sql
from services.study_service import search_studies_with_sql
from store import (
    SCOPE_GLOBAL,
    append_global_chat_messages,
    create_global_chat,
    delete_global_chat,
    get_global_chat,
    list_global_chats,
    list_pinned_studies,
    pin_study_to_chat,
    unpin_study_from_chat,
)
from helpers.llm_helpers import (
    _sse,
    _build_global_search_context,
    llm_chat_stream,
)
from helpers.qiita_fetch import (
    _build_pinned_reports_context,
    _build_samples_report_payload,
)

logger = logging.getLogger(__name__)


@app.route('/api/global-chats', methods=['GET'])
def api_list_global_chats():
    user_id = request.args.get('user_id') or 'default'
    return jsonify({'chats': list_global_chats(user_id)})


@app.route('/api/global-chats', methods=['POST'])
def api_create_global_chat():
    data    = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    title   = data.get('title')
    chat    = create_global_chat(user_id, title=title)
    if not chat:
        return jsonify({'error': 'Failed to create global chat'}), 500
    return jsonify(chat)


@app.route('/api/global-chats/<chat_id>', methods=['GET'])
def api_get_global_chat(chat_id):
    user_id = request.args.get('user_id') or 'default'
    chat    = get_global_chat(user_id, chat_id)
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

    chat = get_global_chat(user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    if report_study_id is None:
        try:
            sql_spec = llm_query_to_sql(user_content)
            studies  = search_studies_with_sql(
                sql_spec.get("where_clause", "1=1"),
                sql_spec.get("params", []),
            )
        except Exception:
            studies = []
        study_ctx    = _build_global_search_context(studies, user_content)
        pinned_ctx   = _build_pinned_reports_context(chat.get("pinned_studies") or [])
        combined_ctx = "\n\n".join(x for x in (study_ctx, pinned_ctx) if x) or None
    else:
        combined_ctx = None

    messages  = chat.get('messages') or []
    full_msgs = [{"role": m.get("role"), "content": m.get("content")} for m in messages]
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
                for token in llm_chat_stream(
                    full_msgs,
                    study_context_text=combined_ctx,
                    system_prompt=GLOBAL_CHAT_SYSTEM_PROMPT,
                ):
                    assistant_parts.append(token)
                    yield _sse("token", {"token": token})
            assistant_content = "".join(assistant_parts).strip()
            append_global_chat_messages(user_id, chat_id, user_content, assistant_content, assistant_ui_payload=ui_payload)
            if report_study_id is not None:
                try:
                    pin_study_to_chat(chat_id, SCOPE_GLOBAL, report_study_id)
                except Exception:
                    logger.exception("failed to pin study %s to global chat %s", report_study_id, chat_id)
            yield _sse("done", {"chat_id": chat_id, "persisted": True, "pinned_study_id": report_study_id})
        except Exception as e:
            yield _sse("error", {"error": str(e)})

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route('/api/global-chats/<chat_id>/pinned/<int:study_id>', methods=['DELETE'])
def api_unpin_global_chat_study(chat_id, study_id):
    user_id = request.args.get('user_id') or 'default'
    chat    = get_global_chat(user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    unpin_study_from_chat(chat_id, SCOPE_GLOBAL, study_id)
    return jsonify({'ok': True, 'pinned_studies': list_pinned_studies(chat_id, SCOPE_GLOBAL)})
