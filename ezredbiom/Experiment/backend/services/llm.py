# backend/services/llm.py
from openai import OpenAI
from dotenv import load_dotenv
import os
import json

load_dotenv()
API_KEY = os.getenv("API_KEY")


client = OpenAI(
    api_key=API_KEY,
    base_url="https://ellm.nrp-nautilus.io/v1"
)


def llm_query_to_sql(user_query):
    """Convert natural language query to SQL using LLM (robust, conservative)."""
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

        Behavioural rules:
        - If the query is clearly unrelated to microbiome or Qiita (e.g. fictional characters),
          still produce a simple, broad ILIKE filter on study_title / study_abstract using
          the query terms, but do NOT invent additional fields or complex logic.
        - If you are unsure how to interpret the query, prefer a broad keyword match over
          overly specific assumptions.

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
        model="qwen3",
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

    # Remove markdown code blocks if present
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
        print(f"Warning: Could not parse LLM response for search: {response_text}")
        # Extract keywords from query
        keywords = user_query.lower().replace("find", "").replace("studies", "").replace("about", "").strip()
        if not keywords:
            keywords = user_query.strip() or "%"
        return {
            "where_clause": "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s)",
            "params": [f"%{keywords}%", f"%{keywords}%"]
        }