# backend/run.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from qiita_db.sql_connection import TRN
import json
from dotenv import load_dotenv
import os

from store import (
    list_projects,
    create_project,
    get_project,
    update_project,
    delete_project,
    add_study_to_project,
    remove_study_from_project,
    list_chats,
    get_chat,
    create_chat,
    append_chat_messages,
    delete_chat,
)

load_dotenv()
API_KEY = os.getenv("API_KEY")

app = Flask(__name__)
CORS(app)

client = OpenAI(
    api_key=API_KEY,
    base_url="https://ellm.nrp-nautilus.io/v1"
)

CHAT_SYSTEM_PROMPT = """You are a helpful assistant for researchers using the Qiita microbiome database.

Your primary goals:
- Help users reason about microbiome concepts, analysis strategies, and how to use Qiita.
- NEVER invent specific Qiita study IDs, titles, sample counts, metadata fields, or publication details.
- When you mention specific studies, ONLY use the study IDs and titles that are explicitly provided to you in the project context.

Behavioural rules:
- If the user asks about a study that is not present in the provided context, say that you do not have that study's details and suggest using the Qiita search interface in this app.
- If you are unsure about any factual detail, clearly say you are unsure instead of guessing.
- It is always acceptable to answer at a high-level (conceptual explanation) without naming specific studies.
- If the user asks about obviously out‑of‑domain or fictional entities (e.g. “Voldemort”), make it clear that these are not Qiita studies and do NOT fabricate any matching study records.

When answering:
- Prefer concise, technically accurate explanations.
- Use bullet points and short paragraphs where helpful.
- Do not output SQL or code unless the user explicitly asks for it."""


def search_studies_with_sql(custom_sql_where="", params=None):
    if params is None:
        params = []

    with TRN:
        sql = f"""
        SELECT DISTINCT s.study_id, s.study_title, s.study_abstract,
               sp_pi.name as pi_name, sp_pi.email as pi_email,
               sp_pi.affiliation as pi_affiliation,
               sp_lab.name as lab_person_name
        FROM qiita.study s
        LEFT JOIN qiita.study_person sp_pi
            ON s.principal_investigator_id = sp_pi.study_person_id
        LEFT JOIN qiita.study_person sp_lab
            ON s.lab_person_id = sp_lab.study_person_id
        LEFT JOIN qiita.study_artifact sa ON s.study_id = sa.study_id
        LEFT JOIN qiita.artifact a ON sa.artifact_id = a.artifact_id
        LEFT JOIN qiita.visibility v ON a.visibility_id = v.visibility_id
        WHERE {custom_sql_where if custom_sql_where else '1=1'}
        ORDER BY s.study_id
        """
        TRN.add(sql, params)
        results = TRN.execute_fetchindex()

    if not results:
        return []

    studies = []
    for row in results:
        studies.append({
            'study_id': row[0],
            'study_title': row[1],
            'study_abstract': row[2],
            'pi_name': row[3],
            'pi_email': row[4],
            'pi_affiliation': row[5],
            'lab_person_name': row[6]
        })
    return studies


def llm_query_to_sql(user_query):
    system_prompt = """You are a SQL query generator for a microbiome study database (Qiita).

        Available tables and columns:
        - s.study_id (integer)
        - s.study_title (text)
        - s.study_abstract (text)
        - sp_pi.name (text) - Principal Investigator name
        - sp_pi.email (text) - PI email
        - sp_pi.affiliation (text) - PI institution
        - sp_lab.name (text) - Lab person name
        - v.visibility (text) - Values: 'public', 'private', 'sandbox', 'awaiting_approval'

        Your task:
        1. Convert the user's natural language query into a PostgreSQL WHERE clause
        2. Use ILIKE for case-insensitive text matching (e.g., field ILIKE '%keyword%')
        3. Use parameterized queries with %s placeholders
        4. Return ONLY a JSON object with 'where_clause' and 'params' fields

        Examples:

        User: "Find studies about soil microbiome"
        Response: {
        "where_clause": "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s)",
        "params": ["%soil%", "%soil%"]
        }

        User: "Studies by Rob Knight"
        Response: {
        "where_clause": "sp_pi.name ILIKE %s",
        "params": ["%Rob Knight%"]
        }

        Return ONLY valid JSON, no other text."""

    message = client.chat.completions.create(
        model="gemma3",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query}
        ]
    )

    raw = message.choices[0].message.content
    if raw is None:
        raw = ""
    response_text = (raw or "").strip()
    if not response_text:
        response_text = "{}"
    if response_text.startswith("```"):
        parts = response_text.split("```")
        response_text = parts[1] if len(parts) > 1 else response_text
        if response_text.startswith("json"):
            response_text = response_text[4:]
        response_text = response_text.strip()

    try:
        out = json.loads(response_text)
        if not isinstance(out, dict) or "where_clause" not in out or "params" not in out:
            raise ValueError("missing where_clause or params")
        return out
    except (json.JSONDecodeError, ValueError):
        keywords = user_query.lower().replace("find", "").replace("studies", "").replace("about", "").strip()
        if not keywords:
            keywords = user_query.strip() or "%"
        return {
            "where_clause": "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s)",
            "params": [f"%{keywords}%", f"%{keywords}%"]
        }


@app.route('/api/search', methods=['POST'])
def search():
    try:
        data = request.get_json()
        user_query = data.get('query', '')

        # #region agent log
        import json as _json, time as _time
        with open("/Users/dhruvsharma/Downloads/Projects/qiita-web/.cursor/debug-576eb6.log", "a") as _f:
            _f.write(_json.dumps({
                "sessionId": "576eb6",
                "runId": "pre-fix",
                "hypothesisId": "H1",
                "location": "Experiment/backend/run.py:search",
                "message": "search_request",
                "data": {"query": user_query},
                "timestamp": int(_time.time() * 1000),
            }) + "\n")
        # #endregion

        if not user_query:
            return jsonify({'error': 'Query is required'}), 400

        sql_query = llm_query_to_sql(user_query)
        where_clause = sql_query.get('where_clause') or '1=1'
        params = sql_query.get('params') if isinstance(sql_query.get('params'), list) else []
        results = search_studies_with_sql(custom_sql_where=where_clause, params=params)

        # #region agent log
        with open("/Users/dhruvsharma/Downloads/Projects/qiita-web/.cursor/debug-576eb6.log", "a") as _f:
            _f.write(_json.dumps({
                "sessionId": "576eb6",
                "runId": "pre-fix",
                "hypothesisId": "H2",
                "location": "Experiment/backend/run.py:search",
                "message": "search_response",
                "data": {
                    "where_clause": where_clause,
                    "params": params,
                    "count": len(results) if isinstance(results, list) else None,
                },
                "timestamp": int(_time.time() * 1000),
            }) + "\n")
        # #endregion

        return jsonify({
            'results': results if isinstance(results, list) else [],
            'sql_query': sql_query,
            'count': len(results) if isinstance(results, list) else 0
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        # #region agent log
        import json as _json, time as _time
        with open("/Users/dhruvsharma/Downloads/Projects/qiita-web/.cursor/debug-576eb6.log", "a") as _f:
            _f.write(_json.dumps({
                "sessionId": "576eb6",
                "runId": "pre-fix",
                "hypothesisId": "H3",
                "location": "Experiment/backend/run.py:search",
                "message": "search_error",
                "data": {"error": str(e)},
                "timestamp": int(_time.time() * 1000),
            }) + "\n")
        # #endregion
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


def _build_study_context_block(project: dict):
    """Build a short textual context of saved studies for the LLM."""
    if not project:
        return None
    studies = project.get("studies") or []
    if not studies:
        return None
    lines = []
    for s in studies[:10]:
        sid = s.get("study_id")
        title = (s.get("study_title") or "").strip()
        if len(title) > 120:
            title = title[:117] + "..."
        lines.append(f"- ID {sid}: {title}")
    if not lines:
        return None
    return (
        "You have access to the following saved Qiita studies in this project. "
        "When referencing specific studies, ONLY use these IDs and titles:\n"
        + "\n".join(lines)
    )


def llm_chat(messages, study_context_text: str):
    """Conversation with LLM.

    Parameters
    ----------
    messages: list of {role, content}
        Previous turns plus the new user message.
    study_context_text: str, optional
        Optional textual summary of project studies to ground answers.
    """
    # Keep only the most recent turns to limit prompt size
    trimmed = messages[-10:] if len(messages) > 10 else list(messages)

    system_content = CHAT_SYSTEM_PROMPT
    if study_context_text:
        system_content = f"{system_content}\n\nPROJECT STUDY CONTEXT:\n{study_context_text}"

    api_messages = [{"role": "system", "content": system_content}]
    for m in trimmed:
        role = m.get("role") or "user"
        if role not in ("user", "assistant"):
            role = "user"
        content = (m.get("content") or "").strip()
        api_messages.append({"role": role, "content": content})

    r = client.chat.completions.create(model="gemma3", messages=api_messages)
    return (r.choices[0].message.content or "").strip()


# --- Projects API ---

@app.route('/api/projects', methods=['GET'])
def api_list_projects():
    user_id = request.args.get('user_id') or 'default'
    return jsonify({'projects': list_projects(user_id)})


@app.route('/api/projects', methods=['POST'])
def api_create_project():
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    name = (data.get('name') or 'Untitled').strip() or 'Untitled'
    proj = create_project(user_id, name)
    if not proj:
        return jsonify({'error': 'Failed to create project'}), 500
    return jsonify(proj)


@app.route('/api/projects/<project_id>', methods=['GET'])
def api_get_project(project_id):
    user_id = request.args.get('user_id') or 'default'
    proj = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(proj)


@app.route('/api/projects/<project_id>', methods=['PATCH'])
def api_update_project(project_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    name = data.get('name')
    proj = update_project(project_id, user_id, name=name)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(proj)


@app.route('/api/projects/<project_id>', methods=['DELETE'])
def api_delete_project(project_id):
    user_id = request.args.get('user_id') or request.get_json(silent=True) or {}
    if isinstance(user_id, dict):
        user_id = user_id.get('user_id') or 'default'
    else:
        user_id = user_id or 'default'
    delete_project(project_id, user_id)
    return jsonify({'ok': True})


@app.route('/api/projects/<project_id>/studies', methods=['POST'])
def api_add_study(project_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    study = data.get('study')
    if not study or study.get('study_id') is None:
        return jsonify({'error': 'study with study_id required'}), 400
    proj = add_study_to_project(project_id, user_id, study)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(proj)


@app.route('/api/projects/<project_id>/studies/<int:study_id>', methods=['DELETE'])
def api_remove_study(project_id, study_id):
    user_id = request.args.get('user_id') or 'default'
    proj = remove_study_from_project(project_id, user_id, study_id)
    if proj is None:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(proj)


# --- Chats API ---

@app.route('/api/projects/<project_id>/chats', methods=['GET'])
def api_list_chats(project_id):
    user_id = request.args.get('user_id') or 'default'
    chats = list_chats(project_id, user_id)
    return jsonify({'chats': chats})


@app.route('/api/projects/<project_id>/chats', methods=['POST'])
def api_create_chat(project_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    proj = get_project(project_id, user_id)
    if not proj:
        return jsonify({'error': 'Project not found'}), 404
    first_message = (data.get('message') or data.get('first_message') or '').strip()
    chat = create_chat(project_id, user_id, first_message or data.get('title'))
    if first_message:
        study_ctx = _build_study_context_block(proj)
        assistant_content = llm_chat([{"role": "user", "content": first_message}], study_context_text=study_ctx)
        append_chat_messages(project_id, user_id, chat["chat_id"], first_message, assistant_content)
        chat = get_chat(project_id, user_id, chat["chat_id"])
    return jsonify(chat)


@app.route('/api/projects/<project_id>/chats/<chat_id>', methods=['GET'])
def api_get_chat(project_id, chat_id):
    user_id = request.args.get('user_id') or 'default'
    chat = get_chat(project_id, user_id, chat_id)
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
    """Send a message; LLM replies and both are persisted."""
    data = request.get_json() or {}
    user_id = (data.get('user_id') or 'default').strip() or 'default'
    user_content = (data.get('message') or data.get('content') or '').strip()
    if not user_content:
        return jsonify({'error': 'message required'}), 400
    chat = get_chat(project_id, user_id, chat_id)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404
    proj = get_project(project_id, user_id)
    study_ctx = _build_study_context_block(proj)
    messages = chat.get('messages') or []
    full_messages = [{"role": m.get("role"), "content": m.get("content")} for m in messages]
    full_messages.append({"role": "user", "content": user_content})
    assistant_content = llm_chat(full_messages, study_context_text=study_ctx)
    append_chat_messages(project_id, user_id, chat_id, user_content, assistant_content)
    updated = get_chat(project_id, user_id, chat_id)
    return jsonify(updated)


if __name__ == '__main__':
    print("QIITA SEARCH API — http://localhost:5001")
    app.run(debug=True, host='0.0.0.0', port=5001)
