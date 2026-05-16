# Active Tickets

> Known bugs and issues requiring attention.

---

## TKT-001: Debug Port Not Reverted Before Merge

**Severity:** Critical
**Status:** Open

### Description
Port changed from 5001 to 5002 for debug mode in two files. TODO comments indicate this should be reverted before merging to master. This will cause API failures if merged without reverting.

### Affected Files
- `ezredbiom/Experiment/backend/run.py:33`
- `ezredbiom/Experiment/frontend/index.html:6`

### Plan
- [ ] Change `run.py` port back to `5001` in `app.run()`
- [ ] Change `index.html` API base URL back to `http://localhost:5001`
- [ ] Remove TODO comments referencing the port revert
- [ ] Test frontend/backend connectivity after changes

### Files Changed
- `ezredbiom/Experiment/backend/run.py`
- `ezredbiom/Experiment/frontend/index.html`

---

## TKT-002: Silent Exception Handling Makes Debugging Difficult

**Severity:** Medium
**Status:** Open

### Description
15+ locations use `except Exception: pass` without any logging or user feedback. When failures occur, debugging is extremely difficult as errors are swallowed silently.

### Affected Files
- `sql_store_crud.py:56` - JSON decode failure returns None silently
- `sql_store_db.py:44` - TinyDB import errors ignored
- `sql_store_db.py:157,162,167,173` - Migration ALTER TABLE failures ignored
- `sql_store_cache.py:115` - Cache TTL parsing failure silently continues
- `routes/project_routes.py:50,77,168` - Qiita fetch and context failures ignored
- `helpers/qiita_fetch.py:252,258` - Samples fetch/cache failures ignored
- `helpers/llm_helpers.py:108` - Unknown location

### Plan
- [ ] Add `logger.exception()` or `logger.warning()` to all bare `except: pass` blocks
- [ ] For critical paths (Qiita fetches, study detail): return error response or set fallback values
- [ ] Consider adding a wrapper decorator for API calls that handles common error patterns
- [ ] Prioritize `project_routes.py` first as it handles user-facing operations

### Files Changed
- `ezredbiom/Experiment/backend/sql_store_crud.py`
- `ezredbiom/Experiment/backend/sql_store_db.py`
- `ezredbiom/Experiment/backend/sql_store_cache.py`
- `ezredbiom/Experiment/backend/routes/project_routes.py`
- `ezredbiom/Experiment/backend/helpers/qiita_fetch.py`
- `ezredbiom/Experiment/backend/helpers/llm_helpers.py`

### Files Added
- `ezredbiom/Experiment/backend/helpers/api_error_handler.py` (optional - for common patterns)

---

## TKT-003: Undefined Variables on Qiita Fetch Failure

**Severity:** Medium
**Status:** Open

### Description
In `project_routes.py:47-51`, if Qiita fetch fails during study add, the function continues without `preps`/`artifacts` being set. This can cause `NameError` when these variables are used downstream.

### Affected File
- `ezredbiom/Experiment/backend/routes/project_routes.py:47-51`

### Plan
- [ ] Add initialization of `preps = None`, `artifacts = None` before the try block
- [ ] Add null checks before using these variables
- [ ] Log the failure with `logger.warning()` so it's visible in logs
- [ ] Consider returning early with error response or using empty defaults

### Files Changed
- `ezredbiom/Experiment/backend/routes/project_routes.py`

---

## TKT-004: Race Condition in SSE Response

**Severity:** Low
**Status:** Open

### Description
In `global_chat_routes.py:159` and `chat_routes.py:172`, if `pin_study_to_chat` fails after the SSE "done" message is already yielded, the error only logs but the user sees incorrect pinned study state.

### Affected Files
- `routes/global_chat_routes.py:159`
- `routes/chat_routes.py:172`

### Plan
- [ ] Move the pin operation before yielding the SSE "done" message
- [ ] Or wrap in a transaction-like pattern: do work first, then respond
- [ ] Add `logger.error()` if pin fails after response is sent, for monitoring
- [ ] Consider implementing a retry mechanism or client-side reconciliation

### Files Changed
- `ezredbiom/Experiment/backend/routes/global_chat_routes.py`
- `ezredbiom/Experiment/backend/routes/chat_routes.py`

---

## TKT-005: LLM Chat Loses Conversation Context

**Severity:** Medium
**Status:** Open

### Description
The model does not retain context from previous questions in a chat session. For example, user filters for "wild mouse studies", then follows up with "shotgun studies" - but the model forgets the "mouse" filter and returns all shotgun studies instead of just shotgun studies from mice.

This appears to be a conversation history/context window issue, potentially related to Gemma architecture limitations.

### Affected Files
- Likely: `ezredbiom/Experiment/backend/helpers/llm_helpers.py` (message history handling)
- Likely: `ezredbiom/Experiment/backend/routes/chat_routes.py` or `global_chat_routes.py` (conversation context)

### Plan
- [ ] Investigate how message history is passed to the LLM (check if full chat history is included)
- [ ] Verify the conversation context is being appended correctly to each API call
- [ ] Check if there's a message limit causing older messages to be dropped
- [ ] Consider implementing a system prompt that explicitly instructs the model to consider prior conversation context
- [ ] Test with Gemma to determine if this is a model limitation or implementation bug
- [ ] If Gemma limitation: document as known issue, potentially switch to a model with better context retention

### Files Changed
- `ezredbiom/Experiment/backend/helpers/llm_helpers.py` (potentially)
- `ezredbiom/Experiment/backend/routes/chat_routes.py` (potentially)
- `ezredbiom/Experiment/backend/routes/global_chat_routes.py` (potentially)

---

*Generated: 2026-05-15*