"""SQLite-backed project/chat store with one-time TinyDB migration."""

import json
import os
import sqlite3
import uuid
from datetime import datetime

_DEFAULT_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(_DEFAULT_DATA_DIR, exist_ok=True)
DB_PATH = os.getenv("QIITA_EXPERIMENT_DB_PATH", os.path.join(_DEFAULT_DATA_DIR, "projects.db"))

TINYDB_PRIMARY_PATH = os.path.join(_DEFAULT_DATA_DIR, "projects.json")
TINYDB_LEGACY_TMP_PATH = "/tmp/qiita-experiment/projects.json"


def _now():
    return datetime.utcnow().isoformat() + "Z"


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _as_dict(row):
    return dict(row) if row is not None else None


def _parse_tinydb_docs(path):
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        bucket = payload.get("_default") if isinstance(payload, dict) else None
        if not isinstance(bucket, dict):
            return []
        return [v for v in bucket.values() if isinstance(v, dict)]
    except Exception:
        return []


def _create_schema(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS projects (
            project_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS project_studies (
            project_id TEXT NOT NULL,
            study_id INTEGER NOT NULL,
            study_title TEXT,
            study_abstract TEXT,
            pi_name TEXT,
            pi_email TEXT,
            pi_affiliation TEXT,
            lab_person_name TEXT,
            summary_text TEXT,
            added_at TEXT,
            updated_at TEXT,
            PRIMARY KEY (project_id, study_id),
            FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS project_chats (
            chat_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            title TEXT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS project_chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT,
            FOREIGN KEY (chat_id) REFERENCES project_chats(chat_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS project_context_summaries (
            project_id TEXT PRIMARY KEY,
            summary_text TEXT,
            source_updated_at TEXT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS global_chats (
            chat_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS global_chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT,
            FOREIGN KEY (chat_id) REFERENCES global_chats(chat_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_project_studies_project ON project_studies(project_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_project_chats_project_updated ON project_chats(project_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_global_chats_user_updated ON global_chats(user_id, updated_at DESC);
        """
    )


def _mark_migration(conn):
    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES('tinydb_imported', '1')"
    )


def _should_migrate(conn):
    marker = conn.execute("SELECT value FROM meta WHERE key='tinydb_imported'").fetchone()
    if marker and marker["value"] == "1":
        return False
    existing = conn.execute("SELECT COUNT(1) AS c FROM projects").fetchone()["c"]
    return existing == 0


def _insert_project_doc(conn, doc):
    project_id = str(doc.get("project_id") or str(uuid.uuid4())[:8])
    user_id = (doc.get("user_id") or "default").strip() or "default"
    created_at = doc.get("created_at") or _now()
    updated_at = doc.get("updated_at") or created_at
    name = (doc.get("name") or "Untitled").strip() or "Untitled"

    conn.execute(
        """
        INSERT OR IGNORE INTO projects(project_id, user_id, name, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?)
        """,
        (project_id, user_id, name, created_at, updated_at),
    )

    for study in (doc.get("studies") or []):
        study_id = study.get("study_id")
        if study_id is None:
            continue
        now = _now()
        conn.execute(
            """
            INSERT OR REPLACE INTO project_studies(
                project_id, study_id, study_title, study_abstract,
                pi_name, pi_email, pi_affiliation, lab_person_name,
                summary_text, added_at, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                int(study_id),
                study.get("study_title") or "",
                study.get("study_abstract") or "",
                study.get("pi_name"),
                study.get("pi_email"),
                study.get("pi_affiliation"),
                study.get("lab_person_name"),
                study.get("summary_text"),
                study.get("added_at") or now,
                study.get("updated_at") or now,
            ),
        )

    for chat in (doc.get("chats") or []):
        chat_id = str(chat.get("chat_id") or str(uuid.uuid4())[:8])
        chat_created = chat.get("created_at") or _now()
        chat_updated = chat.get("updated_at") or chat_created
        title = (chat.get("title") or "New chat")[:60].strip() or "New chat"

        conn.execute(
            """
            INSERT OR REPLACE INTO project_chats(chat_id, project_id, user_id, title, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (chat_id, project_id, user_id, title, chat_created, chat_updated),
        )

        for msg in (chat.get("messages") or []):
            role = (msg.get("role") or "user").strip() or "user"
            if role not in ("user", "assistant"):
                role = "user"
            content = msg.get("content") or ""
            conn.execute(
                """
                INSERT INTO project_chat_messages(chat_id, role, content, created_at)
                VALUES(?, ?, ?, ?)
                """,
                (chat_id, role, content, msg.get("created_at") or _now()),
            )


def _insert_global_bucket(conn, doc):
    bucket_user = (doc.get("user_id") or "default").strip() or "default"
    for chat in (doc.get("global_chats") or []):
        chat_id = str(chat.get("chat_id") or str(uuid.uuid4())[:8])
        chat_created = chat.get("created_at") or _now()
        chat_updated = chat.get("updated_at") or chat_created
        title = (chat.get("title") or "New chat")[:60].strip() or "New chat"

        conn.execute(
            """
            INSERT OR REPLACE INTO global_chats(chat_id, user_id, title, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?)
            """,
            (chat_id, bucket_user, title, chat_created, chat_updated),
        )

        for msg in (chat.get("messages") or []):
            role = (msg.get("role") or "user").strip() or "user"
            if role not in ("user", "assistant"):
                role = "user"
            content = msg.get("content") or ""
            conn.execute(
                """
                INSERT INTO global_chat_messages(chat_id, role, content, created_at)
                VALUES(?, ?, ?, ?)
                """,
                (chat_id, role, content, msg.get("created_at") or _now()),
            )


def _migrate_from_tinydb(conn):
    docs = _parse_tinydb_docs(TINYDB_PRIMARY_PATH)
    if not docs:
        docs = _parse_tinydb_docs(TINYDB_LEGACY_TMP_PATH)

    for doc in docs:
        if doc.get("project_id"):
            _insert_project_doc(conn, doc)
            continue
        bucket_type = str(doc.get("bucket_type") or "")
        if bucket_type.startswith("global_chats::"):
            _insert_global_bucket(conn, doc)


def _bootstrap():
    with _conn() as conn:
        _create_schema(conn)
        if _should_migrate(conn):
            _migrate_from_tinydb(conn)
            _mark_migration(conn)
        elif conn.execute("SELECT value FROM meta WHERE key='tinydb_imported'").fetchone() is None:
            _mark_migration(conn)
        conn.commit()


_bootstrap()


def _project_exists(conn, project_id, user_id):
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ? AND user_id = ?",
        (project_id, user_id),
    ).fetchone()
    return row is not None


def list_projects(user_id: str):
    user_id = (user_id or "").strip() or "default"
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT p.project_id, p.name, p.created_at, p.updated_at,
                   (SELECT COUNT(1) FROM project_studies ps WHERE ps.project_id = p.project_id) AS studies_count,
                   (SELECT COUNT(1) FROM project_chats pc WHERE pc.project_id = p.project_id) AS chats_count
            FROM projects p
            WHERE p.user_id = ?
            ORDER BY p.updated_at DESC, p.created_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [_as_dict(r) for r in rows]


def _load_project_studies(conn, project_id):
    rows = conn.execute(
        """
        SELECT study_id, study_title, study_abstract, pi_name, pi_email, pi_affiliation,
               lab_person_name, summary_text, added_at, updated_at
        FROM project_studies
        WHERE project_id = ?
        ORDER BY added_at DESC, study_id ASC
        """,
        (project_id,),
    ).fetchall()
    return [_as_dict(r) for r in rows]


def _load_project_chat_messages(conn, chat_id):
    rows = conn.execute(
        """
        SELECT role, content, created_at
        FROM project_chat_messages
        WHERE chat_id = ?
        ORDER BY id ASC
        """,
        (chat_id,),
    ).fetchall()
    return [_as_dict(r) for r in rows]


def _load_project_chats(conn, project_id):
    rows = conn.execute(
        """
        SELECT chat_id, title, created_at, updated_at
        FROM project_chats
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
        """,
        (project_id,),
    ).fetchall()
    chats = []
    for row in rows:
        item = _as_dict(row)
        item["messages"] = _load_project_chat_messages(conn, row["chat_id"])
        chats.append(item)
    return chats


def create_project(user_id: str, name: str):
    user_id = (user_id or "").strip() or "default"
    name = (name or "Untitled").strip() or "Untitled"
    project_id = str(uuid.uuid4())[:8]
    now = _now()
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO projects(project_id, user_id, name, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?)
            """,
            (project_id, user_id, name, now, now),
        )
        conn.commit()
    return get_project(project_id, user_id)


def get_project(project_id: str, user_id: str = None):
    with _conn() as conn:
        if user_id is not None:
            resolved_user = (user_id or "").strip() or "default"
            row = conn.execute(
                "SELECT project_id, user_id, name, created_at, updated_at FROM projects WHERE project_id = ? AND user_id = ?",
                (project_id, resolved_user),
            ).fetchone()
            if row is None:
                row = conn.execute(
                    "SELECT project_id, user_id, name, created_at, updated_at FROM projects WHERE project_id = ?",
                    (project_id,),
                ).fetchone()
        else:
            row = conn.execute(
                "SELECT project_id, user_id, name, created_at, updated_at FROM projects WHERE project_id = ?",
                (project_id,),
            ).fetchone()
        if row is None:
            return None
        project = _as_dict(row)
        project["studies"] = _load_project_studies(conn, project_id)
        project["chats"] = _load_project_chats(conn, project_id)
        return project


def update_project(project_id: str, user_id: str, name: str = None):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        if not _project_exists(conn, project_id, resolved_user):
            return None
        if name is None:
            conn.execute(
                "UPDATE projects SET updated_at = ? WHERE project_id = ? AND user_id = ?",
                (_now(), project_id, resolved_user),
            )
        else:
            clean_name = (name or "").strip() or "Untitled"
            conn.execute(
                "UPDATE projects SET name = ?, updated_at = ? WHERE project_id = ? AND user_id = ?",
                (clean_name, _now(), project_id, resolved_user),
            )
        conn.commit()
    return get_project(project_id, resolved_user)


def delete_project(project_id: str, user_id: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        conn.execute(
            "DELETE FROM projects WHERE project_id = ? AND user_id = ?",
            (project_id, resolved_user),
        )
        conn.commit()
    return True


def add_study_to_project(project_id: str, user_id: str, study: dict):
    resolved_user = (user_id or "").strip() or "default"
    if not study or study.get("study_id") is None:
        return None
    with _conn() as conn:
        if not _project_exists(conn, project_id, resolved_user):
            return None
        now = _now()
        conn.execute(
            """
            INSERT OR IGNORE INTO project_studies(
                project_id, study_id, study_title, study_abstract, pi_name,
                pi_email, pi_affiliation, lab_person_name, summary_text,
                added_at, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                int(study.get("study_id")),
                study.get("study_title") or "",
                study.get("study_abstract") or "",
                study.get("pi_name"),
                study.get("pi_email"),
                study.get("pi_affiliation"),
                study.get("lab_person_name"),
                study.get("summary_text"),
                now,
                now,
            ),
        )
        conn.execute(
            "DELETE FROM project_context_summaries WHERE project_id = ?",
            (project_id,),
        )
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE project_id = ? AND user_id = ?",
            (_now(), project_id, resolved_user),
        )
        conn.commit()
    return get_project(project_id, resolved_user)


def remove_study_from_project(project_id: str, user_id: str, study_id):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        if not _project_exists(conn, project_id, resolved_user):
            return None
        conn.execute(
            "DELETE FROM project_studies WHERE project_id = ? AND study_id = ?",
            (project_id, int(study_id)),
        )
        conn.execute(
            "DELETE FROM project_context_summaries WHERE project_id = ?",
            (project_id,),
        )
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE project_id = ? AND user_id = ?",
            (_now(), project_id, resolved_user),
        )
        conn.commit()
    return get_project(project_id, resolved_user)


def list_chats(project_id: str, user_id: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        if not _project_exists(conn, project_id, resolved_user):
            return []
        rows = conn.execute(
            """
            SELECT pc.chat_id, pc.title, pc.created_at, pc.updated_at,
                   (SELECT COUNT(1) FROM project_chat_messages m WHERE m.chat_id = pc.chat_id) AS messages_count
            FROM project_chats pc
            WHERE pc.project_id = ? AND pc.user_id = ?
            ORDER BY pc.updated_at DESC, pc.created_at DESC
            """,
            (project_id, resolved_user),
        ).fetchall()
    return [_as_dict(r) for r in rows]


def get_chat(project_id: str, user_id: str, chat_id: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT chat_id, title, created_at, updated_at
            FROM project_chats
            WHERE project_id = ? AND user_id = ? AND chat_id = ?
            """,
            (project_id, resolved_user, chat_id),
        ).fetchone()
        if row is None:
            return None
        chat = _as_dict(row)
        chat["messages"] = _load_project_chat_messages(conn, chat_id)
        return chat


def create_chat(project_id: str, user_id: str, first_message: str = None):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        if not _project_exists(conn, project_id, resolved_user):
            return None
        chat_id = str(uuid.uuid4())[:8]
        title = (first_message or "New chat")[:60].strip() or "New chat"
        now = _now()
        conn.execute(
            """
            INSERT INTO project_chats(chat_id, project_id, user_id, title, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (chat_id, project_id, resolved_user, title, now, now),
        )
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE project_id = ? AND user_id = ?",
            (_now(), project_id, resolved_user),
        )
        conn.commit()
    return get_chat(project_id, resolved_user, chat_id)


def append_chat_messages(project_id: str, user_id: str, chat_id: str, user_content: str, assistant_content: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        exists = conn.execute(
            "SELECT chat_id, title FROM project_chats WHERE project_id = ? AND user_id = ? AND chat_id = ?",
            (project_id, resolved_user, chat_id),
        ).fetchone()
        if exists is None:
            return None

        now = _now()
        conn.execute(
            "INSERT INTO project_chat_messages(chat_id, role, content, created_at) VALUES(?, 'user', ?, ?)",
            (chat_id, user_content or "", now),
        )
        conn.execute(
            "INSERT INTO project_chat_messages(chat_id, role, content, created_at) VALUES(?, 'assistant', ?, ?)",
            (chat_id, assistant_content or "", now),
        )

        title = exists["title"] or "New chat"
        if title == "New chat":
            title = (user_content or "New chat")[:60].strip() or "New chat"

        conn.execute(
            "UPDATE project_chats SET title = ?, updated_at = ? WHERE chat_id = ?",
            (title, _now(), chat_id),
        )
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE project_id = ? AND user_id = ?",
            (_now(), project_id, resolved_user),
        )
        conn.commit()

    return get_chat(project_id, resolved_user, chat_id)


def delete_chat(project_id: str, user_id: str, chat_id: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        conn.execute(
            "DELETE FROM project_chats WHERE project_id = ? AND user_id = ? AND chat_id = ?",
            (project_id, resolved_user, chat_id),
        )
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE project_id = ? AND user_id = ?",
            (_now(), project_id, resolved_user),
        )
        conn.commit()
    return get_project(project_id, resolved_user)


def list_global_chats(user_id: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT gc.chat_id, gc.title, gc.created_at, gc.updated_at,
                   (SELECT COUNT(1) FROM global_chat_messages m WHERE m.chat_id = gc.chat_id) AS messages_count
            FROM global_chats gc
            WHERE gc.user_id = ?
            ORDER BY gc.updated_at DESC, gc.created_at DESC
            """,
            (resolved_user,),
        ).fetchall()
    return [_as_dict(r) for r in rows]


def _load_global_messages(conn, chat_id):
    rows = conn.execute(
        "SELECT role, content, created_at FROM global_chat_messages WHERE chat_id = ? ORDER BY id ASC",
        (chat_id,),
    ).fetchall()
    return [_as_dict(r) for r in rows]


def get_global_chat(user_id: str, chat_id: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        row = conn.execute(
            "SELECT chat_id, title, created_at, updated_at FROM global_chats WHERE user_id = ? AND chat_id = ?",
            (resolved_user, chat_id),
        ).fetchone()
        if row is None:
            return None
        chat = _as_dict(row)
        chat["messages"] = _load_global_messages(conn, chat_id)
        return chat


def create_global_chat(user_id: str, title: str = None):
    resolved_user = (user_id or "").strip() or "default"
    chat_id = str(uuid.uuid4())[:8]
    now = _now()
    resolved_title = (title or "New chat")[:60].strip() or "New chat"
    with _conn() as conn:
        conn.execute(
            "INSERT INTO global_chats(chat_id, user_id, title, created_at, updated_at) VALUES(?, ?, ?, ?, ?)",
            (chat_id, resolved_user, resolved_title, now, now),
        )
        conn.commit()
    return get_global_chat(resolved_user, chat_id)


def append_global_chat_messages(user_id: str, chat_id: str, user_content: str, assistant_content: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        row = conn.execute(
            "SELECT title FROM global_chats WHERE user_id = ? AND chat_id = ?",
            (resolved_user, chat_id),
        ).fetchone()
        if row is None:
            return None

        now = _now()
        conn.execute(
            "INSERT INTO global_chat_messages(chat_id, role, content, created_at) VALUES(?, 'user', ?, ?)",
            (chat_id, user_content or "", now),
        )
        conn.execute(
            "INSERT INTO global_chat_messages(chat_id, role, content, created_at) VALUES(?, 'assistant', ?, ?)",
            (chat_id, assistant_content or "", now),
        )

        title = row["title"] or "New chat"
        if title == "New chat":
            title = (user_content or "New chat")[:60].strip() or "New chat"

        conn.execute(
            "UPDATE global_chats SET title = ?, updated_at = ? WHERE user_id = ? AND chat_id = ?",
            (title, _now(), resolved_user, chat_id),
        )
        conn.commit()

    return get_global_chat(resolved_user, chat_id)


def delete_global_chat(user_id: str, chat_id: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        conn.execute(
            "DELETE FROM global_chats WHERE user_id = ? AND chat_id = ?",
            (resolved_user, chat_id),
        )
        conn.commit()
    return {"ok": True}


def upsert_project_study_summary(project_id: str, user_id: str, study_id: int, summary_text: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        if not _project_exists(conn, project_id, resolved_user):
            return False
        conn.execute(
            """
            UPDATE project_studies
            SET summary_text = ?, updated_at = ?
            WHERE project_id = ? AND study_id = ?
            """,
            (summary_text or "", _now(), project_id, int(study_id)),
        )
        conn.commit()
    return True


def get_project_context_summary(project_id: str, user_id: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        if not _project_exists(conn, project_id, resolved_user):
            return None
        row = conn.execute(
            "SELECT summary_text, source_updated_at, created_at, updated_at FROM project_context_summaries WHERE project_id = ?",
            (project_id,),
        ).fetchone()
    return _as_dict(row)


def upsert_project_context_summary(project_id: str, user_id: str, summary_text: str, source_updated_at: str = None):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        if not _project_exists(conn, project_id, resolved_user):
            return False
        now = _now()
        conn.execute(
            """
            INSERT INTO project_context_summaries(project_id, summary_text, source_updated_at, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
                summary_text = excluded.summary_text,
                source_updated_at = excluded.source_updated_at,
                updated_at = excluded.updated_at
            """,
            (project_id, summary_text or "", source_updated_at, now, now),
        )
        conn.commit()
    return True


def list_project_studies(project_id: str, user_id: str):
    resolved_user = (user_id or "").strip() or "default"
    with _conn() as conn:
        if not _project_exists(conn, project_id, resolved_user):
            return []
        return _load_project_studies(conn, project_id)
