const { useState, useEffect } = React;

const API_BASE = 'http://localhost:5001/api';

function App() {
    const [userId] = useState(() => localStorage.getItem('qiita_user_id') || 'default');
    const [query, setQuery] = useState('');
    const [studies, setStudies] = useState([]);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState(null);
    const [showSql, setShowSql] = useState(false);
    const [sqlQuery, setSqlQuery] = useState(null);

    const [projects, setProjects] = useState([]);
    const [currentProjectId, setCurrentProjectId] = useState(() => localStorage.getItem('qiita_current_project') || '');
    const [project, setProject] = useState(null);
    const [chats, setChats] = useState([]);
    const [currentChatId, setCurrentChatId] = useState('');
    const [chat, setChat] = useState(null);
    const [view, setView] = useState('search');
    const [newProjectName, setNewProjectName] = useState('');
    const [chatInput, setChatInput] = useState('');
    const [sending, setSending] = useState(false);
    const [addingStudy, setAddingStudy] = useState(false);

    useEffect(() => {
        localStorage.setItem('qiita_user_id', userId);
    }, [userId]);
    useEffect(() => {
        localStorage.setItem('qiita_current_project', currentProjectId);
    }, [currentProjectId]);

    const fetchProjects = async () => {
        try {
            const res = await fetch(`${API_BASE}/projects?user_id=${encodeURIComponent(userId)}`);
            if (res.ok) {
                const data = await res.json();
                setProjects(data.projects || []);

                // #region agent log
                fetch('http://127.0.0.1:7600/ingest/345313a2-0d5e-44b5-8f03-78ae59308edb', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Debug-Session-Id': '576eb6',
                    },
                    body: JSON.stringify({
                        sessionId: '576eb6',
                        runId: 'pre-fix',
                        hypothesisId: 'H4',
                        location: 'Experiment/frontend/app.js:fetchProjects',
                        message: 'projects_loaded',
                        data: { count: (data.projects || []).length },
                        timestamp: Date.now(),
                    }),
                }).catch(() => {});
                // #endregion
            }
        } catch (_) {}
    };
    useEffect(() => {
        fetchProjects();
    }, [userId]);

    const fetchProject = async () => {
        if (!currentProjectId) {
            setProject(null);
            setChats([]);
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProjectId}?user_id=${encodeURIComponent(userId)}`);
            if (res.ok) {
                const data = await res.json();
                setProject(data);
            }
        } catch (_) {
            setProject(null);
        }
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProjectId}/chats?user_id=${encodeURIComponent(userId)}`);
            if (res.ok) {
                const data = await res.json();
                setChats(data.chats || []);
            }
        } catch (_) {
            setChats([]);
        }
    };
    useEffect(() => {
        fetchProject();
    }, [currentProjectId, userId]);

    const fetchChat = async () => {
        if (!currentProjectId || !currentChatId) {
            setChat(null);
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProjectId}/chats/${currentChatId}?user_id=${encodeURIComponent(userId)}`);
            if (res.ok) setChat(await res.json());
            else setChat(null);
        } catch (_) {
            setChat(null);
        }
    };
    useEffect(() => {
        fetchChat();
    }, [currentProjectId, currentChatId, userId]);

    const createProject = async () => {
        const name = newProjectName.trim() || 'Untitled';
        try {
            const res = await fetch(`${API_BASE}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, name })
            });
            if (res.ok) {
                const proj = await res.json();
                setProjects(prev => [...prev, { project_id: proj.project_id, name: proj.name, studies_count: 0, chats_count: 0 }]);
                setCurrentProjectId(proj.project_id);
                setNewProjectName('');
            }
        } catch (_) {}
    };

    const deleteProject = async (projectId) => {
        try {
            await fetch(`${API_BASE}/projects/${projectId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            if (currentProjectId === projectId) {
                setCurrentProjectId('');
                setView('search');
            }
            fetchProjects();
        } catch (_) {}
    };

    const addStudyToProject = async (study) => {
        if (!currentProjectId) return;
        setAddingStudy(true);
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProjectId}/studies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, study })
            });
            if (res.ok) fetchProject();
        } catch (_) {}
        setAddingStudy(false);
    };

    const removeStudyFromProject = async (studyId) => {
        if (!currentProjectId) return;
        try {
            await fetch(`${API_BASE}/projects/${currentProjectId}/studies/${studyId}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' });
            fetchProject();
        } catch (_) {}
    };

    const startNewChat = async () => {
        if (!currentProjectId) return;
        setSending(true);
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProjectId}/chats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            if (res.ok) {
                const newChat = await res.json();
                setChats(prev => [...prev, { chat_id: newChat.chat_id, title: newChat.title || 'New chat', messages_count: 0 }]);
                setCurrentChatId(newChat.chat_id);
                setView('chat');
                setChat(newChat);
            }
        } catch (_) {}
        setSending(false);
    };

    const openChat = (chatId) => {
        setCurrentChatId(chatId);
        setView('chat');
    };

    const sendMessage = async (text) => {
        const msg = (text || chatInput).trim();
        if (!msg || !currentProjectId) return;
        if (!currentChatId) {
            setSending(true);
            try {
                const res = await fetch(`${API_BASE}/projects/${currentProjectId}/chats`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, message: msg })
                });
                if (res.ok) {
                    const newChat = await res.json();
                    setChats(prev => [...prev, { chat_id: newChat.chat_id, title: newChat.title, messages_count: newChat.messages?.length || 0 }]);
                    setCurrentChatId(newChat.chat_id);
                    setView('chat');
                    setChat(newChat);
                    setChatInput('');
                }
            } catch (_) {}
            setSending(false);
            return;
        }
        setSending(true);
        setChatInput('');
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProjectId}/chats/${currentChatId}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, message: msg })
            });
            if (res.ok) setChat(await res.json());
        } catch (_) {}
        setSending(false);
    };

    const deleteChat = async (chatId) => {
        try {
            await fetch(`${API_BASE}/projects/${currentProjectId}/chats/${chatId}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' });
            if (currentChatId === chatId) {
                setCurrentChatId('');
                setView('search');
            }
            fetchProject();
        } catch (_) {}
    };

    const exampleQueries = ['soil microbiome', 'gut bacteria', 'ocean samples', 'Rob Knight', 'UC San Diego'];

    const handleSearch = async () => {
        if (!query.trim()) return;
        setSearching(true);
        setError(null);
        setSqlQuery(null);
        try {
            const response = await fetch(`${API_BASE}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            setStudies(data.results);
            setSqlQuery(data.sql_query);

            // #region agent log
            fetch('http://127.0.0.1:7600/ingest/345313a2-0d5e-44b5-8f03-78ae59308edb', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Session-Id': '576eb6',
                },
                body: JSON.stringify({
                    sessionId: '576eb6',
                    runId: 'pre-fix',
                    hypothesisId: 'H1',
                    location: 'Experiment/frontend/app.js:handleSearch',
                    message: 'search_response',
                    data: {
                        query,
                        count: Array.isArray(data.results) ? data.results.length : null,
                    },
                    timestamp: Date.now(),
                }),
            }).catch(() => {});
            // #endregion
        } catch (err) {
            setError(err.message);
            // #region agent log
            fetch('http://127.0.0.1:7600/ingest/345313a2-0d5e-44b5-8f03-78ae59308edb', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Session-Id': '576eb6',
                },
                body: JSON.stringify({
                    sessionId: '576eb6',
                    runId: 'pre-fix',
                    hypothesisId: 'H2',
                    location: 'Experiment/frontend/app.js:handleSearch',
                    message: 'search_error',
                    data: { query, error: String(err && err.message ? err.message : err) },
                    timestamp: Date.now(),
                }),
            }).catch(() => {});
            // #endregion
        } finally {
            setSearching(false);
        }
    };

    const clearResults = () => {
        setStudies([]);
        setQuery('');
        setSqlQuery(null);
    };

    const studyIdsInProject = (project?.studies || []).map(s => s.study_id);

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar-section">
                    <h3 className="sidebar-title">Projects</h3>
                    <div className="sidebar-new">
                        <input
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createProject()}
                            placeholder="New project name"
                        />
                        <button type="button" className="btn btn-small" onClick={createProject}>+ New</button>
                    </div>
                    <ul className="sidebar-list">
                        {projects.map((p) => (
                            <li key={p.project_id} className={currentProjectId === p.project_id ? 'active' : ''}>
                                <button type="button" onClick={() => { setCurrentProjectId(p.project_id); setView('search'); }}>
                                    <span className="list-label">{p.name}</span>
                                    <span className="list-meta">{p.studies_count || 0} studies · {p.chats_count || 0} chats</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
                {currentProjectId && project && (
                    <>
                        <div className="sidebar-section">
                            <h3 className="sidebar-title">Saved studies</h3>
                            {(project.studies || []).length === 0 ? (
                                <p className="sidebar-empty">None yet. Add from search.</p>
                            ) : (
                                <ul className="sidebar-list compact">
                                    {(project.studies || []).slice(0, 5).map((s) => (
                                        <li key={s.study_id}>
                                            <span className="list-label">ID {s.study_id}</span>
                                            <button type="button" className="list-remove" onClick={() => removeStudyFromProject(s.study_id)} title="Remove">×</button>
                                        </li>
                                    ))}
                                    {(project.studies || []).length > 5 && <li className="list-more">+{(project.studies || []).length - 5} more</li>}
                                </ul>
                            )}
                        </div>
                        <div className="sidebar-section">
                            <h3 className="sidebar-title">Chats</h3>
                            <button type="button" className="btn btn-small full" onClick={startNewChat} disabled={sending}>
                                + New chat
                            </button>
                            <ul className="sidebar-list">
                                {(chats || []).map((c) => (
                                    <li key={c.chat_id} className={currentChatId === c.chat_id ? 'active' : ''}>
                                        <button type="button" onClick={() => openChat(c.chat_id)}>
                                            <span className="list-label">{c.title || 'New chat'}</span>
                                        </button>
                                        <button type="button" className="list-remove" onClick={(e) => { e.stopPropagation(); deleteChat(c.chat_id); }} title="Delete chat">×</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </>
                )}
            </aside>

            <main className="main">
                <div className="header">
                    <div className="header-content">
                        <h1>Qiita Study Explorer</h1>
                        <p className="subtitle">Discover and analyze microbiome research {currentProjectId && project && ` · Project: ${project.name}`}</p>
                    </div>
                </div>

                {view === 'chat' && currentChatId ? (
                    <div className="main-content">
                        <div className="chat-view">
                            <div className="chat-header">
                                <button type="button" className="btn btn-secondary btn-small" onClick={() => { setView('search'); setCurrentChatId(''); }}>← Back to search</button>
                            </div>
                            <div className="chat-messages">
                                {(chat?.messages || []).map((m, i) => (
                                    <div key={i} className={`chat-msg ${m.role}`}>
                                        <span className="chat-role">{m.role === 'user' ? 'You' : 'Assistant'}</span>
                                        <div className="chat-content">{m.content}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="chat-input-wrap">
                                <textarea
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                                    placeholder="Message the assistant..."
                                    rows={2}
                                    disabled={sending}
                                />
                                <button type="button" className="btn" onClick={() => sendMessage()} disabled={sending || !chatInput.trim()}>
                                    {sending ? 'Sending...' : 'Send'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="search-section">
                            <div className="search-box">
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                    placeholder="Search studies by keywords, author, or topic..."
                                />
                                <button className="btn" onClick={handleSearch} disabled={searching || !query.trim()}>
                                    {searching ? '⏳ Searching...' : '🔍 Search'}
                                </button>
                                {studies.length > 0 && (
                                    <button className="btn btn-secondary" onClick={clearResults}>✕ Clear</button>
                                )}
                            </div>
                            <div className="examples">
                                <span className="example-label">Quick search:</span>
                                {exampleQueries.map((example, idx) => (
                                    <span key={idx} className="example-tag" onClick={() => setQuery(example)}>{example}</span>
                                ))}
                            </div>
                        </div>

                        <div className="main-content">
                            {sqlQuery && (
                                <label className="toggle-sql">
                                    <input type="checkbox" checked={showSql} onChange={(e) => setShowSql(e.target.checked)} />
                                    Show generated SQL query
                                </label>
                            )}

                            {showSql && sqlQuery && (
                                <div className="sql-query">
                                    <span className="sql-label">Generated SQL Query</span>
                                    <div>WHERE {sqlQuery.where_clause}</div>
                                    {sqlQuery.params?.length > 0 && (
                                        <div style={{ marginTop: '1rem', opacity: 0.7 }}>Parameters: {JSON.stringify(sqlQuery.params)}</div>
                                    )}
                                </div>
                            )}

                            {error && (
                                <div className="error">
                                    <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                                    <div><strong>Error:</strong> {error}</div>
                                </div>
                            )}

                            {searching && (
                                <div className="loading">
                                    <div className="spinner"></div>
                                    <p>Searching through Qiita studies...</p>
                                </div>
                            )}

                            {!searching && studies.length > 0 && (
                                <>
                                    <div className="stats-bar">
                                        <div>
                                            <div className="stats-count">{studies.length}</div>
                                            <div className="stats-label">Studies found</div>
                                        </div>
                                    </div>
                                    <div className="studies-grid">
                                        {studies.map((study, idx) => (
                                            <div key={idx} className="study-card">
                                                <div className="card-header">
                                                    <span className="study-id-badge">ID {study.study_id}</span>
                                                    {currentProjectId && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-small add-to-project"
                                                            onClick={() => addStudyToProject(study)}
                                                            disabled={addingStudy || studyIdsInProject.includes(study.study_id)}
                                                            title={studyIdsInProject.includes(study.study_id) ? 'In project' : 'Add to project'}
                                                        >
                                                            {studyIdsInProject.includes(study.study_id) ? '✓ Saved' : '+ Project'}
                                                        </button>
                                                    )}
                                                </div>
                                                <h3 className="study-title">{study.study_title}</h3>
                                                <p className="study-abstract">{study.study_abstract || 'No abstract available.'}</p>
                                                <div className="card-meta">
                                                    {study.pi_name && (
                                                        <div className="meta-item">
                                                            <span className="meta-icon">👤</span>
                                                            <span><span className="meta-label">PI:</span> {study.pi_name}</span>
                                                        </div>
                                                    )}
                                                    {study.pi_affiliation && (
                                                        <div className="meta-item">
                                                            <span className="meta-icon">🏛️</span>
                                                            <span>{study.pi_affiliation}</span>
                                                        </div>
                                                    )}
                                                    {study.lab_person_name && (
                                                        <div className="meta-item">
                                                            <span className="meta-icon">👥</span>
                                                            <span>Lab: {study.lab_person_name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {!searching && studies.length === 0 && query && (
                                <div className="empty-state">
                                    <div className="empty-icon">🔬</div>
                                    <h3 className="empty-title">No studies found</h3>
                                    <p className="empty-text">Try different keywords or refine your search</p>
                                </div>
                            )}

                            {!searching && studies.length === 0 && !query && (
                                <div className="empty-state">
                                    <div className="empty-icon">🔍</div>
                                    <h3 className="empty-title">Start Searching</h3>
                                    <p className="empty-text">Enter keywords to search through the Qiita microbiome database. Select a project to save studies and chat.</p>
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className="footer">
                    Powered by <a href="https://github.com/qiita-spots/qiita" target="_blank" rel="noopener noreferrer">Qiita</a> microbiome database
                </div>
            </main>
        </div>
    );
}

ReactDOM.render(<App />, document.getElementById('root'));
