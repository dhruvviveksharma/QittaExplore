"""Generate LLM-powered summaries for abandoned chat branches."""

import json
import logging

from config import client, DEFAULT_MODEL
from sql_store import get_branch_entries
from services.agent_tools import accumulate_resources

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT = (
    "Summarize this conversation branch for context handoff. Use this format:\n\n"
    "## Goal\n[What was attempted]\n\n"
    "## Progress\n### Done\n- [x] [Completed]\n### In Progress\n- [ ] [Ongoing]\n\n"
    "## Key Decisions\n- **[Decision]**: [Rationale]\n\n"
    "## Next Steps\n1. [What should happen next]\n\n"
    "## Critical Context\n- [Data needed to continue]\n\n"
    "Be concise. Preserve exact IDs and field names."
)


def generate_branch_summary(chat_id: str, from_entry_id: str) -> tuple[str, dict]:
    """
    Generate an LLM summary for the abandoned branch starting at from_entry_id.
    Returns (summary_text, resources_dict).
    """
    abandoned = get_branch_entries(chat_id, from_entry_id=from_entry_id)

    lines = []
    for e in abandoned:
        role = e.get("role") or "user"
        etype = e.get("entry_type") or "message"
        if etype == "tool_call":
            lines.append(f"[Tool call: {e.get('tool_name')}] {e.get('tool_args') or '{}'}")
        elif etype == "tool_result":
            lines.append(f"[Tool result: {e.get('tool_name')}] {(e.get('content') or '')[:400]}")
        elif e.get("content"):
            lines.append(f"[{role}]: {(e.get('content') or '')[:600]}")

    conversation_text = "\n\n".join(lines)

    tool_details_list = [
        json.loads(e["tool_details"]) if e.get("tool_details") else {}
        for e in abandoned
    ]
    resources = accumulate_resources(tool_details_list)

    try:
        resp = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": "You are a context summarization assistant. Output only the structured summary."},
                {"role": "user", "content": f"<conversation>\n{conversation_text}\n</conversation>\n\n{_SUMMARY_PROMPT}"},
            ],
        )
        summary = (resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.exception("branch summary LLM call failed for chat %s", chat_id)
        summary = f"Branch summary (auto-generation failed: {e})"

    reads = resources.get("resources_read") or []
    mods = resources.get("resources_modified") or []
    if reads:
        summary += "\n\n<resources-read>\n" + "\n".join(reads) + "\n</resources-read>"
    if mods:
        summary += "\n\n<resources-modified>\n" + "\n".join(mods) + "\n</resources-modified>"

    return summary, resources
