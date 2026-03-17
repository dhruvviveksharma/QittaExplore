const { useState, useEffect, useRef, useMemo, useCallback } = React;

const API     = document.querySelector('meta[name="api-base"]')?.content
              || 'http://localhost:5001/api';
const USER_ID = 'default';

// ─── helpers ──────────────────────────────────────────────────────────────────
const apiFetch = (path, opts = {}) =>
  fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
const apiPost  = (path, body)  => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) });
const apiDel   = (path)        => apiFetch(path, { method: 'DELETE' });

async function parseSSE(response, { onToken, onDone, onError }, signal) {
  const reader = response.body.getReader();
  const dec    = new TextDecoder();
  let buf      = '';
  while (true) {
    if (signal?.aborted) break;
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2);
      let type = 'message', data = '{}';
      for (const ln of raw.split('\n')) {
        if (ln.startsWith('event:')) type = ln.slice(6).trim();
        if (ln.startsWith('data:'))  data = ln.slice(5).trim();
      }
      let payload = {};
      try { payload = JSON.parse(data); } catch (_) {}
      if (type === 'token' && onToken) onToken(payload);
      if (type === 'done'  && onDone)  onDone(payload);
      if (type === 'error' && onError) onError(payload);
    }
  }
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function App() {
  // Projects list (sidebar)
  const [projects,    setProjects]    = useState([]);
  const [projLoading, setProjLoading] = useState(true);

  // Which project folder is open in sidebar
  const [openProjId,  setOpenProjId]  = useState(null);
  const [openProject, setOpenProject] = useState(null); // full detail incl studies+chats

  // Active view object
  // { type: 'project-chat', projId, chatId }
  // { type: 'global-chat',  chatId }
  // { type: 'browse' }
  const [view, setView] = useState({ type: 'browse' });

  // Chat message cache keyed by chatId — never reset on re-render
  const [chatCache, setChatCache] = useState({});

  // Global chats
  const [globalChats, setGlobalChats] = useState([]);

  // Per-project folder inner tab
  const [projInnerTab, setProjInnerTab] = useState('chats');

  // Browse / search
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [firstStudies, setFirstStudies] = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [searched,     setSearched]     = useState(false);
  const [sqlQuery,     setSqlQuery]     = useState(null);
  const [showSql,      setShowSql]      = useState(false);

  // Global chat context studies
  const [ctxStudies, setCtxStudies] = useState([]);

  // New project form
  const [showNewProj, setShowNewProj] = useState(false);
  const [newProjName, setNewProjName] = useState('');

  // Composer
  const [input,   setInput]   = useState('');
  const [sending, setSending] = useState(false);
  const [compErr, setCompErr] = useState('');

  // Study detail modal
  const [modalStudy,       setModalStudy]       = useState(null);
  const [modalDetail,      setModalDetail]      = useState(null);  // {preps, artifacts} or null
  const [modalDetailLoading, setModalDetailLoading] = useState(false);

  const abortRef      = useRef(null);
  const taRef         = useRef(null);
  const bottomRef     = useRef(null);
  const modalAbortRef = useRef(null);

  // ── auto-size textarea ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = '0';
    taRef.current.style.height = Math.min(200, taRef.current.scrollHeight) + 'px';
  }, [input]);

  // ── scroll to bottom on new tokens ──────────────────────────────────────────
  const activeMsgs = view.chatId ? (chatCache[view.chatId]?.messages || []) : [];
  const lastContent = activeMsgs[activeMsgs.length - 1]?.content;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMsgs.length, lastContent]);

  // ── cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => () => abortRef.current?.abort(), []);

  // ── initial load ─────────────────────────────────────────────────────────────
  useEffect(() => { loadProjects(); loadGlobalChats(); loadFirstStudies(); }, []);

  // ── when openProjId changes, fetch its detail ─────────────────────────────
  useEffect(() => {
    if (!openProjId) { setOpenProject(null); return; }
    fetchProjectDetail(openProjId);
  }, [openProjId]);

  // ─── loaders ──────────────────────────────────────────────────────────────────
  const loadProjects = async () => {
    setProjLoading(true);
    try {
      const res = await apiFetch(`/projects?user_id=${USER_ID}`);
      if (res.ok) { const d = await res.json(); setProjects(d.projects || []); }
    } finally { setProjLoading(false); }
  };

  const fetchProjectDetail = async (pid) => {
    const res = await apiFetch(`/projects/${pid}?user_id=${USER_ID}`);
    if (res.ok) setOpenProject(await res.json());
  };

  const loadGlobalChats = async () => {
    const res = await apiFetch(`/global-chats?user_id=${USER_ID}`);
    if (res.ok) { const d = await res.json(); setGlobalChats(d.chats || []); }
  };

  const loadFirstStudies = async () => {
    const res = await apiFetch('/studies/first?limit=20');
    if (res.ok) { const d = await res.json(); setFirstStudies(d.results || []); }
  };

  // Load a single chat into cache (only if not already present)
  const hydrateChatCache = async (type, projId, chatId) => {
    if (chatCache[chatId]) return;
    const res = type === 'project-chat'
      ? await apiFetch(`/projects/${projId}/chats/${chatId}?user_id=${USER_ID}`)
      : await apiFetch(`/global-chats/${chatId}?user_id=${USER_ID}`);
    if (res.ok) {
      const d = await res.json();
      setChatCache(prev => ({ ...prev, [chatId]: { messages: d.messages || [], title: d.title } }));
    }
  };

  // ─── project actions ───────────────────────────────────────────────────────────
  const createProject = async () => {
    const name = newProjName.trim() || 'Untitled';
    const res  = await apiPost('/projects', { user_id: USER_ID, name });
    if (!res.ok) return;
    const proj = await res.json();
    setNewProjName(''); setShowNewProj(false);
    await loadProjects();
    setOpenProjId(proj.project_id);
    setProjInnerTab('chats');
  };

  const deleteProject = async (pid) => {
    if (!confirm('Delete this project and all its chats?')) return;
    await apiDel(`/projects/${pid}?user_id=${USER_ID}`);
    if (openProjId === pid) { setOpenProjId(null); setOpenProject(null); }
    if (view.projId === pid) setView({ type: 'browse' });
    loadProjects();
  };

  const addStudyToProject = async (study) => {
    if (!openProjId) return;
    const res = await apiPost(`/projects/${openProjId}/studies`, { user_id: USER_ID, study });
    if (res.ok) { const updated = await res.json(); setOpenProject(updated); }
  };

  const removeStudy = async (studyId) => {
    if (!openProjId) return;
    const res = await apiDel(`/projects/${openProjId}/studies/${studyId}?user_id=${USER_ID}`);
    if (res.ok) { const updated = await res.json(); setOpenProject(updated); }
  };

  // ─── chat navigation (no full re-render / no reload) ──────────────────────────
  const openProjChat = async (projId, chatId) => {
    await hydrateChatCache('project-chat', projId, chatId);
    setView({ type: 'project-chat', projId, chatId });
    setCompErr('');
  };

  const openGlobChat = async (chatId) => {
    await hydrateChatCache('global-chat', null, chatId);
    setView({ type: 'global-chat', chatId });
    setCompErr('');
  };

  const newProjChat = async (projId) => {
    const res = await apiPost(`/projects/${projId}/chats`, { user_id: USER_ID });
    if (!res.ok) return;
    const chat = await res.json();
    setChatCache(prev => ({ ...prev, [chat.chat_id]: { messages: [], title: 'New chat' } }));
    setOpenProject(prev => prev ? { ...prev, chats: [{ ...chat, messages: [] }, ...(prev.chats || [])] } : prev);
    setView({ type: 'project-chat', projId, chatId: chat.chat_id });
    setCompErr('');
  };

  const deleteProjChat = async (projId, chatId) => {
    await apiDel(`/projects/${projId}/chats/${chatId}?user_id=${USER_ID}`);
    setChatCache(prev => { const n = { ...prev }; delete n[chatId]; return n; });
    if (view.chatId === chatId) setView({ type: 'project-chat', projId, chatId: null });
    setOpenProject(prev => prev ? { ...prev, chats: (prev.chats || []).filter(c => c.chat_id !== chatId) } : prev);
  };

  const newGlobChat = async () => {
    const res = await apiPost('/global-chats', { user_id: USER_ID });
    if (!res.ok) return;
    const chat = await res.json();
    setChatCache(prev => ({ ...prev, [chat.chat_id]: { messages: [], title: 'New chat' } }));
    setGlobalChats(prev => [chat, ...prev]);
    setView({ type: 'global-chat', chatId: chat.chat_id });
    setCompErr('');
  };

  const deleteGlobChat = async (chatId) => {
    await apiDel(`/global-chats/${chatId}?user_id=${USER_ID}`);
    setChatCache(prev => { const n = { ...prev }; delete n[chatId]; return n; });
    if (view.chatId === chatId) setView({ type: 'global-chat', chatId: null });
    setGlobalChats(prev => prev.filter(c => c.chat_id !== chatId));
  };

  // ─── streaming (mutates cache in-place, never touches view) ───────────────────
  const patchLast = (chatId, fn) =>
    setChatCache(prev => {
      const c = prev[chatId];
      if (!c) return prev;
      const msgs = [...c.messages];
      msgs[msgs.length - 1] = fn(msgs[msgs.length - 1]);
      return { ...prev, [chatId]: { ...c, messages: msgs } };
    });

  const optimisticAppend = (chatId, userMsg) =>
    setChatCache(prev => {
      const c = prev[chatId] || { messages: [], title: userMsg.slice(0, 60) };
      return {
        ...prev,
        [chatId]: {
          ...c,
          messages: [
            ...c.messages,
            { role: 'user',      content: userMsg },
            { role: 'assistant', content: '', isStreaming: true },
          ],
        },
      };
    });

  // ─── send ──────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setSending(true); setCompErr(''); setInput('');

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      if (view.type === 'project-chat') {
        let { projId, chatId } = view;
        // create chat lazily if needed
        if (!chatId) {
          const res = await apiPost(`/projects/${projId}/chats`, { user_id: USER_ID });
          if (!res.ok) throw new Error('Failed to create chat');
          const chat = await res.json();
          chatId = chat.chat_id;
          setChatCache(prev => ({ ...prev, [chatId]: { messages: [], title: msg.slice(0, 60) } }));
          setView(v => ({ ...v, chatId }));
        }
        optimisticAppend(chatId, msg);
        const res = await fetch(`${API}/projects/${projId}/chats/${chatId}/message/stream`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: USER_ID, message: msg }), signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error('Stream failed');
        await parseSSE(res, {
          onToken: ({ token }) => patchLast(chatId, m => ({ ...m, content: (m.content||'') + (token||'') })),
          onDone: () => {
            patchLast(chatId, m => ({ ...m, isStreaming: false }));
            const title = msg.slice(0, 60);
            setChatCache(prev => ({ ...prev, [chatId]: { ...(prev[chatId]||{}), title } }));
            setOpenProject(prev => prev ? {
              ...prev,
              chats: (prev.chats||[]).map(c => c.chat_id === chatId ? { ...c, title } : c)
            } : prev);
          },
          onError: ({ error }) => setCompErr(error || 'Error'),
        }, ctrl.signal);

      } else if (view.type === 'global-chat') {
        let { chatId } = view;
        if (!chatId) {
          const res = await apiPost('/global-chats', { user_id: USER_ID });
          if (!res.ok) throw new Error('Failed to create chat');
          const chat = await res.json();
          chatId = chat.chat_id;
          setChatCache(prev => ({ ...prev, [chatId]: { messages: [], title: msg.slice(0, 60) } }));
          setGlobalChats(prev => [chat, ...prev]);
          setView(v => ({ ...v, chatId }));
        }
        optimisticAppend(chatId, msg);
        const res = await fetch(`${API}/global-chats/${chatId}/message/stream`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: USER_ID, message: msg, selected_studies: ctxStudies }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error('Stream failed');
        await parseSSE(res, {
          onToken: ({ token }) => patchLast(chatId, m => ({ ...m, content: (m.content||'') + (token||'') })),
          onDone: () => {
            patchLast(chatId, m => ({ ...m, isStreaming: false }));
            const title = msg.slice(0, 60);
            setChatCache(prev => ({ ...prev, [chatId]: { ...(prev[chatId]||{}), title } }));
            setGlobalChats(prev => prev.map(c => c.chat_id === chatId ? { ...c, title } : c));
          },
          onError: ({ error }) => setCompErr(error || 'Error'),
        }, ctrl.signal);
      }
    } catch (e) {
      if (e.name !== 'AbortError') setCompErr(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  // ─── open study modal with lazy detail fetch (abortable) ───────────────────
  const openStudyModal = async (study) => {
    modalAbortRef.current?.abort();
    const ctrl = new AbortController();
    modalAbortRef.current = ctrl;
    setModalStudy(study); setModalDetail(null); setModalDetailLoading(true);
    try {
      const res = await apiFetch(`/studies/${study.study_id}/detail`, { signal: ctrl.signal });
      if (res.ok && !ctrl.signal.aborted) { const d = await res.json(); setModalDetail(d); }
    } catch (_) {}
    if (!ctrl.signal.aborted) setModalDetailLoading(false);
  };

  const closeModal = () => {
    modalAbortRef.current?.abort();
    setModalStudy(null); setModalDetail(null);
  };

  // ─── enrich all project studies from Qiita ──────────────────────────────────
  const enrichAllStudies = async (projId) => {
    const res = await apiPost(`/projects/${projId}/studies/enrich-all`, { user_id: USER_ID });
    if (res.ok) { const d = await res.json(); if (d.project) setOpenProject(d.project); }
  };

  // ─── search ───────────────────────────────────────────────────────────────────
  const doSearch = async (override) => {
    const q = (override ?? query).trim();
    if (!q) return;
    if (override) setQuery(override);
    setSearching(true); setSearched(false);
    const res = await apiPost('/search', { query: q });
    if (res.ok) { const d = await res.json(); setResults(d.results || []); setSqlQuery(d.sql_query || null); }
    else setResults([]);
    setSearched(true); setSearching(false);
  };

  // ─── derived ──────────────────────────────────────────────────────────────────
  const projStudyIds = useMemo(() => (openProject?.studies || []).map(s => s.study_id), [openProject]);
  const ctxStudyIds  = useMemo(() => ctxStudies.map(s => s.study_id), [ctxStudies]);
  const displayStudies = searched ? results : firstStudies;
  const isChat  = view.type === 'project-chat' || view.type === 'global-chat';
  const canSend = isChat && input.trim().length > 0 && !sending;

  const topTitle = useMemo(() => {
    if (view.type === 'project-chat') {
      const proj = projects.find(p => p.project_id === view.projId);
      return chatCache[view.chatId]?.title || proj?.name || 'Project Chat';
    }
    if (view.type === 'global-chat') return chatCache[view.chatId]?.title || 'Global Chat';
    return 'Browse Studies';
  }, [view, chatCache, projects]);

  // ─── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="app-logo">Qiita<span>Explorer</span></div>
        </div>

        <div className="sidebar-body">

          {/* Projects */}
          <div className="sb-label">Projects</div>
          {projLoading && <div className="sb-loading">Loading…</div>}

          {projects.map(p => (
            <div key={p.project_id}>
              {/* Folder row */}
              <div
                className={`folder-row ${openProjId === p.project_id ? 'open' : ''} ${view.projId === p.project_id ? 'viewing' : ''}`}
                onClick={() => {
                  if (openProjId === p.project_id) setOpenProjId(null);
                  else { setOpenProjId(p.project_id); setProjInnerTab('chats'); }
                }}
              >
                <span className="folder-caret">{openProjId === p.project_id ? '▾' : '▸'}</span>
                <span className="folder-icon-svg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                  </svg>
                </span>
                <span className="folder-name">{p.name}</span>
                <button className="folder-del" title="Delete" onClick={e => { e.stopPropagation(); deleteProject(p.project_id); }}>×</button>
              </div>

              {/* Expanded folder */}
              {openProjId === p.project_id && (
                <div className="folder-expanded">
                  {/* New chat input */}
                  <button className="folder-new-chat-btn" onClick={() => newProjChat(p.project_id)}>
                    <span className="fnc-plus">+</span>
                    <span className="fnc-text">New chat in {p.name}</span>
                  </button>

                  {/* Chats / Sources tabs */}
                  <div className="inner-tabs">
                    <button className={`inner-tab ${projInnerTab === 'chats' ? 'active' : ''}`} onClick={() => setProjInnerTab('chats')}>Chats</button>
                    <button className={`inner-tab ${projInnerTab === 'sources' ? 'active' : ''}`} onClick={() => setProjInnerTab('sources')}>Sources</button>
                  </div>

                  {/* Chats */}
                  {projInnerTab === 'chats' && (openProject?.chats || []).length === 0 && (
                    <div className="folder-empty">No chats yet.</div>
                  )}
                  {projInnerTab === 'chats' && (openProject?.chats || []).map(c => (
                    <div
                      key={c.chat_id}
                      className={`chat-row ${view.chatId === c.chat_id ? 'active' : ''}`}
                      onClick={() => openProjChat(p.project_id, c.chat_id)}
                    >
                      <div className="cr-content">
                        <div className="cr-title">{chatCache[c.chat_id]?.title || c.title || 'New chat'}</div>
                        {c.updated_at && (
                          <div className="cr-date">
                            {new Date(c.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </div>
                      <button className="cr-del" onClick={e => { e.stopPropagation(); deleteProjChat(p.project_id, c.chat_id); }}>×</button>
                    </div>
                  ))}

                  {/* Sources header with refresh button */}
                  {projInnerTab === 'sources' && (openProject?.studies || []).length > 0 && (
                    <div className="sources-tab-header">
                      <button className="folder-refresh-btn" title="Refresh sample/prep data from Qiita"
                        onClick={e => { e.stopPropagation(); enrichAllStudies(p.project_id); }}>
                        ↻ Refresh Data
                      </button>
                    </div>
                  )}

                  {/* Sources */}
                  {projInnerTab === 'sources' && (openProject?.studies || []).length === 0 && (
                    <div className="folder-empty">No studies yet. Use Browse to add some.</div>
                  )}
                  {projInnerTab === 'sources' && (openProject?.studies || []).map(s => (
                    <div key={s.study_id} className="chat-row" onClick={() => openStudyModal(s)}>
                      <div className="cr-content">
                        <div className="cr-title">{s.study_title || 'Untitled'}</div>
                        <div className="cr-date">ID {s.study_id}</div>
                      </div>
                      <button className="cr-del" onClick={e => { e.stopPropagation(); removeStudy(s.study_id); }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* New project form */}
          {!showNewProj ? (
            <button className="new-proj-btn" onClick={() => setShowNewProj(true)}>+ New Project</button>
          ) : (
            <div className="new-proj-form">
              <input
                className="new-proj-input"
                placeholder="Project name…"
                value={newProjName}
                onChange={e => setNewProjName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') { setShowNewProj(false); setNewProjName(''); } }}
                autoFocus
              />
              <div className="new-proj-actions">
                <button className="npb-create" onClick={createProject}>Create</button>
                <button className="npb-cancel" onClick={() => { setShowNewProj(false); setNewProjName(''); }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Global Chats */}
          <div className="sb-label" style={{ marginTop: 24 }}>Global Chats</div>
          <button className="new-proj-btn" onClick={newGlobChat}>+ New Global Chat</button>
          {globalChats.map(c => (
            <div
              key={c.chat_id}
              className={`chat-row flat ${view.type === 'global-chat' && view.chatId === c.chat_id ? 'active' : ''}`}
              onClick={() => openGlobChat(c.chat_id)}
            >
              <div className="cr-content">
                <div className="cr-title">{chatCache[c.chat_id]?.title || c.title || 'New chat'}</div>
                {c.updated_at && (
                  <div className="cr-date">
                    {new Date(c.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
              <button className="cr-del" onClick={e => { e.stopPropagation(); deleteGlobChat(c.chat_id); }}>×</button>
            </div>
          ))}
        </div>

        {/* Browse pinned bottom */}
        <div className="sidebar-footer">
          <button
            className={`browse-btn ${view.type === 'browse' ? 'active' : ''}`}
            onClick={() => setView({ type: 'browse' })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:6}}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Browse Studies
          </button>
        </div>
      </aside>

      {/* ══════════════════ MAIN ══════════════════════ */}
      <div className="main">

        {/* Topbar */}
        <div className="topbar">
          <span className="topbar-title">{topTitle}</span>
          {view.type === 'project-chat' && openProject?.studies?.length > 0 && (
            <span className="topbar-badge">{openProject.studies.length} sources</span>
          )}
        </div>

        {/* Content area */}
        <div className="content">

          {/* ── BROWSE ── */}
          {view.type === 'browse' && (
            <div className="browse-panel">
              <div className="browse-search-row">
                <input
                  className="browse-input"
                  placeholder="Search by keyword, author, or topic…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                />
                <button className="btn-search" onClick={() => doSearch()} disabled={searching || !query.trim()}>
                  {searching ? '…' : 'Search'}
                </button>
                {searched && (
                  <button className="btn-clear" onClick={() => { setQuery(''); setResults([]); setSearched(false); setSqlQuery(null); }}>
                    Clear
                  </button>
                )}
              </div>

              <div className="browse-chips">
                {['soil microbiome','gut bacteria','ocean samples','Rob Knight','UC San Diego','16S rRNA'].map(q => (
                  <button key={q} className="browse-chip" onClick={() => doSearch(q)}>{q}</button>
                ))}
              </div>

              {/* Global ctx chips */}
              {!openProjId && ctxStudies.length > 0 && (
                <div className="ctx-bar">
                  <span className="ctx-label">Chat context</span>
                  {ctxStudies.map(s => (
                    <button key={s.study_id} className="ctx-chip"
                      onClick={() => setCtxStudies(prev => prev.filter(x => x.study_id !== s.study_id))}>
                      {(s.study_title||'Untitled').slice(0,32)} ×
                    </button>
                  ))}
                </div>
              )}

              {sqlQuery && (
                <>
                  <label className="sql-toggle">
                    <input type="checkbox" checked={showSql} onChange={e => setShowSql(e.target.checked)} />
                    Show generated SQL
                  </label>
                  {showSql && <div className="sql-block">WHERE {sqlQuery.where_clause}</div>}
                </>
              )}

              {searching && <div className="state-loading"><div className="spinner" /><br />Searching…</div>}

              {!searching && (
                <>
                  <div className="browse-count">{searched ? `${results.length} results` : 'First 20 studies'}</div>
                  {searched && results.length === 0 && <div className="state-empty">No studies matched your search.</div>}
                  <div className="studies-grid">
                    {displayStudies.map(study => {
                      const inProj = projStudyIds.includes(study.study_id);
                      const inCtx  = ctxStudyIds.includes(study.study_id);
                      const dataTypeList = (study.data_types || '').split(',').map(t => t.trim()).filter(Boolean);
                      const metaParts = [
                        study.num_samples != null ? `${study.num_samples} samples` : null,
                        study.num_preps    != null ? `${study.num_preps} preps`    : null,
                      ].filter(Boolean);
                      return (
                        <div key={study.study_id} className="study-card" onClick={() => openStudyModal(study)}>
                          <div className="study-card-top">
                            <span className="study-id-badge">ID {study.study_id}</span>
                            <div className="study-card-actions" onClick={e => e.stopPropagation()}>
                              {openProjId ? (
                                <button className="btn-card-add" disabled={inProj} onClick={() => addStudyToProject(study)}>
                                  {inProj ? '✓ Saved' : '+ Add to Project'}
                                </button>
                              ) : (
                                <button className={`btn-card-ctx ${inCtx ? 'on' : ''}`}
                                  onClick={() => setCtxStudies(prev =>
                                    inCtx ? prev.filter(s => s.study_id !== study.study_id) : [...prev, study])}>
                                  {inCtx ? '✓ Context' : '+ Context'}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="study-card-title">{study.study_title || 'Untitled study'}</div>
                          <div className="study-card-abstract">{study.study_abstract || 'No abstract available.'}</div>
                          {dataTypeList.length > 0 && (
                            <div className="study-card-types">
                              {dataTypeList.map(t => <span key={t} className="dtype-chip">{t}</span>)}
                            </div>
                          )}
                          {metaParts.length > 0 && (
                            <div className="study-card-meta">{metaParts.join(' · ')}</div>
                          )}
                          {(study.pi_name || study.pi_affiliation) && (
                            <div className="study-card-pi">
                              {[study.pi_name, study.pi_affiliation].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── CHAT ── */}
          {isChat && (
            <>
              {/* Sources bar */}
              {view.type === 'project-chat' && openProject?.studies?.length > 0 && (
                <div className="sources-bar">
                  <span className="sources-label">Sources</span>
                  {(openProject.studies||[]).map(s => (
                    <button key={s.study_id} className="src-chip" onClick={() => openStudyModal(s)}>
                      {(s.study_title||'Untitled').slice(0,40)}
                    </button>
                  ))}
                </div>
              )}
              {view.type === 'global-chat' && ctxStudies.length > 0 && (
                <div className="sources-bar">
                  <span className="sources-label">Context</span>
                  {ctxStudies.map(s => (
                    <button key={s.study_id} className="src-chip removable"
                      onClick={() => setCtxStudies(prev => prev.filter(x => x.study_id !== s.study_id))}>
                      {(s.study_title||'Untitled').slice(0,40)} ×
                    </button>
                  ))}
                </div>
              )}

              {/* Messages */}
              <div className="chat-messages">
                {activeMsgs.length === 0 ? (
                  <div className="chat-empty">
                    <div className="chat-empty-title">
                      {view.type === 'project-chat'
                        ? `Chat with ${projects.find(p => p.project_id === view.projId)?.name || 'Project'}`
                        : 'Global Chat'}
                    </div>
                    <p className="chat-empty-sub">
                      {view.type === 'project-chat'
                        ? `Ask anything about your ${openProject?.studies?.length || 0} saved studies.`
                        : 'Add studies as context from Browse, then ask questions here.'}
                    </p>
                    <div className="chat-empty-chips">
                      {['What are the key themes?','Who are the PIs?','Summarize the abstracts','What sample types were used?']
                        .map(q => (
                          <button key={q} className="chat-starter" onClick={() => { setInput(q); taRef.current?.focus(); }}>{q}</button>
                        ))}
                    </div>
                  </div>
                ) : (
                  activeMsgs.map((m, i) => (
                    <div key={i} className={`msg-row ${m.role}`}>
                      <div className="msg-bubble">
                        {m.content}
                        {m.isStreaming && <span className="typing-caret" />}
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </>
          )}

          {/* No chat selected placeholder */}
          {view.type === 'project-chat' && !view.chatId && !isChat && (
            <div className="chat-empty" style={{paddingTop:60}}>
              <div className="chat-empty-title">Select a chat</div>
              <p className="chat-empty-sub">Pick a chat from the sidebar or start a new one.</p>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="composer-wrap">
          <div className={`composer ${!isChat ? 'muted' : ''}`}>
            <textarea
              ref={taRef}
              className="composer-ta"
              rows={1}
              placeholder={isChat ? 'Message…' : 'Open a chat to start messaging'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && isChat) { e.preventDefault(); sendMessage(); } }}
              disabled={!isChat || sending}
            />
            <button className="composer-send" onClick={sendMessage} disabled={!canSend}>↑</button>
          </div>
          {compErr && <div className="composer-error">{compErr}</div>}
        </div>
      </div>

      {/* ══════════════════ MODAL ══════════════════════ */}
      {modalStudy && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>
            <div className="modal-id">Study ID {modalStudy.study_id}</div>
            <div className="modal-title">{modalStudy.study_title || 'Untitled study'}</div>

            {/* Quick stats row */}
            {(modalStudy.data_types || modalStudy.num_samples != null || modalStudy.num_preps != null) && (
              <div className="modal-stats">
                {(modalStudy.data_types || '').split(',').map(t => t.trim()).filter(Boolean).map(t => (
                  <span key={t} className="dtype-chip">{t}</span>
                ))}
                {modalStudy.num_samples != null && <span className="modal-stat">{modalStudy.num_samples} samples</span>}
                {modalStudy.num_preps   != null && <span className="modal-stat">{modalStudy.num_preps} preps</span>}
              </div>
            )}

            {modalStudy.study_abstract && (
              <div className="modal-section"><h4>Abstract</h4><p>{modalStudy.study_abstract}</p></div>
            )}
            {modalStudy.pi_name && (
              <div className="modal-section">
                <h4>Principal Investigator</h4>
                <p>{modalStudy.pi_name}{modalStudy.pi_affiliation ? ` — ${modalStudy.pi_affiliation}` : ''}</p>
              </div>
            )}
            {modalStudy.pi_email && (
              <div className="modal-section"><h4>Contact</h4><p>{modalStudy.pi_email}</p></div>
            )}

            {/* Prep templates — lazy loaded */}
            <div className="modal-section">
              <h4>Prep Templates</h4>
              {modalDetailLoading && <div className="modal-detail-loading">Loading…</div>}
              {!modalDetailLoading && modalDetail && (modalDetail.preps || []).length === 0 && (
                <p style={{color:'var(--text-3)', fontSize:'0.85rem'}}>No prep templates found.</p>
              )}
              {!modalDetailLoading && modalDetail && (modalDetail.preps || []).length > 0 && (
                <table className="prep-table">
                  <thead>
                    <tr><th>Prep ID</th><th>Data Type</th><th>Investigation</th><th>Platform</th><th>Target Gene</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {modalDetail.preps.map(p => (
                      <tr key={p.prep_template_id}>
                        <td>{p.prep_template_id}</td>
                        <td>{p.data_type || '—'}</td>
                        <td>{p.investigation_type || '—'}</td>
                        <td>{p.platform || '—'}</td>
                        <td>{p.target_gene || '—'}</td>
                        <td>{p.preprocessing_status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Samples — lazy loaded */}
            {!modalDetailLoading && modalDetail && (
              <div className="modal-section">
                <h4>Samples{modalDetail.total_samples != null ? ` (${modalDetail.total_samples} total${modalDetail.total_samples > 200 ? ', showing first 200' : ''})` : ''}</h4>
                {(modalDetail.samples || []).length === 0 ? (
                  <p style={{color:'var(--text-3)', fontSize:'0.85rem'}}>No samples found.</p>
                ) : (
                  <div className="samples-table-wrap">
                    <table className="prep-table">
                      <thead>
                        <tr><th>Sample ID</th><th>Anonymized Name</th><th>Env Package</th><th>Collection Date</th></tr>
                      </thead>
                      <tbody>
                        {modalDetail.samples.map(s => (
                          <tr key={s.sample_id}>
                            <td>{s.sample_id}</td>
                            <td>{s.anonymized_name || '—'}</td>
                            <td>{s.env_package || '—'}</td>
                            <td>{s.collection_timestamp ? s.collection_timestamp.slice(0, 10) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Artifacts */}
            {!modalDetailLoading && modalDetail && (modalDetail.artifacts || []).length > 0 && (
              <div className="modal-section">
                <h4>Artifacts</h4>
                <table className="prep-table">
                  <thead>
                    <tr><th>Artifact ID</th><th>Type</th><th>Data Type</th><th>File Path</th></tr>
                  </thead>
                  <tbody>
                    {modalDetail.artifacts.map(a => (
                      <tr key={`${a.prep_template_id}-${a.artifact_id}`}>
                        <td>{a.artifact_id}</td>
                        <td>{a.artifact_type || '—'}</td>
                        <td>{a.data_type || '—'}</td>
                        <td className="artifact-path-cell">
                          <span className="artifact-path" title={a.full_path}>{a.full_path ? a.full_path.split('/').slice(-2).join('/') : '—'}</span>
                          {a.full_path && (
                            <button className="btn-copy-path" title="Copy full path"
                              onClick={() => navigator.clipboard?.writeText(a.full_path)}>
                              ⎘
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);