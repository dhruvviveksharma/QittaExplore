const { useEffect, useMemo, useRef, useState } = React;

const API_BASE = 'http://localhost:5001/api';
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 520;
const FIRST_STUDIES_LIMIT = 20;

function App() {
    const [userId] = useState('default');

    const [view, setView] = useState('global');
    const [globalPanelMode, setGlobalPanelMode] = useState('search');

    const [query, setQuery] = useState('');
    const [studies, setStudies] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState(null);
    const [showSql, setShowSql] = useState(false);
    const [sqlQuery, setSqlQuery] = useState(null);

    const [firstStudies, setFirstStudies] = useState([]);
    const [firstStudiesLoading, setFirstStudiesLoading] = useState(false);
    const [firstStudiesError, setFirstStudiesError] = useState(null);
    const [firstStudyProjectTargets, setFirstStudyProjectTargets] = useState({});
    const [firstStudyAddStatus, setFirstStudyAddStatus] = useState({});

    const [projects, setProjects] = useState([]);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [currentProjectId, setCurrentProjectId] = useState(() => localStorage.getItem('qiita_current_project') || '');
    const [project, setProject] = useState(null);

    const [projectChats, setProjectChats] = useState([]);
    const [currentProjectChatId, setCurrentProjectChatId] = useState('');
    const [projectChat, setProjectChat] = useState(null);

    const [globalChats, setGlobalChats] = useState([]);
    const [currentGlobalChatId, setCurrentGlobalChatId] = useState('');
    const [globalChat, setGlobalChat] = useState(null);

    const [newProjectName, setNewProjectName] = useState('');
    const [showNewProjectForm, setShowNewProjectForm] = useState(false);

    const [selectedGlobalStudies, setSelectedGlobalStudies] = useState([]);

    const [chatInput, setChatInput] = useState('');
    const [sending, setSending] = useState(false);
    const [composerError, setComposerError] = useState(null);

    const [addingStudy, setAddingStudy] = useState(false);
    const [selectedStudy, setSelectedStudy] = useState(null);

    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const stored = parseInt(localStorage.getItem('qiita_sidebar_width') || '300', 10);
        if (Number.isNaN(stored)) return 300;
        return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, stored));
    });
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);

    const abortControllerRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        localStorage.setItem('qiita_user_id', userId);
    }, [userId]);

    useEffect(() => {
        localStorage.setItem('qiita_current_project', currentProjectId);
    }, [currentProjectId]);

    useEffect(() => {
        localStorage.setItem('qiita_sidebar_width', String(sidebarWidth));
    }, [sidebarWidth]);

    useEffect(() => {
        const onPointerMove = (e) => {
            if (!isResizingSidebar) return;
            const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX));
            setSidebarWidth(next);
        };
        const onPointerUp = () => setIsResizingSidebar(false);

        if (isResizingSidebar) document.body.classList.add('resizing-sidebar');
        else document.body.classList.remove('resizing-sidebar');

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        return () => {
            document.body.classList.remove('resizing-sidebar');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }, [isResizingSidebar]);

    useEffect(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = '0px';
        textareaRef.current.style.height = `${Math.min(220, textareaRef.current.scrollHeight)}px`;
    }, [chatInput]);

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, []);

    const projectSummaryFromProject = (proj) => {
        if (!proj || !proj.project_id) return null;
        return {
            project_id: proj.project_id,
            name: proj.name || 'Untitled',
            studies_count: (proj.studies || []).length,
            chats_count: (proj.chats || []).length,
        };
    };

    const fetchProjects = async () => {
        setProjectsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/projects?user_id=${encodeURIComponent(userId)}`);
            if (!res.ok) throw new Error('Failed to load projects');
            const data = await res.json();
            let fetched = data.projects || [];

            if (fetched.length === 0 && currentProjectId) {
                try {
                    const fallbackRes = await fetch(`${API_BASE}/projects/${currentProjectId}?user_id=${encodeURIComponent(userId)}`);
                    if (fallbackRes.ok) {
                        const fallbackProject = await fallbackRes.json();
                        const summary = projectSummaryFromProject(fallbackProject);
                        if (summary) fetched = [summary];
                    }
                } catch (_) {}
            }

            setProjects(fetched);
            if (!currentProjectId && fetched.length > 0) {
                setCurrentProjectId(fetched[0].project_id);
            }
        } catch (_) {
            setProjects((prev) => prev);
        } finally {
            setProjectsLoading(false);
        }
    };

    const fetchProject = async () => {
        if (!currentProjectId) {
            setProject(null);
            setProjectChats([]);
            setProjectChat(null);
            return;
        }

        try {
            const projRes = await fetch(`${API_BASE}/projects/${currentProjectId}?user_id=${encodeURIComponent(userId)}`);
            if (projRes.ok) setProject(await projRes.json());
            else setProject(null);
        } catch (_) {
            setProject(null);
        }

        try {
            const chatsRes = await fetch(`${API_BASE}/projects/${currentProjectId}/chats?user_id=${encodeURIComponent(userId)}`);
            if (chatsRes.ok) {
                const data = await chatsRes.json();
                setProjectChats(data.chats || []);
            } else {
                setProjectChats([]);
            }
        } catch (_) {
            setProjectChats([]);
        }
    };

    const fetchProjectChat = async () => {
        if (!currentProjectId || !currentProjectChatId) {
            setProjectChat(null);
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProjectId}/chats/${currentProjectChatId}?user_id=${encodeURIComponent(userId)}`);
            if (res.ok) setProjectChat(await res.json());
            else setProjectChat(null);
        } catch (_) {
            setProjectChat(null);
        }
    };

    const fetchGlobalChats = async () => {
        try {
            const res = await fetch(`${API_BASE}/global-chats?user_id=${encodeURIComponent(userId)}`);
            if (!res.ok) return;
            const data = await res.json();
            setGlobalChats(data.chats || []);
        } catch (_) {}
    };

    const fetchGlobalChat = async () => {
        if (!currentGlobalChatId) {
            setGlobalChat(null);
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/global-chats/${currentGlobalChatId}?user_id=${encodeURIComponent(userId)}`);
            if (res.ok) setGlobalChat(await res.json());
            else setGlobalChat(null);
        } catch (_) {
            setGlobalChat(null);
        }
    };

    const fetchFirstStudies = async () => {
        setFirstStudiesLoading(true);
        setFirstStudiesError(null);
        try {
            const res = await fetch(`${API_BASE}/studies/first?limit=${FIRST_STUDIES_LIMIT}`);
            if (!res.ok) throw new Error('Could not load first studies');
            const data = await res.json();
            setFirstStudies(data.results || []);
        } catch (err) {
            setFirstStudies([]);
            setFirstStudiesError(err.message || 'Could not load first studies');
        } finally {
            setFirstStudiesLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
        fetchGlobalChats();
        fetchFirstStudies();
    }, [userId]);

    useEffect(() => {
        fetchProject();
    }, [currentProjectId, userId]);

    useEffect(() => {
        // When switching projects, clear the active chat selection so we
        // don't reuse a chat id that belongs to a different project.
        setCurrentProjectChatId('');
        setProjectChat(null);
    }, [currentProjectId]);

    useEffect(() => {
        // Frontend safety net: if current project is loaded but list is empty,
        // keep it visible in the Projects section.
        if (!project || !project.project_id) return;
        setProjects((prev) => {
            if (prev.some((p) => p.project_id === project.project_id)) return prev;
            return [{
                project_id: project.project_id,
                name: project.name || 'Untitled',
                studies_count: (project.studies || []).length,
                chats_count: (project.chats || []).length,
            }, ...prev];
        });
    }, [project]);

    useEffect(() => {
        fetchProjectChat();
    }, [currentProjectId, currentProjectChatId, userId]);

    useEffect(() => {
        fetchGlobalChat();
    }, [currentGlobalChatId, userId]);

    useEffect(() => {
        if (!firstStudies.length || !projects.length) return;
        setFirstStudyProjectTargets((prev) => {
            const next = { ...prev };
            const defaultProjectId = currentProjectId || projects[0]?.project_id || '';
            firstStudies.forEach((s) => {
                if (!next[s.study_id]) next[s.study_id] = defaultProjectId;
            });
            return next;
        });
    }, [firstStudies, projects, currentProjectId]);

    const studyIdsInProject = useMemo(
        () => (project?.studies || []).map((s) => s.study_id),
        [project]
    );

    const patchProjectSummary = (projectId, patch = {}) => {
        setProjects((prev) => prev.map((p) => (
            p.project_id === projectId ? { ...p, ...patch } : p
        )));
    };

    const applyProjectSnapshot = (nextProject) => {
        if (!nextProject || !nextProject.project_id) return;
        if (nextProject.project_id === currentProjectId) {
            setProject(nextProject);
            setProjectChats((nextProject.chats || []).map((c) => ({
                chat_id: c.chat_id,
                title: c.title,
                created_at: c.created_at,
                updated_at: c.updated_at,
                messages_count: (c.messages || []).length,
            })));
        }
        patchProjectSummary(nextProject.project_id, {
            studies_count: (nextProject.studies || []).length,
            chats_count: (nextProject.chats || []).length,
            name: nextProject.name || 'Untitled',
        });
    };

    const handleSearch = async () => {
        if (!query.trim()) return;
        setSearching(true);
        setError(null);
        setSqlQuery(null);
        try {
            const response = await fetch(`${API_BASE}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            setStudies(data.results || []);
            setSqlQuery(data.sql_query || null);
            setHasSearched(true);
        } catch (err) {
            setError(err.message || 'Search failed');
            setHasSearched(true);
            setStudies([]);
        } finally {
            setSearching(false);
        }
    };

    const clearResults = () => {
        setStudies([]);
        setQuery('');
        setSqlQuery(null);
        setHasSearched(false);
        setError(null);
    };

    const createProject = async () => {
        const name = newProjectName.trim() || 'Untitled';
        try {
            const res = await fetch(`${API_BASE}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, name }),
            });
            if (!res.ok) return;
            const proj = await res.json();
            setNewProjectName('');
            setShowNewProjectForm(false);
            await fetchProjects();
            setCurrentProjectId(proj.project_id);
            setView('project-chat');
        } catch (_) {}
    };

    const deleteProject = async (projectId) => {
        try {
            await fetch(`${API_BASE}/projects/${projectId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId }),
            });

            if (currentProjectId === projectId) {
                setCurrentProjectId('');
                setCurrentProjectChatId('');
                setProjectChat(null);
            }
            await fetchProjects();
        } catch (_) {}
    };

    const addStudyToProject = async (study, evt) => {
        if (evt) {
            evt.preventDefault();
            evt.stopPropagation();
        }
        if (!currentProjectId) return;
        setAddingStudy(true);
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProjectId}/studies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, study }),
            });
            if (res.ok) {
                const updatedProject = await res.json();
                applyProjectSnapshot(updatedProject);
            }
        } catch (_) {}
        setAddingStudy(false);
    };

    const addStudyToSpecificProject = async (study, projectId, evt) => {
        if (evt) {
            evt.preventDefault();
            evt.stopPropagation();
        }
        const pid = (projectId || '').trim();
        if (!pid) return;
        setFirstStudyAddStatus((prev) => ({ ...prev, [study.study_id]: 'adding' }));
        try {
            const res = await fetch(`${API_BASE}/projects/${pid}/studies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, study }),
            });
            if (res.ok) {
                const updatedProject = await res.json();
                setFirstStudyAddStatus((prev) => ({ ...prev, [study.study_id]: 'added' }));
                applyProjectSnapshot(updatedProject);
            } else {
                setFirstStudyAddStatus((prev) => ({ ...prev, [study.study_id]: 'error' }));
            }
        } catch (_) {
            setFirstStudyAddStatus((prev) => ({ ...prev, [study.study_id]: 'error' }));
        }
    };

    const removeStudyFromProject = async (studyId) => {
        if (!currentProjectId) return;
        try {
            await fetch(`${API_BASE}/projects/${currentProjectId}/studies/${studyId}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' });
            await fetchProject();
        } catch (_) {}
    };

    const startNewProjectChat = async () => {
        if (!currentProjectId) return;
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProjectId}/chats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId }),
            });
            if (!res.ok) return;
            const chat = await res.json();
            setCurrentProjectChatId(chat.chat_id);
            setView('project-chat');
            await fetchProject();
            setProjectChat(chat);
        } catch (_) {}
    };

    const deleteProjectChat = async (chatId) => {
        if (!currentProjectId) return;
        try {
            await fetch(`${API_BASE}/projects/${currentProjectId}/chats/${chatId}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' });
            if (chatId === currentProjectChatId) {
                setCurrentProjectChatId('');
                setProjectChat(null);
            }
            await fetchProject();
        } catch (_) {}
    };

    const startNewGlobalChat = async () => {
        try {
            const res = await fetch(`${API_BASE}/global-chats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId }),
            });
            if (!res.ok) return;
            const chat = await res.json();
            setCurrentGlobalChatId(chat.chat_id);
            setGlobalChat(chat);
            setView('global');
            setGlobalPanelMode('chat');
            await fetchGlobalChats();
        } catch (_) {}
    };

    const deleteGlobalChatById = async (chatId) => {
        try {
            await fetch(`${API_BASE}/global-chats/${chatId}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' });
            if (currentGlobalChatId === chatId) {
                setCurrentGlobalChatId('');
                setGlobalChat(null);
            }
            await fetchGlobalChats();
        } catch (_) {}
    };

    const ensureProjectChat = async (projectId) => {
        if (!projectId) throw new Error('Select a project first');

        const activeChatId = currentProjectChatId;
        if (activeChatId) {
            const existsInCurrentProject = (projectChats || []).some((c) => c.chat_id === activeChatId);
            if (existsInCurrentProject) return activeChatId;

            try {
                const chatsRes = await fetch(`${API_BASE}/projects/${projectId}/chats?user_id=${encodeURIComponent(userId)}`);
                if (chatsRes.ok) {
                    const data = await chatsRes.json();
                    const chats = data.chats || [];
                    setProjectChats(chats);
                    if (chats.some((c) => c.chat_id === activeChatId)) return activeChatId;
                    if (chats.length > 0) {
                        setCurrentProjectChatId(chats[0].chat_id);
                        return chats[0].chat_id;
                    }
                }
            } catch (_) {}

            setCurrentProjectChatId('');
            setProjectChat(null);
        }

        const res = await fetch(`${API_BASE}/projects/${projectId}/chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId }),
        });
        if (!res.ok) throw new Error('Failed to create project chat');
        const chat = await res.json();
        setCurrentProjectChatId(chat.chat_id);
        setProjectChat(chat);
        await fetchProject();
        return chat.chat_id;
    };

    const ensureGlobalChat = async () => {
        if (currentGlobalChatId) return currentGlobalChatId;
        const res = await fetch(`${API_BASE}/global-chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId }),
        });
        if (!res.ok) throw new Error('Failed to create global chat');
        const chat = await res.json();
        setCurrentGlobalChatId(chat.chat_id);
        setGlobalChat(chat);
        await fetchGlobalChats();
        return chat.chat_id;
    };

    const parseSSEStream = async (response, handlers, signal) => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            if (signal?.aborted) break;
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let splitIndex = buffer.indexOf('\n\n');
            while (splitIndex !== -1) {
                const rawEvent = buffer.slice(0, splitIndex);
                buffer = buffer.slice(splitIndex + 2);
                splitIndex = buffer.indexOf('\n\n');

                const lines = rawEvent.split('\n');
                let eventType = 'message';
                let payloadText = '{}';
                for (const line of lines) {
                    if (line.startsWith('event:')) eventType = line.slice(6).trim();
                    if (line.startsWith('data:')) payloadText = line.slice(5).trim();
                }

                let payload = {};
                try {
                    payload = JSON.parse(payloadText || '{}');
                } catch (_) {
                    payload = { raw: payloadText };
                }

                if (eventType === 'token' && handlers.onToken) handlers.onToken(payload);
                if (eventType === 'done' && handlers.onDone) handlers.onDone(payload);
                if (eventType === 'error' && handlers.onError) handlers.onError(payload);
            }
        }
    };

    const streamProjectMessage = async (projectId, chatId, msg) => {
        const existing = (projectChat?.messages || []).slice();
        const optimistic = [...existing, { role: 'user', content: msg }, { role: 'assistant', content: '', isStreaming: true }];
        setProjectChat((prev) => ({ ...(prev || { chat_id: chatId }), chat_id: chatId, messages: optimistic }));

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const res = await fetch(`${API_BASE}/projects/${projectId}/chats/${chatId}/message/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, message: msg }),
                signal: controller.signal,
            });
            if (!res.ok || !res.body) throw new Error('Streaming failed');

            await parseSSEStream(res, {
                onToken: (payload) => {
                    setProjectChat((prev) => {
                        if (!prev) return prev;
                        const msgs = (prev.messages || []).slice();
                        if (!msgs.length) return prev;
                        const last = { ...msgs[msgs.length - 1] };
                        last.content = `${last.content || ''}${payload.token || ''}`;
                        last.isStreaming = true;
                        msgs[msgs.length - 1] = last;
                        return { ...prev, messages: msgs };
                    });
                },
                onDone: () => {
                    setProjectChat((prev) => {
                        if (!prev) return prev;
                        const msgs = (prev.messages || []).slice();
                        if (!msgs.length) return prev;
                        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], isStreaming: false };
                        return { ...prev, messages: msgs };
                    });
                },
                onError: (payload) => setComposerError(payload.error || 'Streaming error'),
            }, controller.signal);

            await Promise.all([fetchProjectChat(), fetchProject()]);
        } finally {
            if (abortControllerRef.current === controller) abortControllerRef.current = null;
        }
    };

    const streamGlobalMessage = async (chatId, msg) => {
        const existing = (globalChat?.messages || []).slice();
        const optimistic = [...existing, { role: 'user', content: msg }, { role: 'assistant', content: '', isStreaming: true }];
        setGlobalChat((prev) => ({ ...(prev || { chat_id: chatId }), chat_id: chatId, messages: optimistic }));

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const res = await fetch(`${API_BASE}/global-chats/${chatId}/message/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, message: msg, selected_studies: selectedGlobalStudies }),
                signal: controller.signal,
            });
            if (!res.ok || !res.body) throw new Error('Streaming failed');

            await parseSSEStream(res, {
                onToken: (payload) => {
                    setGlobalChat((prev) => {
                        if (!prev) return prev;
                        const msgs = (prev.messages || []).slice();
                        if (!msgs.length) return prev;
                        const last = { ...msgs[msgs.length - 1] };
                        last.content = `${last.content || ''}${payload.token || ''}`;
                        last.isStreaming = true;
                        msgs[msgs.length - 1] = last;
                        return { ...prev, messages: msgs };
                    });
                },
                onDone: () => {
                    setGlobalChat((prev) => {
                        if (!prev) return prev;
                        const msgs = (prev.messages || []).slice();
                        if (!msgs.length) return prev;
                        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], isStreaming: false };
                        return { ...prev, messages: msgs };
                    });
                },
                onError: (payload) => setComposerError(payload.error || 'Streaming error'),
            }, controller.signal);

            await Promise.all([fetchGlobalChat(), fetchGlobalChats()]);
        } finally {
            if (abortControllerRef.current === controller) abortControllerRef.current = null;
        }
    };

    const sendMessage = async () => {
        const msg = chatInput.trim();
        if (!msg || sending) return;

        setSending(true);
        setComposerError(null);
        setChatInput('');

        try {
            if (view === 'project-chat') {
                const projectId = currentProjectId;
                if (!projectId) throw new Error('Select a project first');
                const chatId = await ensureProjectChat(projectId);
                await streamProjectMessage(projectId, chatId, msg);
            } else {
                const chatId = await ensureGlobalChat();
                await streamGlobalMessage(chatId, msg);
                setGlobalPanelMode('chat');
            }
        } catch (err) {
            setComposerError(err.message || 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const openProjectChat = (chatId) => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        setCurrentProjectChatId(chatId);
        setView('project-chat');
        setComposerError(null);
    };

    const selectProject = (projectId) => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        setCurrentProjectChatId('');
        setProjectChat(null);
        setCurrentProjectId(projectId);
        setView('project-chat');
        setComposerError(null);
    };

    const openGlobalChat = (chatId) => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        setCurrentGlobalChatId(chatId);
        setView('global');
        setGlobalPanelMode('chat');
        setComposerError(null);
    };

    const toggleSelectedGlobalStudy = (study) => {
        setSelectedGlobalStudies((prev) => {
            const exists = prev.some((s) => s.study_id === study.study_id);
            if (exists) return prev.filter((s) => s.study_id !== study.study_id);
            return [...prev, study];
        });
    };

    const displayStudies = hasSearched ? studies : [];
    const currentMessages = view === 'project-chat' ? (projectChat?.messages || []) : (globalChat?.messages || []);
    const canShowComposer = view === 'project-chat' || (view === 'global' && globalPanelMode === 'chat');

    const exampleQueries = ['soil microbiome', 'gut bacteria', 'ocean samples', 'Rob Knight', 'UC San Diego'];

    return (
        <div className="app-layout">
            <aside className="sidebar" style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN }}>
                <div className="sidebar-tabs">
                    <button type="button" className={`sidebar-tab ${view === 'global' ? 'active' : ''}`} onClick={() => setView('global')}>Global</button>
                    <button type="button" className={`sidebar-tab ${view === 'project-chat' ? 'active' : ''}`} onClick={() => setView('project-chat')}>Project Chat</button>
                </div>

                <div className="sidebar-section">
                    <h3 className="sidebar-title">Projects</h3>
                    <ul className="sidebar-list">
                        {projectsLoading && <li className="list-empty">Loading projects…</li>}
                        {!projectsLoading && projects.length === 0 && <li className="list-empty">No projects yet.</li>}
                        {!projectsLoading && projects.map((p) => (
                            <li key={p.project_id} className={currentProjectId === p.project_id ? 'active' : ''}>
                                <button type="button" onClick={() => selectProject(p.project_id)}>
                                    <span className="list-label">{p.name}</span>
                                    <span className="list-meta">{p.studies_count || 0} studies · {p.chats_count || 0} chats</span>
                                </button>
                                <button
                                    type="button"
                                    className="list-remove"
                                    title="Delete project"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`Delete project "${p.name}"?`)) deleteProject(p.project_id);
                                    }}
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>

                    {!showNewProjectForm ? (
                        <button type="button" className="new-below" onClick={() => setShowNewProjectForm(true)}>+ New Project</button>
                    ) : (
                        <div className="new-project-form">
                            <input
                                type="text"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && createProject()}
                                placeholder="Project name"
                            />
                            <div className="new-project-actions">
                                <button type="button" className="btn btn-small" onClick={createProject}>Create</button>
                                <button type="button" className="btn btn-small btn-secondary" onClick={() => { setShowNewProjectForm(false); setNewProjectName(''); }}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>

                {currentProjectId && (
                    <div className="sidebar-section">
                        <div className="section-head-inline">
                            <h3 className="sidebar-title">Chats in Project</h3>
                            <button type="button" className="tiny-action" onClick={startNewProjectChat}>+ New</button>
                        </div>
                        <ul className="sidebar-list compact">
                            {projectChats.map((c) => (
                                <li key={c.chat_id} className={currentProjectChatId === c.chat_id ? 'active' : ''}>
                                    <button type="button" onClick={() => openProjectChat(c.chat_id)}>
                                        <span className="list-label">{c.title || 'New chat'}</span>
                                    </button>
                                    <button type="button" className="list-remove" onClick={(e) => { e.stopPropagation(); deleteProjectChat(c.chat_id); }} title="Delete chat">×</button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {currentProjectId && (
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">Studies in Project</h3>
                        <ul className="sidebar-list compact">
                            {(project?.studies || []).length === 0 ? (
                                <li className="list-empty">No studies saved yet.</li>
                            ) : (
                                (project?.studies || []).map((s) => (
                                    <li key={s.study_id}>
                                        <button type="button" onClick={() => setSelectedStudy(s)}>
                                            <span className="list-label">{s.study_title || 'Untitled study'}</span>
                                            <span className="list-meta">ID {s.study_id}</span>
                                        </button>
                                        <button type="button" className="list-remove" onClick={(e) => { e.stopPropagation(); removeStudyFromProject(s.study_id); }} title="Remove study">×</button>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}

                <div className="sidebar-section">
                    <div className="section-head-inline">
                        <h3 className="sidebar-title">Global Chats</h3>
                        <button type="button" className="tiny-action" onClick={startNewGlobalChat}>+ New</button>
                    </div>
                    <ul className="sidebar-list compact">
                        {globalChats.map((c) => (
                            <li key={c.chat_id} className={currentGlobalChatId === c.chat_id ? 'active' : ''}>
                                <button type="button" onClick={() => openGlobalChat(c.chat_id)}>
                                    <span className="list-label">{c.title || 'New chat'}</span>
                                </button>
                                <button type="button" className="list-remove" onClick={(e) => { e.stopPropagation(); deleteGlobalChatById(c.chat_id); }} title="Delete global chat">×</button>
                            </li>
                        ))}
                    </ul>
                </div>
            </aside>

            <div className={`sidebar-resizer ${isResizingSidebar ? 'active' : ''}`} onPointerDown={() => setIsResizingSidebar(true)} />

            <main className="main">
                <div className="header minimalist">
                    <h1>Qiita Study Explorer</h1>
                    <p>
                        {view === 'global'
                            ? 'Search studies and chat globally using selected context studies.'
                            : (currentProjectId ? `Project chat for ${project?.name || 'selected project'}.` : 'Select a project to start chatting.')}
                    </p>
                </div>

                <div className="main-content">
                    {view === 'global' && (
                        <div className="global-panel">
                            <div className="first-twenty-panel">
                                <div className="first-twenty-header">
                                    <h2>First 20 Studies</h2>
                                    {firstStudiesLoading && <span>Loading…</span>}
                                </div>
                                {firstStudiesError && <div className="soft-empty">{firstStudiesError}</div>}
                                {!firstStudiesLoading && !firstStudiesError && firstStudies.length === 0 && (
                                    <div className="soft-empty">No studies available.</div>
                                )}
                                {!firstStudiesLoading && firstStudies.length > 0 && (
                                    <div className="first-twenty-list">
                                        {firstStudies.map((study) => {
                                            const targetProject = firstStudyProjectTargets[study.study_id] || currentProjectId || projects[0]?.project_id || '';
                                            const status = firstStudyAddStatus[study.study_id] || '';
                                            return (
                                                <div key={`first-${study.study_id}`} className="first-study-row">
                                                    <button type="button" className="first-study-info" onClick={() => setSelectedStudy(study)}>
                                                        <span className="list-label">{study.study_title || 'Untitled study'}</span>
                                                        <span className="list-meta">ID {study.study_id}</span>
                                                    </button>
                                                    <select
                                                        className="first-study-project-select"
                                                        value={targetProject}
                                                        onChange={(e) => setFirstStudyProjectTargets((prev) => ({ ...prev, [study.study_id]: e.target.value }))}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="">Select project</option>
                                                        {projects.map((p) => (
                                                            <option key={`target-${study.study_id}-${p.project_id}`} value={p.project_id}>
                                                                {p.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        className="btn btn-small"
                                                        disabled={!targetProject || status === 'adding'}
                                                        onClick={(e) => addStudyToSpecificProject(study, targetProject, e)}
                                                    >
                                                        {status === 'adding' ? 'Adding…' : status === 'added' ? 'Added' : 'Add'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="global-panel-switch">
                                <button type="button" className={globalPanelMode === 'search' ? 'active' : ''} onClick={() => setGlobalPanelMode('search')}>Search</button>
                                <button type="button" className={globalPanelMode === 'chat' ? 'active' : ''} onClick={() => setGlobalPanelMode('chat')}>Chat</button>
                            </div>

                            {globalPanelMode === 'search' && (
                                <>
                                    <div className="search-section">
                                        <div className="search-box">
                                            <input
                                                type="text"
                                                value={query}
                                                onChange={(e) => setQuery(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                                placeholder="Search studies by keywords, author, or topic"
                                            />
                                            <button type="button" className="btn" onClick={handleSearch} disabled={searching || !query.trim()}>
                                                {searching ? 'Searching...' : 'Search'}
                                            </button>
                                            {(hasSearched || query) && (
                                                <button type="button" className="btn btn-secondary" onClick={clearResults}>Clear</button>
                                            )}
                                        </div>
                                        <div className="examples">
                                            <span className="example-label">Quick search:</span>
                                            {exampleQueries.map((example, idx) => (
                                                <span key={idx} className="example-tag" onClick={() => setQuery(example)}>{example}</span>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedGlobalStudies.length > 0 && (
                                        <div className="selected-studies-bar">
                                            {selectedGlobalStudies.map((s) => (
                                                <button key={s.study_id} type="button" className="selected-study-chip" onClick={() => toggleSelectedGlobalStudy(s)}>
                                                    ID {s.study_id} · {s.study_title || 'Untitled'} ×
                                                </button>
                                            ))}
                                        </div>
                                    )}

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
                                        </div>
                                    )}

                                    {error && <div className="error"><strong>Error:</strong> {error}</div>}

                                    {searching && (
                                        <div className="loading">
                                            <div className="spinner"></div>
                                            <p>Searching studies...</p>
                                        </div>
                                    )}

                                    {!searching && displayStudies.length > 0 && (
                                        <div className="studies-grid">
                                            {displayStudies.map((study) => {
                                                const inProject = studyIdsInProject.includes(study.study_id);
                                                const selectedForGlobal = selectedGlobalStudies.some((s) => s.study_id === study.study_id);
                                                return (
                                                    <div key={study.study_id} className="study-card" onClick={() => setSelectedStudy(study)}>
                                                        <div className="card-header">
                                                            <span className="study-id-badge">ID {study.study_id}</span>
                                                            <div className="inline-actions" onClick={(e) => e.stopPropagation()}>
                                                                <button type="button" className="btn btn-small btn-secondary" onClick={() => toggleSelectedGlobalStudy(study)}>
                                                                    {selectedForGlobal ? 'Selected' : 'Select'}
                                                                </button>
                                                                {currentProjectId && (
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-small"
                                                                        onClick={(e) => addStudyToProject(study, e)}
                                                                        disabled={addingStudy || inProject}
                                                                    >
                                                                        {inProject ? 'Saved' : '+ Project'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <h3 className="study-title">{study.study_title || 'Untitled study'}</h3>
                                                        <p className="study-abstract">{study.study_abstract || 'No abstract available.'}</p>
                                                        {(study.pi_name || study.pi_affiliation) && (
                                                            <div className="card-meta">
                                                                {study.pi_name && <div className="meta-item">PI: {study.pi_name}</div>}
                                                                {study.pi_affiliation && <div className="meta-item">{study.pi_affiliation}</div>}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {!searching && hasSearched && displayStudies.length === 0 && (
                                        <div className="soft-empty">No studies found for this query.</div>
                                    )}
                                </>
                            )}

                            {globalPanelMode === 'chat' && (
                                <div className="chat-shell">
                                    <div className="chat-messages minimal">
                                        {currentGlobalChatId && currentMessages.length > 0 ? (
                                            currentMessages.map((m, i) => (
                                                <div key={i} className={`chat-msg ${m.role}`}>
                                                    <div className="chat-content">{m.content}{m.isStreaming ? <span className="typing-caret">▋</span> : null}</div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="empty-state chat-empty">
                                                <h3 className="empty-title">Global chat</h3>
                                                <p className="empty-text">Start a global chat or open one from the sidebar history.</p>
                                                <button type="button" className="btn" onClick={startNewGlobalChat}>+ New Global Chat</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {view === 'project-chat' && (
                        <div className="chat-shell">
                            {!currentProjectId ? (
                                <div className="empty-state chat-empty">
                                    <h3 className="empty-title">Select a project</h3>
                                    <p className="empty-text">Choose a project in the sidebar to chat with project-specific studies.</p>
                                </div>
                            ) : (
                                <div className="chat-messages minimal">
                                    {currentMessages.length > 0 ? (
                                        currentMessages.map((m, i) => (
                                            <div key={i} className={`chat-msg ${m.role}`}>
                                                <div className="chat-content">{m.content}{m.isStreaming ? <span className="typing-caret">▋</span> : null}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="empty-state chat-empty">
                                            <h3 className="empty-title">Project chat</h3>
                                            <p className="empty-text">Create a new project chat or open one from the sidebar.</p>
                                            <button type="button" className="btn" onClick={startNewProjectChat}>+ New Project Chat</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {selectedStudy && (
                        <div className="study-detail-overlay" onClick={() => setSelectedStudy(null)}>
                            <div className="study-detail-card" onClick={(e) => e.stopPropagation()}>
                                <button type="button" className="study-detail-close" onClick={() => setSelectedStudy(null)} aria-label="Close">×</button>
                                <div className="study-detail-header">
                                    <span className="study-detail-id">ID {selectedStudy.study_id}</span>
                                    <h2 className="study-detail-title">{selectedStudy.study_title || 'Untitled study'}</h2>
                                </div>
                                <div className="study-detail-body">
                                    <section className="study-detail-section">
                                        <h3>Abstract</h3>
                                        <p>{selectedStudy.study_abstract || 'No abstract available.'}</p>
                                    </section>
                                    {selectedStudy.pi_name && (
                                        <section className="study-detail-section">
                                            <h3>Principal investigator</h3>
                                            <p>{selectedStudy.pi_name}{selectedStudy.pi_affiliation ? ` — ${selectedStudy.pi_affiliation}` : ''}</p>
                                        </section>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {canShowComposer && (
                    <div className="chat-dock minimalist">
                        <div className="chat-input-wrap minimal">
                            <textarea
                                ref={textareaRef}
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                                placeholder="Message"
                                rows={1}
                                disabled={sending}
                            />
                            <button
                                type="button"
                                className="send-btn"
                                onClick={sendMessage}
                                disabled={sending || !chatInput.trim()}
                                aria-label="Send message"
                            >
                                ↑
                            </button>
                        </div>
                        {composerError && <p className="composer-error">{composerError}</p>}
                    </div>
                )}
            </main>
        </div>
    );
}

ReactDOM.render(<App />, document.getElementById('root'));
