"""
Agent tool registry and bounded-output utilities.

Mirrors pi-agent's tool-definition pattern:
  each tool has (name, label, description, parameters_schema, execute(args) -> ToolResult)

Tool outputs are truncated by dual independent budgets (line + byte), matching
pi's truncateHead / truncateTail logic (dist/core/tools/truncate.js).
"""

import json
import hashlib
from dataclasses import dataclass, field

# --------------------------------------------------------------------------- #
# Output truncation — port of pi's truncate.js
# --------------------------------------------------------------------------- #

DEFAULT_MAX_LINES = 400
DEFAULT_MAX_BYTES = 12 * 1024   # 12 KB; smaller than pi since we pay per-token


@dataclass
class TruncationResult:
    content: str
    truncated: bool
    truncated_by: object   # "lines" | "bytes" | None
    total_lines: int
    total_bytes: int
    output_lines: int
    output_bytes: int


def truncate_head(content: str, max_lines: int = DEFAULT_MAX_LINES,
                  max_bytes: int = DEFAULT_MAX_BYTES) -> TruncationResult:
    """Keep the first N lines/bytes — for file reads where the start matters."""
    encoded = content.encode("utf-8")
    total_bytes = len(encoded)
    lines = content.split("\n")
    total_lines = len(lines)

    if total_lines <= max_lines and total_bytes <= max_bytes:
        return TruncationResult(content, False, None, total_lines, total_bytes, total_lines, total_bytes)

    output_lines_arr = []
    output_bytes_count = 0
    truncated_by = "lines"

    for i, line in enumerate(lines):
        line_bytes = len(line.encode("utf-8")) + (1 if i > 0 else 0)
        if i >= max_lines or output_bytes_count + line_bytes > max_bytes:
            truncated_by = "bytes" if output_bytes_count + line_bytes > max_bytes else "lines"
            break
        output_lines_arr.append(line)
        output_bytes_count += line_bytes

    out = "\n".join(output_lines_arr)
    return TruncationResult(
        content=out,
        truncated=True,
        truncated_by=truncated_by,
        total_lines=total_lines,
        total_bytes=total_bytes,
        output_lines=len(output_lines_arr),
        output_bytes=len(out.encode("utf-8")),
    )


def truncate_tail(content: str, max_lines: int = DEFAULT_MAX_LINES,
                  max_bytes: int = DEFAULT_MAX_BYTES) -> TruncationResult:
    """Keep the last N lines/bytes — for command output where the end matters."""
    encoded = content.encode("utf-8")
    total_bytes = len(encoded)
    lines = content.split("\n")
    total_lines = len(lines)

    if total_lines <= max_lines and total_bytes <= max_bytes:
        return TruncationResult(content, False, None, total_lines, total_bytes, total_lines, total_bytes)

    output_lines_arr = []
    output_bytes_count = 0
    truncated_by = "lines"

    for i in range(len(lines) - 1, -1, -1):
        if len(output_lines_arr) >= max_lines:
            truncated_by = "lines"
            break
        line = lines[i]
        line_bytes = len(line.encode("utf-8")) + (1 if output_lines_arr else 0)
        if output_bytes_count + line_bytes > max_bytes:
            truncated_by = "bytes"
            break
        output_lines_arr.insert(0, line)
        output_bytes_count += line_bytes

    out = "\n".join(output_lines_arr)
    return TruncationResult(
        content=out,
        truncated=True,
        truncated_by=truncated_by,
        total_lines=total_lines,
        total_bytes=total_bytes,
        output_lines=len(output_lines_arr),
        output_bytes=len(out.encode("utf-8")),
    )


def format_truncation_notice(result: TruncationResult) -> str:
    """Append a human-readable truncation notice to content."""
    if not result.truncated:
        return result.content
    omitted_lines = result.total_lines - result.output_lines
    omitted_bytes = result.total_bytes - result.output_bytes
    suffix = (
        f"\n\n[... {omitted_lines} lines / {omitted_bytes} bytes truncated by {result.truncated_by} limit. "
        f"Total: {result.total_lines} lines / {result.total_bytes} bytes]"
    )
    return result.content + suffix


# --------------------------------------------------------------------------- #
# Resource tracking (analog of pi's extractFileOpsFromMessage)
# --------------------------------------------------------------------------- #

@dataclass
class ResourceTracker:
    read: set = field(default_factory=set)
    modified: set = field(default_factory=set)

    def add_read(self, key: str):
        self.read.add(key)

    def add_modified(self, key: str):
        self.modified.add(key)

    def to_dict(self) -> dict:
        return {
            "resources_read": sorted(self.read),
            "resources_modified": sorted(self.modified),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ResourceTracker":
        t = cls()
        t.read = set(d.get("resources_read") or [])
        t.modified = set(d.get("resources_modified") or [])
        return t

    def merge(self, other: "ResourceTracker"):
        self.read |= other.read
        self.modified |= other.modified


# --------------------------------------------------------------------------- #
# Tool result dataclass
# --------------------------------------------------------------------------- #

@dataclass
class ToolResult:
    content: str            # text sent back to the LLM (possibly truncated)
    details: dict           # stored in tool_details column (truncation flags, resources)
    ui_payload: object = None  # optional structured payload for the frontend
    is_error: bool = False


# --------------------------------------------------------------------------- #
# Tool definitions
# --------------------------------------------------------------------------- #

def _tool(name, label, description, parameters, execute_fn):
    return {
        "name": name,
        "label": label,
        "description": description,
        "parameters": parameters,
        "execute": execute_fn,
    }


def _schema(*props_pairs, required=None):
    """Build a minimal JSON Schema for tool parameters."""
    props = {}
    for prop_name, prop_def in props_pairs:
        props[prop_name] = prop_def
    return {
        "type": "object",
        "properties": props,
        "required": required or [],
    }


# ---- list_project_studies ------------------------------------------------- #

def _exec_list_project_studies(args: dict) -> ToolResult:
    from helpers.llm_helpers import _study_discovery_compact_block
    from store import get_project_studies_only

    project_id = args.get("project_id", "")
    proj = get_project_studies_only(project_id)
    if not proj:
        return ToolResult(
            content=f"Project '{project_id}' not found.",
            details={"resources_read": [], "resources_modified": []},
            is_error=True,
        )
    studies = proj.get("studies") or []
    if not studies:
        return ToolResult(
            content="No studies in this project.",
            details={"resources_read": [], "resources_modified": []},
        )
    lines = [_study_discovery_compact_block(s) for s in studies]
    raw = "\n\n".join(lines)
    res = truncate_head(raw)
    tracker = ResourceTracker()
    for s in studies:
        tracker.add_read(f"study:{s.get('study_id')}")
    return ToolResult(
        content=format_truncation_notice(res),
        details={**tracker.to_dict(), "truncated": res.truncated},
    )


_LIST_PROJECT_STUDIES = _tool(
    name="list_project_studies",
    label="List project studies",
    description=(
        "List all studies saved in the current project with compact metadata "
        "(ID, title, PI, sample counts, data types). Call this first to orient yourself."
    ),
    parameters=_schema(
        ("project_id", {"type": "string", "description": "The project ID"}),
        required=["project_id"],
    ),
    execute_fn=_exec_list_project_studies,
)


# ---- search_studies -------------------------------------------------------- #

def _exec_search_studies(args: dict) -> ToolResult:
    from services.llm import llm_query_to_sql
    from helpers.llm_helpers import _study_discovery_compact_block
    from sql_store_db import _conn

    keywords = args.get("keywords") or []
    match_mode = (args.get("match_mode") or "AND").upper()
    limit = max(1, min(50, int(args.get("limit") or 20)))

    if not keywords:
        return ToolResult(
            content="No keywords provided.",
            details={"resources_read": [], "resources_modified": []},
        )

    # Reuse existing SQL builder via a synthetic query string
    query_str = (" OR " if match_mode == "OR" else " ") .join(keywords)
    plan = llm_query_to_sql(query_str)
    where = plan["where_clause"]
    params = plan["params"]

    sql = f"""
        SELECT DISTINCT s.study_id, s.study_title, s.study_abstract,
               sp_pi.name AS pi_name, sp_pi.affiliation AS pi_affiliation,
               NULL AS num_samples, NULL AS num_preps, NULL AS data_types
        FROM qiita.study s
        JOIN qiita.study_person sp_pi ON s.principal_investigator_id = sp_pi.study_person_id
        WHERE s.info_type = 'other'
          AND (s.emp_person_id IS NOT NULL OR s.principal_investigator_id IS NOT NULL)
          AND ({where})
        LIMIT {limit}
    """
    try:
        from qiita_db.sql_connection import TRN
        with TRN:
            TRN.add(sql, params)
            rows = TRN.execute_fetchall()
        studies = [dict(zip(["study_id","study_title","study_abstract","pi_name","pi_affiliation","num_samples","num_preps","data_types"], r)) for r in rows]
    except Exception as e:
        return ToolResult(
            content=f"Search failed: {e}",
            details={"resources_read": [], "resources_modified": []},
            is_error=True,
        )

    if not studies:
        return ToolResult(
            content=f"No studies found for keywords: {', '.join(keywords)}",
            details={"resources_read": [], "resources_modified": []},
        )

    lines = [_study_discovery_compact_block(s) for s in studies]
    raw = "\n\n".join(lines)
    res = truncate_head(raw)
    tracker = ResourceTracker()
    for s in studies:
        tracker.add_read(f"study:{s.get('study_id')}")
    return ToolResult(
        content=format_truncation_notice(res),
        details={**tracker.to_dict(), "truncated": res.truncated, "count": len(studies)},
    )


_SEARCH_STUDIES = _tool(
    name="search_studies",
    label="Search Qiita studies",
    description=(
        "Search the Qiita database for studies matching given keywords. "
        "Returns compact study cards (ID, title, PI, counts). "
        "Use AND for specific queries, OR for broad discovery."
    ),
    parameters=_schema(
        ("keywords", {"type": "array", "items": {"type": "string"},
                      "description": "1–6 search terms (title, abstract, PI name)"}),
        ("match_mode", {"type": "string", "enum": ["AND", "OR"],
                        "description": "AND = all terms must match; OR = any term"}),
        ("limit", {"type": "integer", "description": "Max results (1–50)", "default": 20}),
        required=["keywords"],
    ),
    execute_fn=_exec_search_studies,
)


# ---- get_study_detail ------------------------------------------------------ #

def _exec_get_study_detail(args: dict) -> ToolResult:
    from helpers.llm_helpers import _study_detail_block
    from helpers.qiita_fetch import _fetch_sample_context_text
    from store import get_study_detail_cache, upsert_study_detail_cache

    try:
        study_id = int(args.get("study_id"))
    except (TypeError, ValueError):
        return ToolResult(
            content="study_id must be an integer.",
            details={"resources_read": [], "resources_modified": []},
            is_error=True,
        )

    include_samples = bool(args.get("include_samples", False))

    # Build minimal study dict from cache + Qiita
    cached = get_study_detail_cache(study_id)
    samples_context = None
    if cached:
        samples_context = cached.get("samples_context")

    if include_samples and not samples_context:
        samples_context = _fetch_sample_context_text(study_id)
        if samples_context:
            upsert_study_detail_cache(study_id, None, None, samples_context=samples_context)

    # Query Qiita for core study metadata
    try:
        from qiita_db.sql_connection import TRN
        sql = """
            SELECT s.study_id, s.study_title, s.study_abstract,
                   sp_pi.name AS pi_name, sp_pi.email AS pi_email,
                   sp_pi.affiliation AS pi_affiliation,
                   sp_lab.name AS lab_person_name
            FROM qiita.study s
            LEFT JOIN qiita.study_person sp_pi
                   ON s.principal_investigator_id = sp_pi.study_person_id
            LEFT JOIN qiita.study_person sp_lab
                   ON s.lab_person_id = sp_lab.study_person_id
            WHERE s.study_id = %s
        """
        with TRN:
            TRN.add(sql, [study_id])
            rows = TRN.execute_fetchall()
        if not rows:
            return ToolResult(
                content=f"Study {study_id} not found in Qiita.",
                details={"resources_read": [], "resources_modified": []},
                is_error=True,
            )
        r = rows[0]
        study = dict(zip(["study_id","study_title","study_abstract","pi_name","pi_email","pi_affiliation","lab_person_name"], r))
    except Exception as e:
        return ToolResult(
            content=f"Failed to fetch study {study_id}: {e}",
            details={"resources_read": [], "resources_modified": []},
            is_error=True,
        )

    study["samples_context"] = samples_context
    block = _study_detail_block(study, include_samples_context=include_samples)
    res = truncate_head(block)

    tracker = ResourceTracker()
    tracker.add_read(f"study:{study_id}")
    if include_samples:
        tracker.add_read(f"samples:{study_id}")

    return ToolResult(
        content=format_truncation_notice(res),
        details={**tracker.to_dict(), "truncated": res.truncated},
    )


_GET_STUDY_DETAIL = _tool(
    name="get_study_detail",
    label="Get study detail",
    description=(
        "Fetch detailed metadata for a specific Qiita study by ID: "
        "title, abstract, PI info, prep templates, data types, sample counts. "
        "Set include_samples=true to also get sample metadata (slower)."
    ),
    parameters=_schema(
        ("study_id", {"type": "integer", "description": "Qiita study ID"}),
        ("include_samples", {"type": "boolean", "description": "Include sample metadata context", "default": False}),
        required=["study_id"],
    ),
    execute_fn=_exec_get_study_detail,
)


# ---- get_samples_report ---------------------------------------------------- #

def _exec_get_samples_report(args: dict) -> ToolResult:
    from helpers.qiita_fetch import _build_samples_report_payload

    try:
        study_id = int(args.get("study_id"))
    except (TypeError, ValueError):
        return ToolResult(
            content="study_id must be an integer.",
            details={"resources_read": [], "resources_modified": []},
            is_error=True,
        )

    try:
        payload = _build_samples_report_payload(study_id)
    except ValueError as e:
        return ToolResult(
            content=str(e),
            details={"resources_read": [], "resources_modified": []},
            is_error=True,
        )
    except Exception as e:
        return ToolResult(
            content=f"Failed to load samples for study {study_id}: {e}",
            details={"resources_read": [], "resources_modified": []},
            is_error=True,
        )

    header = payload.get("header") or {}
    num_samples = header.get("num_samples") or len(payload.get("samples") or [])
    columns = header.get("columns") or []
    summary = (
        f"Study {study_id} — {num_samples} samples loaded.\n"
        f"Columns: {', '.join(str(c) for c in columns[:30])}"
    )
    if len(columns) > 30:
        summary += f" (+ {len(columns)-30} more)"

    tracker = ResourceTracker()
    tracker.add_read(f"study:{study_id}")
    tracker.add_read(f"samples:{study_id}")

    return ToolResult(
        content=summary,
        details={**tracker.to_dict(), "num_samples": num_samples},
        ui_payload=payload,
    )


_GET_SAMPLES_REPORT = _tool(
    name="get_samples_report",
    label="Load samples report",
    description=(
        "Load the full sample metadata table for a Qiita study. "
        "Returns a summary and triggers a UI sample browser. "
        "Use when the user wants to explore or filter per-sample data."
    ),
    parameters=_schema(
        ("study_id", {"type": "integer", "description": "Qiita study ID"}),
        required=["study_id"],
    ),
    execute_fn=_exec_get_samples_report,
)


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #

_ALL_TOOLS = {
    t["name"]: t for t in [
        _LIST_PROJECT_STUDIES,
        _SEARCH_STUDIES,
        _GET_STUDY_DETAIL,
        _GET_SAMPLES_REPORT,
    ]
}


def get_tool_schemas() -> list[dict]:
    """Return OpenAI-compatible tool schemas for all registered tools."""
    schemas = []
    for t in _ALL_TOOLS.values():
        schemas.append({
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        })
    return schemas


def execute_tool(name: str, args: dict) -> ToolResult:
    """Dispatch a tool call by name. Returns ToolResult (never raises)."""
    tool = _ALL_TOOLS.get(name)
    if not tool:
        return ToolResult(
            content=f"Unknown tool: {name}",
            details={"resources_read": [], "resources_modified": []},
            is_error=True,
        )
    try:
        return tool["execute"](args)
    except Exception as e:
        return ToolResult(
            content=f"Tool '{name}' raised an error: {e}",
            details={"resources_read": [], "resources_modified": []},
            is_error=True,
        )


def get_tool_label(name: str) -> str:
    t = _ALL_TOOLS.get(name)
    return t["label"] if t else name


def accumulate_resources(tool_details_list: list[dict]) -> dict:
    """
    Union resource tracking across multiple tool_details dicts.
    Used when generating branch summaries (cumulative tracking).
    """
    tracker = ResourceTracker()
    for d in tool_details_list:
        if d:
            tracker.merge(ResourceTracker.from_dict(d))
    return tracker.to_dict()
