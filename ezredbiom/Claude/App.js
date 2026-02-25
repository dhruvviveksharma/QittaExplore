/* eslint-disable no-undef */
const { useState, useEffect, useRef, useCallback } = React;

const API_BASE = 'http://localhost:5001/api';

// ── user identity (anonymous UUID per browser) ────────────────────────────
function getUserId() {
  let uid = localStorage.getItem('qiita_user_id');
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem('qiita_user_id', uid);
  }
  return uid;
}
const USER_ID = getUserId();

const PROJECT_COLORS = [
  '#00e5c8', '#4dd9ff', '#f5a623', '#a78bfa',
  '#f472b6', '#34d399', '#fb923c', '#60a5fa',
];

// ── API helpers ───────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': USER_ID,
      ...(opts.headers || {}),
    },
    ...opts,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ── Toast context ─────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);
  return { toasts, show };
}

function ToastContainer({ toasts }) {
  const icons = { success: '✓', error: '✕', info: '●' };
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{icons[t.type]}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Create / Edit Project Modal ───────────────────────────────────────────
function ProjectModal({ project, onClose, onSave }) {
  const [name, setName]   = useState(project?.name || '');
  const [desc, setDesc]   = useState(project?.description || '');
  const [color, setColor] = useState(project?.color || PROJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), description: desc.trim(), color });
    setSaving(false);
  }

  function onKey(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{project ? 'Edit Project' : 'New Project'}</h3>
        <div className="form-group">
          <label className="form-label">PROJECT NAME</label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={onKey}
            placeholder="e.g. Gut Microbiome Research"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">DESCRIPTION</label>
          <textarea
            className="form-input form-textarea"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Optional description…"
          />
        </div>
        <div className="form-group">
          <label className="form-label">COLOR</label>
          <div className="color-options">
            {PROJECT_COLORS.map(c => (
              <div
                key={c}
                className={`color-swatch ${color === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Saving…' : (project ? 'Save Changes' : 'Create Project')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────
function Sidebar({
  projects, activeProjectId, activeChatId, currentView,
  onSearchClick, onProjectClick, onChatClick, onNewChat, onNewProject,
}) {
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  function toggleExpand(pid) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  }

  // auto-expand active project
  useEffect(() => {
    if (activeProjectId) {
      setExpandedProjects(prev => new Set([...prev, activeProjectId]));
    }
  }, [activeProjectId]);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon">🧬</div>
          <div>
            <div className="logo-text">Qiita Explorer</div>
            <div className="logo-sub">MICROBIOME RESEARCH</div>
          </div>
        </div>
      </div>

      <button
        className={`sidebar-search-btn ${currentView === 'search' ? 'active' : ''}`}
        onClick={onSearchClick}
      >
        <span>🔍</span>
        <span>Study Search</span>
      </button>

      <div className="sidebar-section-header">
        <span className="sidebar-section-label">Projects</span>
        <button className="new-project-btn" onClick={onNewProject} title="New project">+</button>
      </div>

      <div className="projects-list">
        {projects.length === 0 ? (
          <div className="sidebar-empty">No projects yet.<br/>Create one to save studies & chats.</div>
        ) : (
          projects.map(p => {
            const isActive   = p.id === activeProjectId;
            const isExpanded = expandedProjects.has(p.id);
            return (
              <div key={p.id} className={`project-item ${isActive ? 'active' : ''}`}>
                <div
                  className="project-item-header"
                  onClick={() => {
                    onProjectClick(p);
                    toggleExpand(p.id);
                  }}
                >
                  <div className="project-dot" style={{ background: p.color }} />
                  <span className="project-name">{p.name}</span>
                  <span className="project-counts">{p.study_count}s {p.chat_count}c</span>
                </div>
                {isExpanded && isActive && (
                  <div className="project-chats">
                    {p.chats && p.chats.map(chat => (
                      <div
                        key={chat.id}
                        className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                        onClick={() => onChatClick(p, chat)}
                      >
                        <span className="chat-item-icon">💬</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chat.title}
                        </span>
                      </div>
                    ))}
                    <button className="new-chat-btn" onClick={() => onNewChat(p)}>
                      <span>+</span>
                      <span>New Chat</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

// ── Study Card (search results) ───────────────────────────────────────────
function StudyCard({ study, projects, savedProjectIds, onSaveToProject }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isSaved = savedProjectIds && savedProjectIds.size > 0;

  return (
    <div className="study-card">
      <div className="card-top">
        <span className="study-id-badge">ID {study.study_id}</span>
        <div className="relative" ref={dropRef}>
          <button
            className={`save-to-project-btn ${isSaved ? 'saved' : ''}`}
            onClick={() => setShowDropdown(d => !d)}
          >
            {isSaved ? '✓ Saved' : '+ Save'}
          </button>
          {showDropdown && (
            <div className="project-selector">
              {projects.length === 0 ? (
                <div className="project-selector-empty">No projects yet</div>
              ) : (
                projects.map(p => (
                  <div
                    key={p.id}
                    className="project-selector-item"
                    onClick={() => { onSaveToProject(study, p); setShowDropdown(false); }}
                  >
                    <div className="ps-dot" style={{ background: p.color }} />
                    {p.name}
                    {savedProjectIds && savedProjectIds.has(p.id) && ' ✓'}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <h3 className="study-title">{study.study_title || 'Untitled Study'}</h3>
      <p className="study-abstract">{study.study_abstract || 'No abstract available.'}</p>

      <div className="card-meta">
        {study.pi_name && (
          <div className="meta-row">
            <span className="meta-icon">👤</span>
            <span>PI: {study.pi_name}</span>
          </div>
        )}
        {study.pi_affiliation && (
          <div className="meta-row">
            <span className="meta-icon">🏛️</span>
            <span>{study.pi_affiliation}</span>
          </div>
        )}
        {study.lab_person_name && (
          <div className="meta-row">
            <span className="meta-icon">👥</span>
            <span>Lab: {study.lab_person_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Search View ───────────────────────────────────────────────────────────
function SearchView({ projects, savedStudyMap, onStudySaved, showToast }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [sqlData, setSqlData]   = useState(null);
  const [showSql, setShowSql]   = useState(false);
  const [error, setError]       = useState(null);

  const EXAMPLES = ['soil microbiome', 'gut bacteria', 'ocean samples', 'Rob Knight', 'UC San Diego', 'antibiotic resistance'];

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSqlData(null);
    try {
      const data = await apiFetch('/search', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
      setResults(data.results || []);
      setSqlData(data.sql_query || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToProject(study, project) {
    try {
      await apiFetch(`/projects/${project.id}/studies`, {
        method: 'POST',
        body: JSON.stringify({
          study_id:       study.study_id,
          study_title:    study.study_title,
          study_abstract: study.study_abstract,
          pi_name:        study.pi_name,
          pi_affiliation: study.pi_affiliation,
          lab_person_name:study.lab_person_name,
        }),
      });
      onStudySaved(project.id, study.study_id);
      showToast(`Saved to "${project.name}"`, 'success');
    } catch (e) {
      if (e.message.includes('already')) {
        showToast('Already saved to that project', 'info');
      } else {
        showToast(e.message, 'error');
      }
    }
  }

  return (
    <div className="content-scroll">
      <div className="search-hero">
        <h1 className="search-hero-title">Microbiome Study Search</h1>
        <p className="search-hero-sub">Search thousands of studies in the Qiita database using natural language</p>
      </div>

      <div className="search-bar">
        <input
          className="search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Describe what you're looking for…"
        />
        <button
          className="btn btn-primary"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
        >
          {loading ? '⏳' : '🔍'} {loading ? 'Searching…' : 'Search'}
        </button>
        {results.length > 0 && (
          <button className="btn btn-ghost" onClick={() => { setResults([]); setQuery(''); setSqlData(null); }}>
            ✕ Clear
          </button>
        )}
      </div>

      <div className="quick-tags">
        {EXAMPLES.map(ex => (
          <span key={ex} className="tag" onClick={() => setQuery(ex)}>{ex}</span>
        ))}
      </div>

      {error && <div className="error-banner" style={{ maxWidth: 680, margin: '0 auto 16px' }}>⚠️ {error}</div>}

      {sqlData && (
        <div className="sql-panel" style={{ maxWidth: 680, margin: '0 auto 20px' }}>
          <button className="sql-panel-toggle" onClick={() => setShowSql(s => !s)}>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10 }}>{showSql ? '▼' : '▶'}</span>
            Generated SQL WHERE clause
          </button>
          {showSql && (
            <div className="sql-panel-body">
              WHERE {sqlData.where_clause}
              {sqlData.params && sqlData.params.length > 0 && (
                <div style={{ marginTop: 8, opacity: 0.6 }}>
                  params: {JSON.stringify(sqlData.params)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="loading-spinner">
          <div className="spinner" />
          Searching Qiita database…
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="results-header" style={{ maxWidth: 680 * 2 + 14 }}>
            <div className="results-count">
              Found <span>{results.length}</span> {results.length === 1 ? 'study' : 'studies'}
            </div>
          </div>
          <div className="studies-grid">
            {results.map(study => {
              const savedInProjects = new Set(
                Object.entries(savedStudyMap)
                  .filter(([, ids]) => ids.has(study.study_id))
                  .map(([pid]) => pid)
              );
              return (
                <StudyCard
                  key={study.study_id}
                  study={study}
                  projects={projects}
                  savedProjectIds={savedInProjects}
                  onSaveToProject={handleSaveToProject}
                />
              );
            })}
          </div>
        </>
      )}

      {!loading && results.length === 0 && query && !error && (
        <div className="empty-state">
          <div className="empty-icon">🔬</div>
          <div className="empty-title">No studies found</div>
          <div className="empty-text">Try different keywords or a broader search term</div>
        </div>
      )}

      {!loading && results.length === 0 && !query && (
        <div className="empty-state">
          <div className="empty-icon">🦠</div>
          <div className="empty-title">Start exploring</div>
          <div className="empty-text">Enter a search query above to find microbiome studies</div>
        </div>
      )}
    </div>
  );
}

// ── Chat View ─────────────────────────────────────────────────────────────
function ChatView({ chat, project, onTitleUpdate, showToast }) {
  const [messages, setMessages] = useState(chat.messages || []);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    setMessages(chat.messages || []);
  }, [chat.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  function autoResize() {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setInput('');
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // optimistic user message
    const userMsg = { role: 'user', content, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const data = await apiFetch(`/chats/${chat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      setMessages(prev => [...prev.slice(0, -1), data.user_message, data.assistant_message]);
      if (data.title) onTitleUpdate(chat.id, data.title);
    } catch (e) {
      showToast('Failed to send message: ' + e.message, 'error');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  const STARTERS = [
    'Summarize the saved studies in this project',
    'What methodologies are used across these studies?',
    'What are the key findings?',
    'Compare the study locations and environments',
  ];

  return (
    <div className="chat-view">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">🧬</div>
            <div className="chat-empty-title">Ask anything about microbiome research</div>
            <div className="chat-empty-hint">
              {project.study_count > 0
                ? `This chat has context from ${project.study_count} saved study${project.study_count > 1 ? 'ies' : ''} in "${project.name}".`
                : `Save studies to "${project.name}" to give the AI research context.`}
            </div>
            {project.study_count > 0 && (
              <div className="chat-starters">
                {STARTERS.map(s => (
                  <button key={s} className="chat-starter-btn" onClick={() => setInput(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="msg-avatar">
                {msg.role === 'user' ? '👤' : '🧬'}
              </div>
              <div>
                <div className="msg-bubble">
                  {msg.content.split('\n').map((line, j) => (
                    line ? <p key={j}>{line}</p> : <br key={j} />
                  ))}
                </div>
                <div className="msg-time">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="message assistant">
            <div className="msg-avatar">🧬</div>
            <div className="msg-bubble">
              <div className="typing-indicator">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        {project.study_count > 0 && (
          <div className="chat-input-context">
            <span>Context:</span>
            <span className="context-badge">
              {project.study_count} saved {project.study_count === 1 ? 'study' : 'studies'}
            </span>
            <span>from "{project.name}"</span>
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={input}
            onChange={e => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKey}
            placeholder="Ask about microbiome research… (Enter to send, Shift+Enter for newline)"
            rows={1}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || sending}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project View ──────────────────────────────────────────────────────────
function ProjectView({ project, onOpenChat, onNewChat, onDeleteProject, onEditProject, showToast, onStudyRemoved }) {
  const [tab, setTab]             = useState('studies');
  const [studies, setStudies]     = useState([]);
  const [chats, setChats]         = useState([]);
  const [loadingStudies, setLS]   = useState(true);
  const [loadingChats, setLC]     = useState(true);

  useEffect(() => {
    fetchStudies();
    fetchChats();
  }, [project.id]);

  async function fetchStudies() {
    setLS(true);
    try {
      const data = await apiFetch(`/projects/${project.id}/studies`);
      setStudies(data.studies || []);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLS(false); }
  }

  async function fetchChats() {
    setLC(true);
    try {
      const data = await apiFetch(`/projects/${project.id}/chats`);
      setChats(data.chats || []);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLC(false); }
  }

  async function removeStudy(studyId) {
    try {
      await apiFetch(`/projects/${project.id}/studies/${studyId}`, { method: 'DELETE' });
      setStudies(prev => prev.filter(s => s.study_id !== studyId));
      onStudyRemoved(project.id, studyId);
      showToast('Study removed', 'info');
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function deleteChat(chatId) {
    try {
      await apiFetch(`/chats/${chatId}`, { method: 'DELETE' });
      setChats(prev => prev.filter(c => c.id !== chatId));
      showToast('Chat deleted', 'info');
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function handleNewChat() {
    try {
      const data = await apiFetch(`/projects/${project.id}/chats`, {
        method: 'POST',
        body: JSON.stringify({ title: 'New Chat' }),
      });
      onNewChat(data.chat);
    } catch (e) { showToast(e.message, 'error'); }
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
  }

  return (
    <div className="content-scroll">
      {/* header */}
      <div className="project-header">
        <div className="project-color-bar" style={{ background: project.color }} />
        <div className="project-meta" style={{ flex: 1 }}>
          <h2>{project.name}</h2>
          {project.description && <p className="project-desc">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onEditProject}>✏️ Edit</button>
          <button className="btn btn-danger btn-sm" onClick={onDeleteProject}>🗑 Delete</button>
        </div>
      </div>

      {/* stats */}
      <div className="project-stats">
        <div className="stat-chip">
          <div className="stat-value">{project.study_count}</div>
          <div className="stat-label">SAVED STUDIES</div>
        </div>
        <div className="stat-chip">
          <div className="stat-value">{project.chat_count}</div>
          <div className="stat-label">CHATS</div>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-2 mb-4">
        <div className="topbar-tabs">
          <button className={`tab-btn ${tab === 'studies' ? 'active' : ''}`} onClick={() => setTab('studies')}>
            🧫 Studies ({studies.length})
          </button>
          <button className={`tab-btn ${tab === 'chats' ? 'active' : ''}`} onClick={() => setTab('chats')}>
            💬 Chats ({chats.length})
          </button>
        </div>
        {tab === 'chats' && (
          <button className="btn btn-primary btn-sm" onClick={handleNewChat}>
            + New Chat
          </button>
        )}
      </div>

      {/* studies tab */}
      {tab === 'studies' && (
        <>
          {loadingStudies ? (
            <div className="loading-spinner"><div className="spinner" /> Loading studies…</div>
          ) : studies.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔬</div>
              <div className="empty-title">No saved studies</div>
              <div className="empty-text">Search for studies and click "+ Save" to add them to this project.</div>
            </div>
          ) : (
            studies.map(s => (
              <div key={s.study_id} className="saved-study-card">
                <div className="saved-study-info">
                  <div className="flex items-center gap-2 mb-4" style={{ marginBottom: 4 }}>
                    <span className="study-id-badge">ID {s.study_id}</span>
                  </div>
                  <div className="saved-study-title">{s.study_title}</div>
                  {s.pi_name && (
                    <div className="saved-study-pi">👤 {s.pi_name}{s.pi_affiliation ? ` · ${s.pi_affiliation}` : ''}</div>
                  )}
                  {s.study_abstract && (
                    <div className="saved-study-abstract">{s.study_abstract}</div>
                  )}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flexShrink: 0, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                  onClick={() => removeStudy(s.study_id)}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </>
      )}

      {/* chats tab */}
      {tab === 'chats' && (
        <>
          {loadingChats ? (
            <div className="loading-spinner"><div className="spinner" /> Loading chats…</div>
          ) : chats.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <div className="empty-title">No chats yet</div>
              <div className="empty-text">Start a new chat to discuss your saved studies with the AI assistant.</div>
              <button className="btn btn-primary mt-4" onClick={handleNewChat}>Start a Chat</button>
            </div>
          ) : (
            <div className="chat-cards">
              {chats.map(chat => (
                <div key={chat.id} className="chat-card" onClick={() => onOpenChat(chat)}>
                  <div className="chat-card-title">{chat.title}</div>
                  <div className="chat-card-meta">
                    <span className="chat-card-date">{formatDate(chat.updated_at)}</span>
                    <span className="chat-card-msgs">{chat.message_count} messages</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}
                      style={{ fontSize: 11 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────
function App() {
  const [projects, setProjects]         = useState([]);
  const [currentView, setCurrentView]   = useState('search'); // 'search' | 'project' | 'chat'
  const [activeProject, setActiveProject] = useState(null);
  const [activeChat, setActiveChat]       = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject]     = useState(null);
  const [savedStudyMap, setSavedStudyMap] = useState({}); // { projectId: Set<study_id> }
  const { toasts, show: showToast } = useToast();

  // Load projects on mount
  useEffect(() => { fetchProjects(); }, []);

  async function fetchProjects() {
    try {
      const data = await apiFetch('/projects');
      const ps = data.projects || [];
      setProjects(ps);
      // pre-load saved study IDs for each project
      ps.forEach(p => { if (p.study_count > 0) fetchSavedStudyIds(p.id); });
    } catch (e) {
      showToast('Failed to load projects: ' + e.message, 'error');
    }
  }

  async function fetchSavedStudyIds(projectId) {
    try {
      const data = await apiFetch(`/projects/${projectId}/studies`);
      const ids = new Set((data.studies || []).map(s => s.study_id));
      setSavedStudyMap(prev => ({ ...prev, [projectId]: ids }));
    } catch { /* silent */ }
  }

  // ── project handlers ──────────────────────────────────────────────────

  async function handleCreateProject(fields) {
    const data = await apiFetch('/projects', {
      method: 'POST',
      body: JSON.stringify(fields),
    });
    const newProject = data.project;
    setProjects(prev => [newProject, ...prev]);
    setShowProjectModal(false);
    showToast(`Project "${newProject.name}" created`, 'success');
  }

  async function handleUpdateProject(fields) {
    const data = await apiFetch(`/projects/${editingProject.id}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
    const updated = data.project;
    setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
    if (activeProject?.id === updated.id) setActiveProject(prev => ({ ...prev, ...updated }));
    setEditingProject(null);
    showToast('Project updated', 'success');
  }

  async function handleDeleteProject() {
    if (!activeProject) return;
    if (!confirm(`Delete "${activeProject.name}"? This will also delete all saved studies and chats.`)) return;
    try {
      await apiFetch(`/projects/${activeProject.id}`, { method: 'DELETE' });
      setProjects(prev => prev.filter(p => p.id !== activeProject.id));
      setActiveProject(null);
      setActiveChat(null);
      setCurrentView('search');
      showToast('Project deleted', 'info');
    } catch (e) { showToast(e.message, 'error'); }
  }

  function handleProjectClick(project) {
    // fetch chats to show in sidebar
    fetchProjectChats(project);
    setActiveProject(project);
    setActiveChat(null);
    setCurrentView('project');
  }

  async function fetchProjectChats(project) {
    try {
      const data = await apiFetch(`/projects/${project.id}/chats`);
      const chats = data.chats || [];
      setProjects(prev => prev.map(p =>
        p.id === project.id ? { ...p, chats } : p
      ));
    } catch { /* silent */ }
  }

  function handleOpenChat(chat) {
    // fetch full chat with messages
    apiFetch(`/chats/${chat.id}`).then(data => {
      setActiveChat(data.chat);
      setCurrentView('chat');
    }).catch(e => showToast(e.message, 'error'));
  }

  function handleNewChat(chat) {
    setActiveChat(chat);
    setCurrentView('chat');
    // refresh sidebar chats
    if (activeProject) fetchProjectChats(activeProject);
  }

  async function handleNewChatFromSidebar(project) {
    try {
      const data = await apiFetch(`/projects/${project.id}/chats`, {
        method: 'POST',
        body: JSON.stringify({ title: 'New Chat' }),
      });
      setActiveProject(project);
      setActiveChat(data.chat);
      setCurrentView('chat');
      fetchProjectChats(project);
    } catch (e) { showToast(e.message, 'error'); }
  }

  function handleChatTitleUpdate(chatId, title) {
    if (activeChat?.id === chatId) setActiveChat(prev => ({ ...prev, title }));
    if (activeProject) fetchProjectChats(activeProject);
  }

  // ── study save/remove handlers ────────────────────────────────────────

  function handleStudySaved(projectId, studyId) {
    setSavedStudyMap(prev => {
      const ids = new Set(prev[projectId] || []);
      ids.add(studyId);
      return { ...prev, [projectId]: ids };
    });
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, study_count: (p.study_count || 0) + 1 } : p
    ));
    if (activeProject?.id === projectId) {
      setActiveProject(prev => ({ ...prev, study_count: (prev.study_count || 0) + 1 }));
    }
  }

  function handleStudyRemoved(projectId, studyId) {
    setSavedStudyMap(prev => {
      const ids = new Set(prev[projectId] || []);
      ids.delete(studyId);
      return { ...prev, [projectId]: ids };
    });
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, study_count: Math.max(0, (p.study_count || 1) - 1) } : p
    ));
    if (activeProject?.id === projectId) {
      setActiveProject(prev => ({ ...prev, study_count: Math.max(0, (prev.study_count || 1) - 1) }));
    }
  }

  // ── topbar content based on view ──────────────────────────────────────
  function TopBar() {
    if (currentView === 'search') {
      return (
        <div className="topbar">
          <span className="topbar-title">Study Search</span>
        </div>
      );
    }
    if (currentView === 'project' && activeProject) {
      return (
        <div className="topbar">
          <div className="flex items-center gap-2">
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: activeProject.color, flexShrink: 0 }} />
            <span className="topbar-title">{activeProject.name}</span>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-primary btn-sm" onClick={async () => {
              try {
                const data = await apiFetch(`/projects/${activeProject.id}/chats`, {
                  method: 'POST',
                  body: JSON.stringify({ title: 'New Chat' }),
                });
                handleNewChat(data.chat);
              } catch (e) { showToast(e.message, 'error'); }
            }}>
              + New Chat
            </button>
          </div>
        </div>
      );
    }
    if (currentView === 'chat' && activeChat) {
      return (
        <div className="topbar">
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => { setCurrentView('project'); setActiveChat(null); }}
            >
              ←
            </button>
            <span className="topbar-title">{activeChat.title}</span>
          </div>
          {activeProject && (
            <div className="flex items-center gap-2">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeProject.color }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeProject.name}</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        activeProjectId={activeProject?.id}
        activeChatId={activeChat?.id}
        currentView={currentView}
        onSearchClick={() => { setCurrentView('search'); setActiveProject(null); setActiveChat(null); }}
        onProjectClick={handleProjectClick}
        onChatClick={(project, chat) => {
          setActiveProject(project);
          handleOpenChat(chat);
        }}
        onNewChat={handleNewChatFromSidebar}
        onNewProject={() => setShowProjectModal(true)}
      />

      <div className="main">
        <TopBar />

        {currentView === 'search' && (
          <SearchView
            projects={projects}
            savedStudyMap={savedStudyMap}
            onStudySaved={handleStudySaved}
            showToast={showToast}
          />
        )}

        {currentView === 'project' && activeProject && (
          <ProjectView
            project={activeProject}
            onOpenChat={handleOpenChat}
            onNewChat={handleNewChat}
            onDeleteProject={handleDeleteProject}
            onEditProject={() => setEditingProject(activeProject)}
            onStudyRemoved={handleStudyRemoved}
            showToast={showToast}
          />
        )}

        {currentView === 'chat' && activeChat && activeProject && (
          <ChatView
            chat={activeChat}
            project={activeProject}
            onTitleUpdate={handleChatTitleUpdate}
            showToast={showToast}
          />
        )}
      </div>

      {/* Modals */}
      {showProjectModal && (
        <ProjectModal
          onClose={() => setShowProjectModal(false)}
          onSave={handleCreateProject}
        />
      )}

      {editingProject && (
        <ProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={handleUpdateProject}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));