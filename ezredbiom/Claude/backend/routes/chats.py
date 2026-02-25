"""
Chat lifecycle routes.

GET    /api/projects/<id>/chats   – list chats in a project
POST   /api/projects/<id>/chats   – create a new chat
GET    /api/chats/<id>            – fetch chat with full message history
PUT    /api/chats/<id>            – rename chat
DELETE /api/chats/<id>            – delete chat

Message sending lives in chat_messages.py.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone

from db.mongo_connection import chats_col
from routes.helpers import get_user_id, to_object_id, get_project_or_404

chats_bp = Blueprint("chats", __name__)
UTC = timezone.utc


# ── serializers ───────────────────────────────────────────────────────────────

def serialize_chat(doc: dict, include_messages: bool = False) -> dict:
    result = {
        "id":            str(doc["_id"]),
        "project_id":    doc["project_id"],
        "title":         doc.get("title", "New Chat"),
        "created_at":    doc["created_at"].isoformat(),
        "updated_at":    doc["updated_at"].isoformat(),
        "message_count": len(doc.get("messages", [])),
    }
    if include_messages:
        result["messages"] = [
            {
                "role":      m["role"],
                "content":   m["content"],
                "timestamp": m["timestamp"].isoformat(),
            }
            for m in doc.get("messages", [])
        ]
    return result


def get_chat_or_404(chat_id: str, user_id: str) -> dict:
    doc = chats_col().find_one({"_id": to_object_id(chat_id), "user_id": user_id})
    if not doc:
        raise LookupError("Chat not found")
    return doc


# ── routes ────────────────────────────────────────────────────────────────────

@chats_bp.route("/projects/<project_id>/chats", methods=["GET"])
def list_chats(project_id):
    try:
        uid = get_user_id()
        get_project_or_404(project_id, uid)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404

    docs = list(chats_col().find({"project_id": project_id}).sort("updated_at", -1))
    return jsonify({"chats": [serialize_chat(d) for d in docs]})


@chats_bp.route("/projects/<project_id>/chats", methods=["POST"])
def create_chat(project_id):
    try:
        uid = get_user_id()
        get_project_or_404(project_id, uid)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404

    body = request.get_json() or {}
    now  = datetime.now(UTC)
    doc  = {
        "project_id": project_id,
        "user_id":    uid,
        "title":      body.get("title", "New Chat"),
        "messages":   [],
        "created_at": now,
        "updated_at": now,
    }
    result = chats_col().insert_one(doc)
    doc["_id"] = result.inserted_id
    return jsonify({"chat": serialize_chat(doc, include_messages=True)}), 201


@chats_bp.route("/chats/<chat_id>", methods=["GET"])
def get_chat(chat_id):
    try:
        uid = get_user_id()
        doc = get_chat_or_404(chat_id, uid)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404

    return jsonify({"chat": serialize_chat(doc, include_messages=True)})


@chats_bp.route("/chats/<chat_id>", methods=["PUT"])
def rename_chat(chat_id):
    try:
        uid = get_user_id()
        get_chat_or_404(chat_id, uid)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404

    body  = request.get_json() or {}
    title = (body.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400

    now = datetime.now(UTC)
    oid = to_object_id(chat_id)
    chats_col().update_one({"_id": oid}, {"$set": {"title": title, "updated_at": now}})
    doc = chats_col().find_one({"_id": oid})
    return jsonify({"chat": serialize_chat(doc)})


@chats_bp.route("/chats/<chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
    try:
        uid = get_user_id()
        get_chat_or_404(chat_id, uid)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404

    chats_col().delete_one({"_id": to_object_id(chat_id)})
    return jsonify({"deleted": True})