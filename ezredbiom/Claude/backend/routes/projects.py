"""
Project CRUD routes.

GET    /api/projects           – list user's projects
POST   /api/projects           – create project
GET    /api/projects/<id>      – get project with counts
PUT    /api/projects/<id>      – rename / re-describe / recolor
DELETE /api/projects/<id>      – delete project (cascades to studies + chats)

Saved-study sub-routes live in project_studies.py.
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone

from db.mongo_connection import projects_col, studies_col, chats_col
from routes.helpers import get_user_id, to_object_id, get_project_or_404, serialize_project

projects_bp = Blueprint("projects", __name__)
UTC = timezone.utc


@projects_bp.route("/projects", methods=["GET"])
def list_projects():
    try:
        uid = get_user_id()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    sc = studies_col()
    cc = chats_col()
    docs = list(projects_col().find({"user_id": uid}).sort("updated_at", -1))

    result = []
    for doc in docs:
        pid = str(doc["_id"])
        p = serialize_project(doc)
        p["study_count"] = sc.count_documents({"project_id": pid})
        p["chat_count"]  = cc.count_documents({"project_id": pid})
        result.append(p)

    return jsonify({"projects": result})


@projects_bp.route("/projects", methods=["POST"])
def create_project():
    try:
        uid = get_user_id()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    body = request.get_json() or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    now = datetime.now(UTC)
    doc = {
        "user_id":     uid,
        "name":        name,
        "description": body.get("description", ""),
        "color":       body.get("color", "#00e5c8"),
        "created_at":  now,
        "updated_at":  now,
    }
    result = projects_col().insert_one(doc)
    doc["_id"] = result.inserted_id

    p = serialize_project(doc)
    p["study_count"] = 0
    p["chat_count"]  = 0
    return jsonify({"project": p}), 201


@projects_bp.route("/projects/<project_id>", methods=["GET"])
def get_project(project_id):
    try:
        uid = get_user_id()
        doc = get_project_or_404(project_id, uid)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404

    p = serialize_project(doc)
    p["study_count"] = studies_col().count_documents({"project_id": project_id})
    p["chat_count"]  = chats_col().count_documents({"project_id": project_id})
    return jsonify({"project": p})


@projects_bp.route("/projects/<project_id>", methods=["PUT"])
def update_project(project_id):
    try:
        uid = get_user_id()
        get_project_or_404(project_id, uid)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404

    body = request.get_json() or {}
    updates = {"updated_at": datetime.now(UTC)}
    for field in ("name", "description", "color"):
        if field in body:
            updates[field] = body[field]

    oid = to_object_id(project_id)
    projects_col().update_one({"_id": oid}, {"$set": updates})
    doc = projects_col().find_one({"_id": oid})
    return jsonify({"project": serialize_project(doc)})


@projects_bp.route("/projects/<project_id>", methods=["DELETE"])
def delete_project(project_id):
    try:
        uid = get_user_id()
        get_project_or_404(project_id, uid)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404

    projects_col().delete_one({"_id": to_object_id(project_id)})
    studies_col().delete_many({"project_id": project_id})
    chats_col().delete_many({"project_id": project_id})
    return jsonify({"deleted": True})