"""
MongoDB connection and collection access for Qiita Explorer.
Stores projects, saved studies, and chat history.
"""
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB  = os.getenv("MONGO_DB",  "qiita_explorer")

try:
    _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    _client.admin.command("ping")
    print(f"[MongoDB] Connected → {MONGO_URI}/{MONGO_DB}")
except ConnectionFailure as exc:
    print(f"[MongoDB] WARNING: could not connect – {exc}")
    _client = None

db = _client[MONGO_DB] if _client else None


def get_collection(name: str):
    if db is None:
        raise RuntimeError("MongoDB is not available. Check MONGO_URI env var.")
    return db[name]


# ── collection shortcuts ────────────────────────────────────────────────────
def projects_col():
    col = get_collection("projects")
    col.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    return col


def studies_col():
    col = get_collection("saved_studies")
    col.create_index([("project_id", ASCENDING), ("study_id", ASCENDING)], unique=True)
    return col


def chats_col():
    col = get_collection("chats")
    col.create_index([("project_id", ASCENDING), ("updated_at", DESCENDING)])
    return col