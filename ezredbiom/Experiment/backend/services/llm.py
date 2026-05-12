# backend/services/llm.py
import re

_STOP_WORDS = frozenset({
    'find', 'search', 'show', 'get', 'give', 'list', 'what', 'which',
    'studies', 'study', 'about', 'with', 'the', 'a', 'an', 'in', 'on',
    'for', 'and', 'or', 'of', 'to', 'by', 'from', 'that', 'are', 'is',
    'have', 'has', 'data', 'using', 'related', 'some', 'all', 'any',
    'this', 'these', 'those', 'can', 'you', 'me', 'us',
})


def llm_query_to_sql(user_query: str) -> dict:
    """Convert natural language query to SQL WHERE clause via keyword extraction."""
    # Detect "by <Name>" or "from <Institution>" pattern → PI filter
    pi_match = re.search(
        r'\bby\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)', user_query
    )

    words    = re.findall(r'\b[a-zA-Z0-9]+\b', user_query.lower())
    keywords = [w for w in words if w not in _STOP_WORDS and len(w) >= 3]

    clauses: list = []
    params:  list = []

    if pi_match:
        name = pi_match.group(1)
        clauses.append("(sp_pi.name ILIKE %s OR sp_pi.affiliation ILIKE %s)")
        params += [f"%{name}%", f"%{name}%"]

    for kw in keywords[:3]:
        clauses.append(
            "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s"
            " OR sp_pi.name ILIKE %s OR sp_pi.affiliation ILIKE %s)"
        )
        params += [f"%{kw}%", f"%{kw}%", f"%{kw}%", f"%{kw}%"]

    return {
        "where_clause": " AND ".join(clauses) if clauses else "1=1",
        "params": params,
    }