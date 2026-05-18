"""Project, study, and chat CRUD built on top of the sql_store_db core."""

import json
import uuid

from sql_store_db import _conn, _as_dict, _now, _resolve_user


def _project_exists(conn, project_id, user_id):
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ? AND user_id = ?",
        (project_id, user_id),
    ).fetchone()
    return row is not None


def list_projects(user_id: str, limit: int = 100):
    user_id = _resolve_user(user_id)
    limit = max(1, min(500, int(limit)))
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT p.project_id, p.name, p.created_at, p.updated_at,
                   (SELECT COUNT(1) FROM project_studies ps WHERE ps.project_id = p.project_id) AS studies_count,
                   (SELECT COUNT(1) FROM project_chats pc WHERE pc.project_id = p.project_id) AS chats_count
            FROM projects p
            WHERE p.user_id = ?
            ORDER BY p.updated_at DESC, p.created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    return [_as_dict(r) for r in rows]


def _load_project_studies(conn, project_id):
    rows = conn.execute(
        """
        SELECT study_id, study_title, study_abstract, pi_name, pi_email, pi_affiliation,
               lab_person_name, summary_text, data_types, num_samples, num_preps, preps_json,
               added_at, updated_at
        FROM project_studies
        WHERE project_id = ?
        ORDER BY added_at DESC, study_id ASC
        """,
        (project_id,),
    ).fetchall()
    return [_as_dict(r) for r in rows]


def _decode_ui(value):
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def _load_project_chat_messages(conn, chat_id):
    rows = conn.execute(
        """
        SELECT role, content, ui_payload, created_at
        FROM project_chat_messages
        WHERE chat_id = ?
        ORDER BY id ASC
        """,
        (chat_id,),
    ).fetchall()
    return [{**_as_dict(r), "ui_payload": _decode_ui(r["ui_payload"])} for r in rows]


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
    if not rows:
        return []
    chat_ids = [r["chat_id"] for r in rows]
    placeholders = ",".join("?" * len(chat_ids))
    msg_rows = conn.execute(
        f"SELECT chat_id, role, content, ui_payload, created_at FROM project_chat_messages "
        f"WHERE chat_id IN ({placeholders}) ORDER BY id ASC",
        chat_ids,
    ).fetchall()
    messages_by_chat = {}
    for msg in msg_rows:
        messages_by_chat.setdefault(msg["chat_id"], []).append(
            {**_as_dict(msg), "ui_payload": _decode_ui(msg["ui_payload"])}
        )
    return [
        {**_as_dict(row), "messages": messages_by_chat.get(row["chat_id"], [])}
        for row in rows
    ]


def create_project(user_id: str, name: str):
    user_id = _resolve_user(user_id)
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
            resolved_user = _resolve_user(user_id)
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
    resolved_user = _resolve_user(user_id)
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
    resolved_user = _resolve_user(user_id)
    with _conn() as conn:
        conn.execute(
            "DELETE FROM projects WHERE project_id = ? AND user_id = ?",
            (project_id, resolved_user),
        )
        conn.commit()
    return True


def add_study_to_project(project_id: str, user_id: str, study: dict):
    resolved_user = _resolve_user(user_id)
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
                data_types, num_samples, num_preps, preps_json,
                added_at, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                study.get("data_types"),
                study.get("num_samples"),
                study.get("num_preps"),
                study.get("preps_json"),
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
    resolved_user = _resolve_user(user_id)
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


def get_project_studies_only(project_id: str):
    """Lightweight fetch — returns only the studies list, skipping chats and messages."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT project_id, user_id, name, created_at, updated_at FROM projects WHERE project_id = ?",
            (project_id,),
        ).fetchone()
        if row is None:
            return None
        project = _as_dict(row)
        project["studies"] = _load_project_studies(conn, project_id)
        return project


def list_chats(project_id: str, user_id: str, limit: int = 200):
    resolved_user = _resolve_user(user_id)
    limit = max(1, min(500, int(limit)))
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
            LIMIT ?
            """,
            (project_id, resolved_user, limit),
        ).fetchall()
    return [_as_dict(r) for r in rows]


def get_chat(project_id: str, user_id: str, chat_id: str):
    from sql_store_cache import SCOPE_PROJECT, _load_pinned_studies
    resolved_user = _resolve_user(user_id)
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
        chat["pinned_studies"] = _load_pinned_studies(conn, chat_id, SCOPE_PROJECT)
        total = conn.execute(
            "SELECT COUNT(1) AS c FROM project_studies WHERE project_id = ?",
            (project_id,),
        ).fetchone()
        chat["total_studies_in_project"] = int(total["c"]) if total else 0
        return chat


def create_chat(project_id: str, user_id: str, first_message: str = None):
    resolved_user = _resolve_user(user_id)
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
            (now, project_id, resolved_user),
        )
        conn.commit()
    return get_chat(project_id, resolved_user, chat_id)


def _insert_chat_message_pair(
    conn,
    messages_table: str,
    chat_id: str,
    user_content: str,
    assistant_content: str,
    assistant_ui_payload: dict,
    now: str,
):
    conn.execute(
        f"INSERT INTO {messages_table}(chat_id, role, content, created_at) VALUES(?, 'user', ?, ?)",
        (chat_id, user_content or "", now),
    )
    ui_json = json.dumps(assistant_ui_payload) if assistant_ui_payload else None
    conn.execute(
        f"INSERT INTO {messages_table}(chat_id, role, content, ui_payload, created_at) VALUES(?, 'assistant', ?, ?, ?)",
        (chat_id, assistant_content or "", ui_json, now),
    )


def _resolved_chat_title(existing_title: str, user_content: str) -> str:
    title = existing_title or "New chat"
    if title == "New chat":
        title = (user_content or "New chat")[:60].strip() or "New chat"
    return title


def append_chat_messages(
    project_id: str,
    user_id: str,
    chat_id: str,
    user_content: str,
    assistant_content: str,
    assistant_ui_payload: dict = None,
):
    resolved_user = _resolve_user(user_id)
    with _conn() as conn:
        exists = conn.execute(
            "SELECT chat_id, title FROM project_chats WHERE project_id = ? AND user_id = ? AND chat_id = ?",
            (project_id, resolved_user, chat_id),
        ).fetchone()
        if exists is None:
            return None

        now = _now()
        _insert_chat_message_pair(
            conn, "project_chat_messages", chat_id,
            user_content, assistant_content, assistant_ui_payload, now,
        )
        title = _resolved_chat_title(exists["title"], user_content)
        conn.execute(
            "UPDATE project_chats SET title = ?, updated_at = ? WHERE chat_id = ?",
            (title, now, chat_id),
        )
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE project_id = ? AND user_id = ?",
            (now, project_id, resolved_user),
        )
        conn.commit()

    return get_chat(project_id, resolved_user, chat_id)


def delete_chat(project_id: str, user_id: str, chat_id: str):
    resolved_user = _resolve_user(user_id)
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


def list_global_chats(user_id: str, limit: int = 200):
    resolved_user = _resolve_user(user_id)
    limit = max(1, min(500, int(limit)))
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT gc.chat_id, gc.title, gc.created_at, gc.updated_at,
                   (SELECT COUNT(1) FROM global_chat_messages m WHERE m.chat_id = gc.chat_id) AS messages_count
            FROM global_chats gc
            WHERE gc.user_id = ?
            ORDER BY gc.updated_at DESC, gc.created_at DESC
            LIMIT ?
            """,
            (resolved_user, limit),
        ).fetchall()
    return [_as_dict(r) for r in rows]


def _load_global_messages(conn, chat_id):
    rows = conn.execute(
        "SELECT role, content, ui_payload, created_at FROM global_chat_messages WHERE chat_id = ? ORDER BY id ASC",
        (chat_id,),
    ).fetchall()
    return [{**_as_dict(r), "ui_payload": _decode_ui(r["ui_payload"])} for r in rows]


def get_global_chat(user_id: str, chat_id: str):
    from sql_store_cache import SCOPE_GLOBAL, _load_pinned_studies
    resolved_user = _resolve_user(user_id)
    with _conn() as conn:
        row = conn.execute(
            "SELECT chat_id, title, created_at, updated_at FROM global_chats WHERE user_id = ? AND chat_id = ?",
            (resolved_user, chat_id),
        ).fetchone()
        if row is None:
            return None
        chat = _as_dict(row)
        chat["messages"] = _load_global_messages(conn, chat_id)
        chat["pinned_studies"] = _load_pinned_studies(conn, chat_id, SCOPE_GLOBAL)
        return chat


def create_global_chat(user_id: str, title: str = None):
    resolved_user = _resolve_user(user_id)
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


def append_global_chat_messages(
    user_id: str,
    chat_id: str,
    user_content: str,
    assistant_content: str,
    assistant_ui_payload: dict = None,
):
    resolved_user = _resolve_user(user_id)
    with _conn() as conn:
        row = conn.execute(
            "SELECT title FROM global_chats WHERE user_id = ? AND chat_id = ?",
            (resolved_user, chat_id),
        ).fetchone()
        if row is None:
            return None

        now = _now()
        _insert_chat_message_pair(
            conn, "global_chat_messages", chat_id,
            user_content, assistant_content, assistant_ui_payload, now,
        )
        title = _resolved_chat_title(row["title"], user_content)
        conn.execute(
            "UPDATE global_chats SET title = ?, updated_at = ? WHERE user_id = ? AND chat_id = ?",
            (title, now, resolved_user, chat_id),
        )
        conn.commit()

    return get_global_chat(resolved_user, chat_id)


def delete_global_chat(user_id: str, chat_id: str):
    resolved_user = _resolve_user(user_id)
    with _conn() as conn:
        conn.execute(
            "DELETE FROM global_chats WHERE user_id = ? AND chat_id = ?",
            (resolved_user, chat_id),
        )
        conn.commit()
    return {"ok": True}


# ============================================================================
# Tree-session helpers
# ============================================================================

def _gen_entry_id() -> str:
    return uuid.uuid4().hex[:8]


def _get_leaf_id(conn, chat_id: str):
    row = conn.execute(
        "SELECT leaf_id FROM project_chat_state WHERE chat_id = ?",
        (chat_id,),
    ).fetchone()
    return row["leaf_id"] if row else None


def _set_leaf_id(conn, chat_id: str, leaf_id: str):
    conn.execute(
        """
        INSERT INTO project_chat_state(chat_id, leaf_id)
        VALUES(?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET leaf_id = excluded.leaf_id
        """,
        (chat_id, leaf_id),
    )


def append_entry(
    chat_id: str,
    role: str,
    content: str,
    *,
    entry_type: str = "message",
    tool_call_id: str = None,
    tool_name: str = None,
    tool_args: dict = None,
    tool_details: dict = None,
    ui_payload: dict = None,
    is_error: bool = False,
) -> str:
    """Append a new entry as a child of the current leaf. Returns the new entry_id."""
    now = _now()
    with _conn() as conn:
        parent_id = _get_leaf_id(conn, chat_id)
        entry_id = _gen_entry_id()
        conn.execute(
            """
            INSERT INTO project_chat_messages(
                chat_id, role, content, entry_id, parent_id, entry_type,
                tool_call_id, tool_name, tool_args, tool_details,
                ui_payload, is_error, created_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chat_id,
                role,
                content or "",
                entry_id,
                parent_id,
                entry_type,
                tool_call_id,
                tool_name,
                json.dumps(tool_args) if tool_args else None,
                json.dumps(tool_details) if tool_details else None,
                json.dumps(ui_payload) if ui_payload else None,
                1 if is_error else 0,
                now,
            ),
        )
        _set_leaf_id(conn, chat_id, entry_id)
        conn.commit()
    return entry_id


def get_branch_entries(chat_id: str, from_entry_id: str = None):
    """Walk from from_entry_id (or current leaf) to root, return path in chronological order."""
    with _conn() as conn:
        if from_entry_id is None:
            from_entry_id = _get_leaf_id(conn, chat_id)
        if not from_entry_id:
            # Fall back to linear read for older chats without leaf tracking
            rows = conn.execute(
                "SELECT * FROM project_chat_messages WHERE chat_id = ? ORDER BY id ASC",
                (chat_id,),
            ).fetchall()
            return [_as_dict(r) for r in rows]

        # Build index: entry_id -> row
        all_rows = conn.execute(
            "SELECT * FROM project_chat_messages WHERE chat_id = ?",
            (chat_id,),
        ).fetchall()
    by_id = {r["entry_id"]: _as_dict(r) for r in all_rows if r["entry_id"]}

    # Walk from leaf to root
    path = []
    current = from_entry_id
    visited = set()
    while current and current not in visited:
        visited.add(current)
        row = by_id.get(current)
        if not row:
            break
        path.append(row)
        current = row.get("parent_id")

    path.reverse()
    return path


def build_chat_context(chat_id: str):
    """
    Walk the active branch and produce an OpenAI-compatible message list.
    Handles message, tool_call (in assistant), and tool_result entry types.
    Groups consecutive tool_calls from the same assistant turn.
    """
    entries = get_branch_entries(chat_id)
    messages = []
    i = 0
    while i < len(entries):
        e = entries[i]
        etype = e.get("entry_type") or "message"
        role = e.get("role") or "user"

        if etype == "branch_summary":
            # Inject as a user message so LLM sees context from abandoned branch
            messages.append({"role": "user", "content": f"[Branch context]\n{e.get('content', '')}"})
            i += 1
            continue

        if role in ("user", "assistant") and etype == "message":
            # Collect any tool_calls that immediately follow in the same assistant turn
            if role == "assistant":
                # Peek ahead for tool_call entries
                tool_calls = []
                j = i + 1
                while j < len(entries):
                    ne = entries[j]
                    if (ne.get("entry_type") == "tool_call" and ne.get("role") == "assistant"):
                        raw_args = ne.get("tool_args") or "{}"
                        try:
                            parsed_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                        except Exception:
                            parsed_args = {}
                        tool_calls.append({
                            "id": ne.get("tool_call_id") or ne.get("entry_id"),
                            "type": "function",
                            "function": {
                                "name": ne.get("tool_name") or "",
                                "arguments": json.dumps(parsed_args),
                            },
                        })
                        j += 1
                    else:
                        break
                msg = {"role": "assistant", "content": e.get("content") or ""}
                if tool_calls:
                    msg["tool_calls"] = tool_calls
                messages.append(msg)
                i = j  # skip the tool_call entries we peeked
            else:
                messages.append({"role": "user", "content": e.get("content") or ""})
                i += 1
            continue

        if role == "tool" or etype == "tool_result":
            messages.append({
                "role": "tool",
                "tool_call_id": e.get("tool_call_id") or e.get("entry_id"),
                "content": e.get("content") or "",
            })
            i += 1
            continue

        # Skip metadata entries (e.g. branch_summary that wasn't caught above)
        i += 1

    return messages


def set_chat_leaf(chat_id: str, entry_id: str) -> bool:
    """Move the chat's active leaf to a specific entry (for branching)."""
    with _conn() as conn:
        # Verify the entry belongs to this chat
        row = conn.execute(
            "SELECT entry_id FROM project_chat_messages WHERE chat_id = ? AND entry_id = ?",
            (chat_id, entry_id),
        ).fetchone()
        if not row:
            return False
        _set_leaf_id(conn, chat_id, entry_id)
        conn.commit()
    return True


def append_branch_summary(chat_id: str, from_entry_id: str, summary: str, resources: dict = None) -> str:
    """Append a branch_summary entry carrying context from an abandoned path."""
    with _conn() as conn:
        parent_id = _get_leaf_id(conn, chat_id)
        entry_id = _gen_entry_id()
        now = _now()
        conn.execute(
            """
            INSERT INTO project_chat_messages(
                chat_id, role, content, entry_id, parent_id, entry_type,
                tool_details, created_at
            ) VALUES(?, 'system', ?, ?, ?, 'branch_summary', ?, ?)
            """,
            (
                chat_id,
                summary,
                entry_id,
                parent_id,
                json.dumps({"from_id": from_entry_id, **(resources or {})}),
                now,
            ),
        )
        _set_leaf_id(conn, chat_id, entry_id)
        conn.commit()
    return entry_id


def get_chat_tree(chat_id: str) -> dict:
    """Return the full tree structure as {entry_id: {row, children: [entry_id, ...]}}."""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT entry_id, parent_id, role, content, entry_type, tool_name, created_at "
            "FROM project_chat_messages WHERE chat_id = ? AND entry_id IS NOT NULL ORDER BY id ASC",
            (chat_id,),
        ).fetchall()
        leaf_id = _get_leaf_id(conn, chat_id)

    nodes = {}
    for r in rows:
        eid = r["entry_id"]
        nodes[eid] = {
            "entry_id": eid,
            "parent_id": r["parent_id"],
            "role": r["role"],
            "label": _entry_label(r),
            "entry_type": r["entry_type"],
            "created_at": r["created_at"],
            "children": [],
        }
    for eid, node in nodes.items():
        pid = node["parent_id"]
        if pid and pid in nodes:
            nodes[pid]["children"].append(eid)

    return {"nodes": nodes, "leaf_id": leaf_id}


def _entry_label(row) -> str:
    etype = row["entry_type"] or "message"
    role = row["role"] or "user"
    if etype == "tool_call":
        return f"tool: {row['tool_name'] or '?'}"
    if etype == "tool_result":
        return "tool result"
    if etype == "branch_summary":
        return "branch summary"
    content = (row["content"] or "")[:60]
    return f"{role}: {content}"
