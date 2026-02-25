"""
NoSQL store for projects (Claude-style): each project has saved studies and chats.
Stored per user_id. Uses TinyDB.
"""
import os
import uuid
from datetime import datetime
from tinydb import TinyDB, Query

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "projects.json")

_db = None

def _get_db():
    global _db
    if _db is None:
        _db = TinyDB(DB_PATH)
    return _db


def _now():
    return datetime.utcnow().isoformat() + "Z"


# --- Projects ---

def list_projects(user_id: str):
    user_id = (user_id or "").strip() or "default"
    db = _get_db()
    Project = Query()
    docs = db.search(Project.user_id == user_id)
    return [{"project_id": d["project_id"], "name": d["name"], "created_at": d["created_at"],
             "updated_at": d["updated_at"], "studies_count": len(d.get("studies", [])),
             "chats_count": len(d.get("chats", []))} for d in docs]


def create_project(user_id: str, name: str):
    user_id = (user_id or "").strip() or "default"
    name = (name or "Untitled").strip() or "Untitled"
    db = _get_db()
    project_id = str(uuid.uuid4())[:8]
    doc = {
        "project_id": project_id,
        "user_id": user_id,
        "name": name,
        "studies": [],
        "chats": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    db.insert(doc)
    return get_project(project_id, user_id)


def get_project(project_id: str, user_id: str = None):
    db = _get_db()
    Project = Query()
    q = Project.project_id == project_id
    if user_id:
        q = (Project.project_id == project_id) & (Project.user_id == (user_id or "default"))
    doc = db.get(q)
    return dict(doc) if doc else None


def update_project(project_id: str, user_id: str, name: str = None):
    proj = get_project(project_id, user_id)
    if not proj:
        return None
    db = _get_db()
    Project = Query()
    updates = {"updated_at": _now()}
    if name is not None:
        updates["name"] = (name or "").strip() or proj["name"]
    db.update(updates, (Project.project_id == project_id) & (Project.user_id == (user_id or "default")))
    return get_project(project_id, user_id)


def delete_project(project_id: str, user_id: str):
    db = _get_db()
    Project = Query()
    db.remove((Project.project_id == project_id) & (Project.user_id == (user_id or "default")))
    return True


# --- Studies (within project) ---

def add_study_to_project(project_id: str, user_id: str, study: dict):
    proj = get_project(project_id, user_id)
    if not proj:
        return None
    study_id = study.get("study_id")
    if study_id is None:
        return None
    studies = proj.get("studies") or []
    for s in studies:
        if s.get("study_id") == study_id:
            return get_project(project_id, user_id)
    snapshot = {
        "study_id": study_id,
        "study_title": study.get("study_title", ""),
        "study_abstract": study.get("study_abstract", ""),
        "pi_name": study.get("pi_name"),
        "pi_affiliation": study.get("pi_affiliation"),
        "lab_person_name": study.get("lab_person_name"),
        "added_at": _now(),
    }
    studies.append(snapshot)
    db = _get_db()
    Project = Query()
    db.update({"studies": studies, "updated_at": _now()},
              (Project.project_id == project_id) & (Project.user_id == (user_id or "default")))
    return get_project(project_id, user_id)


def remove_study_from_project(project_id: str, user_id: str, study_id):
    proj = get_project(project_id, user_id)
    if not proj:
        return None
    studies = [s for s in (proj.get("studies") or []) if s.get("study_id") != study_id]
    db = _get_db()
    Project = Query()
    db.update({"studies": studies, "updated_at": _now()},
              (Project.project_id == project_id) & (Project.user_id == (user_id or "default")))
    return get_project(project_id, user_id)


# --- Chats (within project) ---

def list_chats(project_id: str, user_id: str):
    proj = get_project(project_id, user_id)
    if not proj:
        return []
    chats = proj.get("chats") or []
    return [{"chat_id": c["chat_id"], "title": c.get("title", "New chat"), "created_at": c.get("created_at"),
             "updated_at": c.get("updated_at"), "messages_count": len(c.get("messages", []))} for c in chats]


def get_chat(project_id: str, user_id: str, chat_id: str):
    proj = get_project(project_id, user_id)
    if not proj:
        return None
    for c in (proj.get("chats") or []):
        if c.get("chat_id") == chat_id:
            return c
    return None


def create_chat(project_id: str, user_id: str, first_message: str = None):
    proj = get_project(project_id, user_id)
    if not proj:
        return None
    chat_id = str(uuid.uuid4())[:8]
    title = (first_message or "New chat")[:60].strip() or "New chat"
    chat = {
        "chat_id": chat_id,
        "title": title,
        "messages": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    chats = proj.get("chats") or []
    chats.append(chat)
    db = _get_db()
    Project = Query()
    db.update({"chats": chats, "updated_at": _now()},
              (Project.project_id == project_id) & (Project.user_id == (user_id or "default")))
    return get_chat(project_id, user_id, chat_id)


def append_chat_messages(project_id: str, user_id: str, chat_id: str, user_content: str, assistant_content: str):
    proj = get_project(project_id, user_id)
    if not proj:
        return None
    chats = proj.get("chats") or []
    for c in chats:
        if c.get("chat_id") == chat_id:
            msgs = c.get("messages") or []
            msgs.append({"role": "user", "content": user_content})
            msgs.append({"role": "assistant", "content": assistant_content})
            c["messages"] = msgs
            c["updated_at"] = _now()
            if not c.get("title") or c.get("title") == "New chat":
                c["title"] = (user_content or "New chat")[:60].strip() or "New chat"
            db = _get_db()
            Project = Query()
            db.update({"chats": chats, "updated_at": _now()},
                      (Project.project_id == project_id) & (Project.user_id == (user_id or "default")))
            return get_chat(project_id, user_id, chat_id)
    return None


def delete_chat(project_id: str, user_id: str, chat_id: str):
    proj = get_project(project_id, user_id)
    if not proj:
        return None
    chats = [c for c in (proj.get("chats") or []) if c.get("chat_id") != chat_id]
    db = _get_db()
    Project = Query()
    db.update({"chats": chats, "updated_at": _now()},
              (Project.project_id == project_id) & (Project.user_id == (user_id or "default")))
    return get_project(project_id, user_id)
