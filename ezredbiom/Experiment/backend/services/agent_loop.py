"""
Tool-calling agent loop for project chats.

Mirrors pi-agent's agent-session-runtime pattern:
  1. Build context from tree-structured session
  2. Call LLM with tool schemas
  3. Execute any tool calls the model requests
  4. Append entries (assistant + tool_call + tool_result) to tree
  5. Repeat until model stops or max iterations reached
  6. Yield SSE events at each stage so the user sees live status
"""

import json
import logging

from config import client, CHAT_SYSTEM_PROMPT
from helpers.llm_helpers import _sse, _resolve_model
from services.agent_tools import execute_tool, get_tool_schemas, get_tool_label
from sql_store_crud import append_entry, build_chat_context

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 8   # bound the agentic loop like pi's runtime guard


def _build_system_prompt(project_context) -> str:
    if project_context:
        return CHAT_SYSTEM_PROMPT + f"\n\nPROJECT STUDIES OVERVIEW:\n{project_context}"
    return CHAT_SYSTEM_PROMPT + (
        "\n\nNo project study context was pre-loaded. "
        "Use the list_project_studies or search_studies tools to fetch study information."
    )


def run_agent_turn(
    chat_id: str,
    project_id: str,
    user_content: str,
    model=None,
    project_context=None,
):
    """
    Generator that runs one full user-turn through the agent loop.
    Yields SSE-formatted strings suitable for a Flask Response.

    Persists entries to the tree session as it goes.
    """
    resolved_model = _resolve_model(model)
    tool_schemas = get_tool_schemas()
    system_prompt = _build_system_prompt(project_context)

    # Append the user message to the tree
    append_entry(chat_id, "user", user_content, entry_type="message")
    yield ': keepalive\n\n'

    for iteration in range(MAX_ITERATIONS):
        # Rebuild context from the current branch each iteration
        messages = build_chat_context(chat_id)
        api_messages = [{"role": "system", "content": system_prompt}] + messages

        yield _sse("step_start", {"name": "llm_generate", "label": "Thinking…"})

        # Stream the LLM response
        try:
            stream = client.chat.completions.create(
                model=resolved_model,
                messages=api_messages,
                tools=tool_schemas,
                tool_choice="auto",
                stream=True,
            )
        except Exception as e:
            yield _sse("error", {"error": str(e)})
            return

        # Collect streamed response
        text_parts = []
        tool_call_accum: dict[str, dict] = {}   # index -> accumulated tool call
        finish_reason = None

        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            finish_reason = chunk.choices[0].finish_reason or finish_reason

            # Stream text tokens
            if delta.content:
                text_parts.append(delta.content)
                yield _sse("token", {"token": delta.content})

            # Accumulate tool call chunks (streamed incrementally by OpenAI)
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_call_accum:
                        tool_call_accum[idx] = {
                            "id": tc.id or "",
                            "name": (tc.function and tc.function.name) or "",
                            "arguments": "",
                        }
                    else:
                        if tc.id:
                            tool_call_accum[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_call_accum[idx]["name"] += tc.function.name
                            if tc.function.arguments:
                                tool_call_accum[idx]["arguments"] += tc.function.arguments

        assistant_text = "".join(text_parts).strip()

        # Determine if the model made tool calls
        tool_calls = [tool_call_accum[k] for k in sorted(tool_call_accum.keys())]

        yield _sse("step_done", {
            "name": "llm_generate",
            "label": "Response ready" if not tool_calls else "Choosing tools…",
        })

        if tool_calls:
            # Persist assistant message entry (with embedded tool_calls for context rebuild)
            # We store each tool_call as a separate entry_type=tool_call row
            assistant_entry_id = append_entry(
                chat_id, "assistant", assistant_text, entry_type="message"
            )
            for tc in tool_calls:
                try:
                    parsed_args = json.loads(tc["arguments"] or "{}")
                except Exception:
                    parsed_args = {}
                append_entry(
                    chat_id, "assistant", "",
                    entry_type="tool_call",
                    tool_call_id=tc["id"],
                    tool_name=tc["name"],
                    tool_args=parsed_args,
                )

            # Execute each tool call
            for tc in tool_calls:
                name = tc["name"]
                label = get_tool_label(name)
                try:
                    parsed_args = json.loads(tc["arguments"] or "{}")
                except Exception:
                    parsed_args = {}

                # Inject project_id automatically for tools that need it
                if "project_id" in (get_tool_schemas()[0]["function"]["parameters"].get("properties") or {}):
                    parsed_args.setdefault("project_id", project_id)
                # Always inject project_id for list_project_studies
                if name == "list_project_studies":
                    parsed_args["project_id"] = project_id

                yield _sse("tool_call_start", {
                    "name": name,
                    "label": f"{label}…",
                    "args": {k: v for k, v in parsed_args.items() if k != "project_id"},
                })

                result = execute_tool(name, parsed_args)

                detail_text = ""
                if result.details:
                    resources = result.details.get("resources_read") or []
                    if resources:
                        detail_text = f"{len(resources)} resource(s) loaded"

                yield _sse("tool_call_done", {
                    "name": name,
                    "label": label,
                    "detail": detail_text,
                    "is_error": result.is_error,
                })

                # Persist tool result to tree
                append_entry(
                    chat_id, "tool", result.content,
                    entry_type="tool_result",
                    tool_call_id=tc["id"],
                    tool_name=name,
                    tool_details=result.details,
                    ui_payload=result.ui_payload,
                    is_error=result.is_error,
                )

                # Emit UI payload if present (e.g. samples browser)
                if result.ui_payload:
                    yield _sse("ui", result.ui_payload)

            # Continue loop — model will see tool results in next iteration
            continue

        else:
            # No tool calls — final assistant response; persist and stop
            append_entry(chat_id, "assistant", assistant_text, entry_type="message")
            yield _sse("done", {
                "chat_id": chat_id,
                "persisted": True,
                "iterations": iteration + 1,
            })
            return

    # Exceeded max iterations — persist whatever text we have and stop
    logger.warning("Agent loop reached max iterations (%d) for chat %s", MAX_ITERATIONS, chat_id)
    final_text = "I reached the maximum number of steps. Please refine your question or try again."
    append_entry(chat_id, "assistant", final_text, entry_type="message")
    yield _sse("done", {"chat_id": chat_id, "persisted": True, "max_iterations_reached": True})
