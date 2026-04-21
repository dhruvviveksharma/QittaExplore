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


def llm_extract_search_terms(user_query: str) -> list[str]:
    """Extract keyword search terms from a natural language query.

    The LLM returns only a JSON array of plain keyword strings — never SQL
    fragments. SQL structure is assembled safely in Python (see study_service.py).
    """
    system_prompt = """You are a keyword extractor for a microbiome study search engine.

        Your ONLY job is to extract the essential search keywords from the user's query.

        Rules:
        - Return ONLY a JSON array of strings, e.g. ["soil", "gut microbiome", "Rob Knight"]
        - Each element is a plain keyword or short phrase — no SQL, no operators, no wildcards
        - Extract 1–5 terms that best represent what the user is searching for
        - If the query is a person's name, return the full name as one element
        - If the query is unrelated to microbiome, still extract the literal keywords
        - Return [] if the query is empty or meaningless

        Examples:

        User: "Find studies about soil microbiome"
        Response: ["soil", "microbiome"]

        User: "Studies by Rob Knight"
        Response: ["Rob Knight"]

        User: "gut bacteria in infants"
        Response: ["gut", "bacteria", "infants"]

        Return ONLY valid JSON array, no other text."""

    message = client.chat.completions.create(
        model="gemma3",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query}
        ]
    )

    raw = message.choices[0].message.content
    response_text = (raw or "").strip()

    # Strip markdown code fences if present
    if response_text.startswith("```"):
        parts = response_text.split("```")
        response_text = parts[1] if len(parts) > 1 else response_text
        if response_text.startswith("json"):
            response_text = response_text[4:]
        response_text = response_text.strip()

    try:
        out = json.loads(response_text)
        if isinstance(out, list):
            # Keep only string elements, discard anything else
            return [str(t).strip() for t in out if t and str(t).strip()]
        raise ValueError("expected JSON array")
    except (json.JSONDecodeError, ValueError):
        print(f"Warning: Could not parse LLM keyword response: {response_text}")
        # Fall back to splitting the raw query on whitespace
        words = [w.strip() for w in user_query.split() if len(w.strip()) > 2]
        return words[:5] if words else [user_query.strip()]