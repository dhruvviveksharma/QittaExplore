const { useState, useEffect, useRef, useCallback, useMemo } = React;

const API = 'http://localhost:5001/api';
const USER_ID = 'default';

// ─── tiny helpers ────────────────────────────────────────────────────────────
const api = (path, opts = {}) =>
  fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
const del  = (path)       => api(path, { method: 'DELETE' });

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
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      let type = 'message', data = '{}';
      for (const ln of chunk.split('\n')) {
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

// ─── App ─────────────────────────────────────────────────────────────────────
function App() {
  // ── sidebar selection ──
  const [sidebarTab, setSidebarTab] = useState('projects'); // 'projects' | 'chats'

  // ── projects ──
  const [projects,   setProjects]   = useState([]);
  const [activeProj, setActiveProj] = useState('');   // project_id
  const [project,    setProject]    = useState(null); // full project obj
  const [showNewProj,setShowNewProj]= useState(false);
  const [newProjName,setNewProjName]= useState('');

  // ── project chats ──
  const [projChats,   setProjChats]   = useState([]);
  const [activeProjChat, setActiveProjChat] = useState('');
  const [projChat,    setProjChat]    = useState(null);

  // ── global chats ──
  const [globalChats,   setGlobalChats]   = useState([]);
  const [activeGlobChat,setActiveGlobChat]= useState('');
  const [globChat,      setGlobChat]      = useState(null);

  // ── main mode ──
  const [mode, setMode] = useState('browse'); // 'browse' | 'chat'

  // ── browse / search ──
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [searched,    setSearched]    = useState(false);
  const [sqlQuery,    setSqlQuery]    = useState(null);
  const [showSql,     setShowSql]     = useState(false);
  const [firstStudies,setFirstStudies]= useState([]);
  const [firstLoading,setFirstLoading]= useState(false);

  // ── selected context studies (global chat) ──
  const [ctxStudies, setCtxStudies] = useState([]);

  // ── composer ──
  const [input,   setInput]   = useState('');
  const [sending, setSending] = useState(false);
  const [compErr, setCompErr] = useState('');

  // ── modal ──
  const [modalStudy, setModalStudy] = useState(null);

  const abortRef  = useRef(null);
  const taRef     = useRef(null);
  const bottomRef = useRef(null);

  // ── auto-resize textarea ──
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = '0';
    taRef.current.style.height = Math.min(200, taRef.current.scrollHeight) + 'px';
  }, [input]);

  // ── scroll to bottom on new messages ──
  const messages = mode === 'chat'
    ? (activeProj ? projChat?.messages || [] : globChat?.messages || [])
    : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content?.length]);

  // ── initial load ──
  useEffect(() => { loadProjects(); loadGlobalChats(); loadFirstStudies(); }, []);

  // ── load project when activeProj changes ──
  useEffect(() => {
    if (!activeProj) { setProject(null); setProjChats([]); setProjChat(null); return; }
    loadProject(activeProj);
    loadProjChats(activeProj);
    setActiveProjChat('');
    setProjChat(null);
  }, [activeProj]);

  // ── load chat when activeProjChat changes ──
  useEffect(() => {
    if (!activeProj || !activeProjChat) { setProjChat(null); return; }
    loadProjChat(activeProj, activeProjChat);
  }, [activeProj, activeProjChat]);

  // ── load global chat ──
  useEffect(() => {
    if (!activeGlobChat) { setGlobChat(null); return; }
    loadGlobChat(activeGlobChat);
  }, [activeGlobChat]);

  // ── cleanup abort ──
  useEffect(() => () => abortRef.current?.abort(), []);

  // ─── loaders ────────────────────────────────────────────────────
  const loadProjects = async () => {
    const res = await api(`/projects?user_id=${USER_ID}`);
    if (!res.ok) return;
    const { projects: list } = await res.json();
    setProjects(list || []);
    if (!activeProj && list?.length) setActiveProj(list[0].project_id);
  };

  const loadProject = async (pid) => {
    const res = await api(`/projects/${pid}?user_id=${USER_ID}`);
    if (res.ok) setProject(await res.json());
  };

  const loadProjChats = async (pid) => {
    const res = await api(`/projects/${pid}/chats?user_id=${USER_ID}`);
    if (res.ok) { const d = await res.json(); setProjChats(d.chats || []); }
  };

  const loadProjChat = async (pid, cid) => {
    const res = await api(`/projects/${pid}/chats/${cid}?user_id=${USER_ID}`);
    if (res.ok) setProjChat(await res.json());
  };

  const loadGlobalChats = async () => {
    const res = await api(`/global-chats?user_id=${USER_ID}`);
    if (res.ok) { const d = await res.json(); setGlobalChats(d.chats || []); }
  };

  const loadGlobChat = async (cid) => {
    const res = await api(`/global-chats/${cid}?user_id=${USER_ID}`);
    if (res.ok) setGlobChat(await res.json());
  };

  const loadFirstStudies = async () => {
    setFirstLoading(true);
    const res = await api('/studies/first?limit=20');
    if (res.ok) { const d = await res.json(); setFirstStudies(d.results || []); }
    setFirstLoading(false);
  };

  // ─── project actions ────────────────────────────────────────────
  const createProject = async () => {
    const name = newProjName.trim() || 'Untitled';
    const res = await post('/projects', { user_id: USER_ID, name });
    if (!res.ok) return;
    const proj = await res.json();
    setNewProjName(''); setShowNewProj(false);
    await loadProjects();
    setActiveProj(proj.project_id);
    setMode('chat');
  };

  const deleteProject = async (pid) => {
    if (!confirm('Delete this project?')) return;
    await del(`/projects/${pid}?user_id=${USER_ID}`);
    if (activeProj === pid) { setActiveProj(''); setProject(null); }
    loadProjects();
  };

  const addStudyToProject = async (study) => {
    if (!activeProj) return;
    const res = await post(`/projects/${activeProj}/studies`, { user_id: USER_ID, study });
    if (res.ok) loadProject(activeProj);
  };

  const removeStudyFromProject = async (studyId) => {
    if (!activeProj) return;
    await del(`/projects/${activeProj}/studies/${studyId}?user_id=${USER_ID}`);
    loadProject(activeProj);
  };

  // ─── chat actions ────────────────────────────────────────────────
  const newProjectChat = async () => {
    if (!activeProj) return;
    const res = await post(`/projects/${activeProj}/chats`, { user_id: USER_ID });
    if (!res.ok) return;
    const chat = await res.json();
    setActiveProjChat(chat.chat_id);
    setProjChat(chat);
    setMode('chat');
    loadProjChats(activeProj);
  };

  const deleteProjectChat = async (cid) => {
    if (!activeProj) return;
    await del(`/projects/${activeProj}/chats/${cid}?user_id=${USER_ID}`);
    if (activeProjChat === cid) { setActiveProjChat(''); setProjChat(null); }
    loadProjChats(activeProj);
  };

  const newGlobalChat = async () => {
    const res = await post('/global-chats', { user_id: USER_ID });
    if (!res.ok) return;
    const chat = await res.json();
    setActiveGlobChat(chat.chat_id);
    setGlobChat(chat);
    setActiveProj('');
    setMode('chat');
    loadGlobalChats();
  };

  const deleteGlobalChat = async (cid) => {
    await del(`/global-chats/${cid}?user_id=${USER_ID}`);
    if (activeGlobChat === cid) { setActiveGlobChat(''); setGlobChat(null); }
    loadGlobalChats();
  };

  // ─── ensure chat exists ─────────────────────────────────────────
  const ensureProjChat = async () => {
    if (activeProjChat) return activeProjChat;
    const res = await post(`/projects/${activeProj}/chats`, { user_id: USER_ID });
    if (!res.ok) throw new Error('Failed to create chat');
    const chat = await res.json();
    setActiveProjChat(chat.chat_id);
    setProjChat(chat);
    loadProjChats(activeProj);
    return chat.chat_id;
  };

  const ensureGlobChat = async () => {
    if (activeGlobChat) return activeGlobChat;
    const res = await post('/global-chats', { user_id: USER_ID });
    if (!res.ok) throw new Error('Failed to create chat');
    const chat = await res.json();
    setActiveGlobChat(chat.chat_id);
    setGlobChat(chat);
    loadGlobalChats();
    return chat.chat_id;
  };

  // ─── streaming helpers ──────────────────────────────────────────
  const appendOptimistic = (setter, userMsg) => {
    setter(prev => {
      const msgs = [...(prev?.messages || []),
        { role: 'user', content: userMsg },
        { role: 'assistant', content: '', isStreaming: true }
      ];
      return { ...(prev || {}), messages: msgs };
    });
  };

  const appendToken = (setter, token) => {
    setter(prev => {
      if (!prev) return prev;
      const msgs = [...prev.messages];
      const last = { ...msgs[msgs.length - 1], content: (msgs[msgs.length - 1].content || '') + token };
      msgs[msgs.length - 1] = last;
      return { ...prev, messages: msgs };
    });
  };

  const finalizeStream = (setter) => {
    setter(prev => {
      if (!prev) return prev;
      const msgs = prev.messages.map((m, i) =>
        i === prev.messages.length - 1 ? { ...m, isStreaming: false } : m
      );
      return { ...prev, messages: msgs };
    });
  };

  // ─── send message ───────────────────────────────────────────────
  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setSending(true); setCompErr(''); setInput('');

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      if (activeProj) {
        // Project chat
        const cid = await ensureProjChat();
        appendOptimistic(setProjChat, msg);

        const res = await fetch(`${API}/projects/${activeProj}/chats/${cid}/message/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: USER_ID, message: msg }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error('Stream failed');

        await parseSSE(res, {
          onToken: ({ token }) => appendToken(setProjChat, token || ''),
          onDone:  ()          => { finalizeStream(setProjChat); loadProjChat(activeProj, cid); loadProjChats(activeProj); },
          onError: ({ error }) => setCompErr(error || 'Error'),
        }, ctrl.signal);

      } else {
        // Global chat
        const cid = await ensureGlobChat();
        appendOptimistic(setGlobChat, msg);

        const res = await fetch(`${API}/global-chats/${cid}/message/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: USER_ID, message: msg, selected_studies: ctxStudies }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error('Stream failed');

        await parseSSE(res, {
          onToken: ({ token }) => appendToken(setGlobChat, token || ''),
          onDone:  ()          => { finalizeStream(setGlobChat); loadGlobChat(cid); loadGlobalChats(); },
          onError: ({ error }) => setCompErr(error || 'Error'),
        }, ctrl.signal);
      }
    } catch (e) {
      if (e.name !== 'AbortError') setCompErr(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  // ─── search ─────────────────────────────────────────────────────
  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true); setSearched(false);
    const res = await post('/search', { query });
    if (res.ok) {
      const d = await res.json();
      setResults(d.results || []);
      setSqlQuery(d.sql_query || null);
    } else {
      setResults([]);
    }
    setSearched(true); setSearching(false);
  };

  // ─── derived ────────────────────────────────────────────────────
  const projStudyIds = useMemo(() => (project?.studies || []).map(s => s.study_id), [project]);
  const ctxStudyIds  = useMemo(() => ctxStudies.map(s => s.study_id), [ctxStudies]);

  const isProjectMode = !!activeProj;
  const displayStudies = searched ? results : firstStudies;
  const displayLabel   = searched ? `${results.length} results` : 'First 20 studies';

  const chatMessages = mode === 'chat'
    ? (isProjectMode ? projChat?.messages || [] : globChat?.messages || [])
    : [];

  const chatIsEmpty = chatMessages.length === 0;

  // ─── topbar title ────────────────────────────────────────────────
  const topTitle = () => {
    if (mode === 'browse') return 'Browse Studies';
    if (isProjectMode && project) return project.name;
    return 'Global Chat';
  };

  // ─── render ─────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">Qiita <span>Explorer</span></div>
          <button
            className="new-chat-btn"
            title="New chat"
            onClick={() => isProjectMode ? newProjectChat() : newGlobalChat()}
          >
            ✏
          </button>
        </div>

        <div className="sidebar-nav">
          <button
            className={`sidebar-nav-btn ${sidebarTab === 'projects' ? 'active' : ''}`}
            onClick={() => setSidebarTab('projects')}
          >Projects</button>
          <button
            className={`sidebar-nav-btn ${sidebarTab === 'chats' ? 'active' : ''}`}
            onClick={() => setSidebarTab('chats')}
          >Chats</button>
        </div>

        <div className="sidebar-body">
          {sidebarTab === 'projects' && (
            <>
              <div className="sidebar-section-label">Your Projects</div>

              {projects.map(p => (
                <button
                  key={p.project_id}
                  className={`sidebar-item ${activeProj === p.project_id ? 'active' : ''}`}
                  onClick={() => { setActiveProj(p.project_id); setSidebarTab('chats'); setMode('chat'); }}
                >
                  <span className="sidebar-item-label">{p.name}</span>
                  <span className="sidebar-item-meta">{p.studies_count || 0} studies</span>
                  <button
                    className="sidebar-item-del"
                    onClick={e => { e.stopPropagation(); deleteProject(p.project_id); }}
                    title="Delete project"
                  >×</button>
                </button>
              ))}

              {!showNewProj ? (
                <button className="sidebar-new-btn" onClick={() => setShowNewProj(true)}>
                  + New Project
                </button>
              ) : (
                <div className="new-project-row">
                  <input
                    className="new-project-input"
                    placeholder="Project name"
                    value={newProjName}
                    onChange={e => setNewProjName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createProject()}
                    autoFocus
                  />
                  <div className="new-project-actions">
                    <button className="btn-mini btn-mini-primary" onClick={createProject}>Create</button>
                    <button className="btn-mini btn-mini-ghost" onClick={() => { setShowNewProj(false); setNewProjName(''); }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Studies in active project */}
              {activeProj && project?.studies?.length > 0 && (
                <>
                  <div className="sidebar-section-label" style={{ marginTop: 16 }}>
                    Sources · {project.name}
                  </div>
                  {(project.studies || []).map(s => (
                    <button
                      key={s.study_id}
                      className="sidebar-item"
                      onClick={() => setModalStudy(s)}
                    >
                      <span className="sidebar-item-label">{s.study_title || 'Untitled'}</span>
                      <span className="sidebar-item-meta">ID {s.study_id}</span>
                      <button
                        className="sidebar-item-del"
                        onClick={e => { e.stopPropagation(); removeStudyFromProject(s.study_id); }}
                        title="Remove from project"
                      >×</button>
                    </button>
                  ))}
                </>
              )}
            </>
          )}

          {sidebarTab === 'chats' && (
            <>
              {activeProj && (
                <>
                  <div className="sidebar-section-label">Project Chats · {project?.name || '…'}</div>
                  {projChats.map(c => (
                    <button
                      key={c.chat_id}
                      className={`sidebar-item ${activeProjChat === c.chat_id ? 'active' : ''}`}
                      onClick={() => { setActiveProjChat(c.chat_id); setMode('chat'); }}
                    >
                      <span className="sidebar-item-label">{c.title || 'New chat'}</span>
                      <button
                        className="sidebar-item-del"
                        onClick={e => { e.stopPropagation(); deleteProjectChat(c.chat_id); }}
                        title="Delete chat"
                      >×</button>
                    </button>
                  ))}
                  <button className="sidebar-new-btn" onClick={newProjectChat}>+ New Project Chat</button>
                </>
              )}

              <div className="sidebar-section-label" style={{ marginTop: activeProj ? 16 : 0 }}>Global Chats</div>
              {globalChats.map(c => (
                <button
                  key={c.chat_id}
                  className={`sidebar-item ${!activeProj && activeGlobChat === c.chat_id ? 'active' : ''}`}
                  onClick={() => { setActiveProj(''); setActiveGlobChat(c.chat_id); setMode('chat'); }}
                >
                  <span className="sidebar-item-label">{c.title || 'New chat'}</span>
                  <button
                    className="sidebar-item-del"
                    onClick={e => { e.stopPropagation(); deleteGlobalChat(c.chat_id); }}
                    title="Delete chat"
                  >×</button>
                </button>
              ))}
              <button className="sidebar-new-btn" onClick={newGlobalChat}>+ New Global Chat</button>
            </>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="main">
        {/* Top bar */}
        <div className="topbar">
          <span className="topbar-title">{topTitle()}</span>
          {isProjectMode && mode === 'chat' && project?.studies?.length > 0 && (
            <span className="topbar-badge">{project.studies.length} sources</span>
          )}
          <div className="topbar-spacer" />
          <div className="mode-toggle">
            <button
              className={`mode-toggle-btn ${mode === 'browse' ? 'active' : ''}`}
              onClick={() => setMode('browse')}
            >Browse</button>
            <button
              className={`mode-toggle-btn ${mode === 'chat' ? 'active' : ''}`}
              onClick={() => setMode('chat')}
            >Chat</button>
          </div>
        </div>

        {/* Content */}
        <div className="content">
          {/* ── BROWSE MODE ── */}
          {mode === 'browse' && (
            <div className="browse-panel">
              {/* search bar */}
              <div className="browse-search-box">
                <input
                  className="browse-search-input"
                  placeholder="Search by keyword, author, or topic…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                />
                <button className="btn-primary" onClick={doSearch} disabled={searching || !query.trim()}>
                  {searching ? '…' : 'Search'}
                </button>
                {searched && (
                  <button className="btn-ghost" onClick={() => { setQuery(''); setResults([]); setSearched(false); setSqlQuery(null); }}>
                    Clear
                  </button>
                )}
              </div>

              {/* quick filters */}
              <div className="browse-chips">
                {['soil microbiome','gut bacteria','ocean samples','Rob Knight','UC San Diego','16S rRNA'].map(q => (
                  <button key={q} className="browse-chip" onClick={() => { setQuery(q); setTimeout(doSearch, 50); }}>
                    {q}
                  </button>
                ))}
              </div>

              {/* selected context chips (global chat) */}
              {!isProjectMode && ctxStudies.length > 0 && (
                <div>
                  <div className="project-section-title">Chat Context</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ctxStudies.map(s => (
                      <button
                        key={s.study_id}
                        className="source-chip removable"
                        onClick={() => setCtxStudies(prev => prev.filter(x => x.study_id !== s.study_id))}
                      >
                        ID {s.study_id} · {(s.study_title || 'Untitled').slice(0, 30)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* sql */}
              {sqlQuery && (
                <>
                  <label className="sql-toggle">
                    <input type="checkbox" checked={showSql} onChange={e => setShowSql(e.target.checked)} />
                    Show generated SQL
                  </label>
                  {showSql && (
                    <div className="sql-block">WHERE {sqlQuery.where_clause}<br />params: {JSON.stringify(sqlQuery.params)}</div>
                  )}
                </>
              )}

              {/* results */}
              {searching && (
                <div className="state-loading">
                  <div className="spinner" /><br />Searching…
                </div>
              )}

              {!searching && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{displayLabel}</div>
                  {displayStudies.length === 0 && searched && (
                    <div className="state-empty">No studies matched your search.</div>
                  )}
                  <div className="studies-grid">
                    {displayStudies.map(study => {
                      const inProj     = projStudyIds.includes(study.study_id);
                      const inCtx      = ctxStudyIds.includes(study.study_id);
                      return (
                        <div key={study.study_id} className="study-card" onClick={() => setModalStudy(study)}>
                          <div className="study-card-header">
                            <span className="study-id">ID {study.study_id}</span>
                            <div className="study-card-actions" onClick={e => e.stopPropagation()}>
                              {/* global: add to context */}
                              {!isProjectMode && (
                                <button
                                  className={`btn-card btn-card-ghost ${inCtx ? 'selected' : ''}`}
                                  onClick={() => setCtxStudies(prev =>
                                    inCtx ? prev.filter(s => s.study_id !== study.study_id) : [...prev, study]
                                  )}
                                >
                                  {inCtx ? '✓ Context' : '+ Context'}
                                </button>
                              )}
                              {/* project: add to project */}
                              {isProjectMode && (
                                <button
                                  className="btn-card btn-card-primary"
                                  disabled={inProj}
                                  onClick={() => addStudyToProject(study)}
                                >
                                  {inProj ? 'Saved' : '+ Project'}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="study-card-title">{study.study_title || 'Untitled study'}</div>
                          <div className="study-card-abstract">{study.study_abstract || 'No abstract available.'}</div>
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

          {/* ── CHAT MODE ── */}
          {mode === 'chat' && (
            <>
              {/* Sources bar for project chat */}
              {isProjectMode && project?.studies?.length > 0 && (
                <div className="sources-bar">
                  <div className="sources-bar-inner">
                    <span className="sources-label">Sources</span>
                    {(project.studies || []).map(s => (
                      <button key={s.study_id} className="source-chip" onClick={() => setModalStudy(s)}>
                        {(s.study_title || 'Untitled').slice(0, 40)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sources bar for global chat */}
              {!isProjectMode && ctxStudies.length > 0 && (
                <div className="sources-bar">
                  <div className="sources-bar-inner">
                    <span className="sources-label">Context</span>
                    {ctxStudies.map(s => (
                      <button
                        key={s.study_id}
                        className="source-chip removable"
                        onClick={() => setCtxStudies(prev => prev.filter(x => x.study_id !== s.study_id))}
                      >
                        {(s.study_title || 'Untitled').slice(0, 40)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="chat-messages">
                {chatIsEmpty ? (
                  <div className="chat-empty">
                    <div className="chat-empty-title">
                      {isProjectMode ? `Chat with ${project?.name || 'Project'}` : 'Global Chat'}
                    </div>
                    <p className="chat-empty-sub">
                      {isProjectMode
                        ? `Ask anything about your ${project?.studies?.length || 0} saved studies, or explore microbiome concepts.`
                        : 'Search and add studies as context in Browse mode, then ask questions about them here.'}
                    </p>
                    <div className="chat-empty-chips">
                      {['What are the key themes across my studies?',
                        'Summarize the study abstracts',
                        'Who are the principal investigators?',
                        'What sample types were used?'].map(q => (
                        <button key={q} className="chat-empty-chip" onClick={() => { setInput(q); taRef.current?.focus(); }}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatMessages.map((m, i) => (
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
        </div>

        {/* ── COMPOSER ── */}
        <div className="composer-wrap">
          <div className="composer">
            <textarea
              ref={taRef}
              className="composer-textarea"
              rows={1}
              placeholder={mode === 'browse' ? 'Switch to Chat to send a message…' : 'Message…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (mode === 'chat') sendMessage(); }
              }}
              disabled={sending || mode === 'browse'}
            />
            <button
              className="composer-send"
              onClick={() => { if (mode !== 'chat') setMode('chat'); else sendMessage(); }}
              disabled={sending || (mode === 'chat' && !input.trim())}
            >
              ↑
            </button>
          </div>
          {compErr && <div className="composer-error">{compErr}</div>}
        </div>
      </div>

      {/* ── STUDY MODAL ── */}
      {modalStudy && (
        <div className="modal-overlay" onClick={() => setModalStudy(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalStudy(null)}>×</button>
            <div className="modal-id">Study ID {modalStudy.study_id}</div>
            <div className="modal-title">{modalStudy.study_title || 'Untitled study'}</div>
            <div className="modal-section">
              <h4>Abstract</h4>
              <p>{modalStudy.study_abstract || 'No abstract available.'}</p>
            </div>
            {modalStudy.pi_name && (
              <div className="modal-section">
                <h4>Principal Investigator</h4>
                <p>{modalStudy.pi_name}{modalStudy.pi_affiliation ? ` — ${modalStudy.pi_affiliation}` : ''}</p>
              </div>
            )}
            {modalStudy.pi_email && (
              <div className="modal-section">
                <h4>Contact</h4>
                <p>{modalStudy.pi_email}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);