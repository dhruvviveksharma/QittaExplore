const { useState, useEffect, useRef, useMemo, useCallback } = React;

const API     = document.querySelector('meta[name="api-base"]')?.content
              || 'http://localhost:5001/api';
const USER_ID = 'default';

// ─── helpers ──────────────────────────────────────────────────────────────────
const apiFetch = (path, opts = {}) =>
  fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
const apiPost  = (path, body)  => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) });
const apiDel   = (path)        => apiFetch(path, { method: 'DELETE' });

async function parseSSE(response, { onToken, onUi, onDone, onError }, signal) {
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
      if (type === 'ui'    && onUi)    onUi(payload);
      if (type === 'done'  && onDone)  onDone(payload);
      if (type === 'error' && onError) onError(payload);
    }
  }
}

// ─── CollapsibleSection: section with persisted open/closed state ─────────────
function CollapsibleSection({ id, title, subtitle, children, defaultOpen = false }) {
  const storageKey = id ? `collapse:${id}` : null;
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem(storageKey);
      return v === null ? defaultOpen : v === '1';
    } catch (_) { return defaultOpen; }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch (_) {}
    }
  };
  return (
    <div className={`collapsible-section ${open ? 'open' : ''}`}>
      <button className="collapsible-header" onClick={toggle}>
        <span className={`collapsible-chevron ${open ? 'open' : ''}`}>▸</span>
        <span className="collapsible-title">{title}</span>
        {subtitle ? <span className="collapsible-subtitle">{subtitle}</span> : null}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

// ─── Field grouping for sample detail panel ──────────────────────────────────
const FIELD_GROUPS = [
  ['Identity',       ['sample_id','anonymized_name','qiita_study_id']],
  ['Biological',     ['env_package','body_site','env_biome','env_feature','host_taxid','host_subject_id']],
  ['Location',       ['latitude','longitude','country','elevation','depth','location']],
  ['Temporal',       ['collection_timestamp','collection_date','collection_time']],
  ['Administrative', ['description','notes']],
];

// ─── SamplesBrowser: shared two-pane / stacked sample viewer ──────────────────
// Used by the study modal (layout='two-pane', fields fetched on demand from API)
// and by the inline /report chat bubble (layout='stacked', fields embedded per row).
function SamplesBrowser({ samples, totalSamples, layout, fetchFields }) {
  const [activeId, setActiveId] = useState(null);
  const [activeFields, setActiveFields] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [showVaryingOnly, setShowVaryingOnly] = useState(false);

  const onRowClick = async (s) => {
    if (activeId === s.sample_id) {
      setActiveId(null); setActiveFields(null); return;
    }
    setActiveId(s.sample_id);
    if (s.fields && Object.keys(s.fields).length) {
      setActiveFields(s.fields);
      return;
    }
    if (fetchFields) {
      setLoading(true);
      try { setActiveFields(await fetchFields(s.sample_id)); }
      catch (_) { setActiveFields(null); }
      finally { setLoading(false); }
    }
  };

  // Pre-lowercase haystack per sample (table-visible scalars + all field values)
  const haystacks = useMemo(() => {
    return (samples || []).map(s => {
      const f = s.fields || {};
      const parts = [
        s.sample_id, s.anonymized_name, s.env_package, s.collection_timestamp,
        ...Object.values(f),
      ];
      return parts.map(v => v == null ? '' : String(v).toLowerCase()).join(' ');
    });
  }, [samples]);

  const filteredSamples = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return samples || [];
    const out = [];
    for (let i = 0; i < (samples || []).length; i++) {
      if (haystacks[i].indexOf(q) !== -1) out.push(samples[i]);
    }
    return out;
  }, [samples, haystacks, filterText]);

  // Top env_package (or body_site fallback) chips
  const summaryChips = useMemo(() => {
    if (!samples || samples.length < 1) return [];
    const tryKey = (key) => {
      const counts = new Map();
      for (const s of samples) {
        const v = (s && s[key]) || (s && s.fields && s.fields[key]);
        if (v == null || v === '') continue;
        const sv = String(v);
        counts.set(sv, (counts.get(sv) || 0) + 1);
      }
      return counts;
    };
    let counts = tryKey('env_package');
    if (counts.size < 1) counts = tryKey('body_site');
    if (counts.size < 1) return [];
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));
  }, [samples]);

  // Compute uniform field keys across samples that have populated fields.
  const uniformFields = useMemo(() => {
    const populated = (samples || []).filter(s => s.fields && Object.keys(s.fields).length);
    if (populated.length < 2) return new Set();
    const keyVals = new Map();
    for (const s of populated) {
      for (const [k, v] of Object.entries(s.fields)) {
        if (!keyVals.has(k)) keyVals.set(k, new Set());
        keyVals.get(k).add(v == null ? '' : String(v));
      }
    }
    const uniform = new Set();
    for (const [k, vals] of keyVals.entries()) {
      if (vals.size === 1) uniform.add(k);
    }
    return uniform;
  }, [samples]);

  // Group activeFields by FIELD_GROUPS (case-insensitive)
  const groupedActiveFields = useMemo(() => {
    if (!activeFields) return [];
    const remaining = new Map(
      Object.entries(activeFields).filter(([, v]) => v != null && v !== '')
    );
    const result = [];
    for (const [groupName, keys] of FIELD_GROUPS) {
      const entries = [];
      for (const target of keys) {
        for (const k of [...remaining.keys()]) {
          if (k.toLowerCase() === target.toLowerCase()) {
            entries.push([k, remaining.get(k)]);
            remaining.delete(k);
          }
        }
      }
      if (entries.length) result.push([groupName, entries]);
    }
    if (remaining.size) {
      result.push(['Other', [...remaining.entries()].sort(([a], [b]) => a.localeCompare(b))]);
    }
    return result;
  }, [activeFields]);

  const visibleGroups = useMemo(() => {
    if (!showVaryingOnly || uniformFields.size === 0) return groupedActiveFields;
    return groupedActiveFields
      .map(([g, entries]) => [g, entries.filter(([k]) => !uniformFields.has(k))])
      .filter(([, entries]) => entries.length);
  }, [groupedActiveFields, uniformFields, showVaryingOnly]);

  const hiddenUniformCount = useMemo(() => {
    if (!showVaryingOnly || !activeFields) return 0;
    let n = 0;
    for (const k of Object.keys(activeFields)) if (uniformFields.has(k)) n++;
    return n;
  }, [activeFields, uniformFields, showVaryingOnly]);

  if (!samples || samples.length === 0) {
    return <p style={{color:'var(--text-3)', fontSize:'0.85rem'}}>No samples found.</p>;
  }

  const isStacked = layout === 'stacked';

  const toolbarEl = (
    <>
      <div className="samples-toolbar">
        <input
          className="samples-search"
          placeholder="Filter samples…"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
        {filterText && (
          <span className="samples-filter-count">
            {filteredSamples.length} of {samples.length}
            <button className="samples-clear" onClick={() => setFilterText('')}>Clear</button>
          </span>
        )}
      </div>
      {summaryChips.length > 0 && (
        <div className="samples-chips">
          {summaryChips.map(({ value, count }) => (
            <button
              key={value}
              className={`samples-chip ${filterText === value ? 'active' : ''}`}
              onClick={() => setFilterText(filterText === value ? '' : value)}
            >
              {value} <span className="samples-chip-count">{count}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );

  const tableEl = (
    <div className="samples-table-wrap" style={isStacked ? null : {flex:'0 0 auto', maxWidth:'55%'}}>
      <table className="prep-table">
        <thead>
          <tr><th>Sample ID</th><th>Anonymized Name</th><th>Env Package</th><th>Collection Date</th></tr>
        </thead>
        <tbody>
          {filteredSamples.length === 0 ? (
            <tr><td colSpan={4} style={{color:'var(--text-3)', fontSize:'11.5px', padding:'10px 8px'}}>No matches.</td></tr>
          ) : filteredSamples.map(s => {
            const f = s.fields || {};
            const collectionDate = s.collection_timestamp
              || f.collection_timestamp || f.collection_date || '';
            return (
              <tr key={s.sample_id}
                  onClick={() => onRowClick(s)}
                  style={{cursor:'pointer', background: activeId === s.sample_id ? 'var(--accent-bg,#f0f4ff)' : ''}}>
                <td>{s.sample_id}</td>
                <td>{s.anonymized_name || f.anonymized_name || '—'}</td>
                <td>{s.env_package || f.env_package || '—'}</td>
                <td>{collectionDate ? String(collectionDate).slice(0, 10) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const canVaryToggle = uniformFields.size > 0;
  const detailEl = loading ? (
    <div style={{flex:1, color:'var(--text-3)', fontSize:'0.85rem', paddingTop:'0.5rem'}}>Loading…</div>
  ) : activeFields ? (
    <div className="sample-preview-card">
      <div className="sample-preview-header">
        <span>{activeId}</span>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          {canVaryToggle && (
            <label className="sample-preview-toggle">
              <input type="checkbox" checked={showVaryingOnly} onChange={e => setShowVaryingOnly(e.target.checked)} />
              Show only varying
            </label>
          )}
          <button className="sample-preview-close" onClick={() => { setActiveId(null); setActiveFields(null); }}>✕</button>
        </div>
      </div>
      <div className="sample-preview-body">
        {visibleGroups.map(([groupName, entries]) => (
          <div key={groupName} className="sample-preview-group">
            <h5 className="sample-preview-group-title">{groupName}</h5>
            {entries.map(([k, v]) => (
              <div key={k} className="sample-preview-row">
                <span className="sample-preview-key">{k}</span>
                <span className="sample-preview-val">{String(v)}</span>
              </div>
            ))}
          </div>
        ))}
        {showVaryingOnly && hiddenUniformCount > 0 && (
          <div className="sample-preview-hidden-note">
            {hiddenUniformCount} uniform field{hiddenUniformCount === 1 ? '' : 's'} hidden
          </div>
        )}
      </div>
    </div>
  ) : null;

  if (isStacked) {
    return (
      <div className="samples-browser-stacked">
        {toolbarEl}
        {tableEl}
        {detailEl}
      </div>
    );
  }
  return (
    <div>
      {toolbarEl}
      <div style={{display:'flex', gap:'1rem', alignItems:'flex-start'}}>
        {tableEl}
        {detailEl}
      </div>
    </div>
  );
}

// Inline preps table for the /report bubble. Fires onMount on first expand.
function PrepsTable({ detail, loading, onMount }) {
  useEffect(() => { onMount && onMount(); }, []);
  if (loading && !detail) return <div className="modal-detail-loading">Loading…</div>;
  if (!detail) return null;
  const preps = detail.preps || [];
  if (preps.length === 0) {
    return <p style={{color:'var(--text-3)', fontSize:'0.85rem'}}>No prep templates found.</p>;
  }
  return (
    <table className="prep-table">
      <thead>
        <tr><th>Prep ID</th><th>Data Type</th><th>Investigation</th><th>Platform</th><th>Target Gene</th><th>Status</th></tr>
      </thead>
      <tbody>
        {preps.map(p => (
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
  );
}

function ArtifactsTable({ detail, loading, onMount }) {
  useEffect(() => { onMount && onMount(); }, []);
  if (loading && !detail) return <div className="modal-detail-loading">Loading…</div>;
  if (!detail) return null;
  const artifacts = detail.artifacts || [];
  if (artifacts.length === 0) {
    return <p style={{color:'var(--text-3)', fontSize:'0.85rem'}}>No artifacts found.</p>;
  }
  return (
    <table className="prep-table">
      <thead>
        <tr><th>Artifact ID</th><th>Type</th><th>Data Type</th><th>File Path</th></tr>
      </thead>
      <tbody>
        {artifacts.map(a => (
          <tr key={`${a.prep_template_id}-${a.artifact_id}`}>
            <td>{a.artifact_id}</td>
            <td>{a.artifact_type || '—'}</td>
            <td>{a.data_type || '—'}</td>
            <td className="artifact-path-cell">
              <span className="artifact-path" title={a.full_path}>
                {a.full_path ? a.full_path.split('/').slice(-2).join('/') : '—'}
              </span>
              {a.full_path && (
                <button className="btn-copy-path" title="Copy full path"
                  onClick={() => navigator.clipboard?.writeText(a.full_path)}>⎘</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Inline chat bubble for /report results — uses the embedded payload.
// Lazy-fetches preps/artifacts via /api/studies/<id>/detail when those sections expand.
function SamplesReportBubble({ ui, messageKey }) {
  if (!ui) return null;
  const { header = {}, samples = [], study_id } = ui;
  const numSamples = header.num_samples != null ? header.num_samples : samples.length;
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailReqRef = useRef(false);

  const ensureDetail = useCallback(async () => {
    if (detail || detailReqRef.current) return;
    detailReqRef.current = true;
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/studies/${study_id}/detail`);
      if (res.ok) {
        const d = await res.json();
        setDetail({ preps: d.preps || [], artifacts: d.artifacts || [] });
      }
    } catch (_) {
      detailReqRef.current = false;
    } finally {
      setDetailLoading(false);
    }
  }, [study_id, detail]);

  const keyBase = messageKey || `study-${study_id}`;
  return (
    <div className="samples-report-bubble">
      <div className="samples-report-header">
        <div className="samples-report-title">Study {study_id}: {header.study_title || 'Untitled study'}</div>
        <div className="samples-report-meta">
          {header.pi_name ? <span>PI: {header.pi_name}</span> : null}
          {numSamples != null ? <span>{numSamples} samples</span> : null}
          {header.data_types ? <span>{header.data_types}</span> : null}
          {header.num_preps != null ? <span>{header.num_preps} preps</span> : null}
        </div>
      </div>

      <CollapsibleSection
        id={`${keyBase}-samples`}
        title="Samples"
        subtitle={`${numSamples} total${samples.length < numSamples ? `, showing ${samples.length}` : ''}`}
        defaultOpen={true}
      >
        <SamplesBrowser samples={samples} totalSamples={numSamples} layout="stacked" />
      </CollapsibleSection>

      <CollapsibleSection
        id={`${keyBase}-preps`}
        title="Prep Templates"
        subtitle={detail ? `${(detail.preps || []).length} total` : (header.num_preps != null ? `${header.num_preps} total` : '')}
        defaultOpen={false}
      >
        <PrepsTable detail={detail} loading={detailLoading} onMount={ensureDetail} />
      </CollapsibleSection>

      <CollapsibleSection
        id={`${keyBase}-artifacts`}
        title="Artifacts"
        subtitle={detail ? `${(detail.artifacts || []).length} total` : ''}
        defaultOpen={false}
      >
        <ArtifactsTable detail={detail} loading={detailLoading} onMount={ensureDetail} />
      </CollapsibleSection>
    </div>
  );
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
    // Fire-and-forget warm-cache for full sample metadata
    apiPost(`/projects/${pid}/preload`, { user_id: USER_ID }).catch(() => {});
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
      const messages = (d.messages || []).map(m => m.ui_payload ? { ...m, ui: m.ui_payload } : m);
      setChatCache(prev => ({
        ...prev,
        [chatId]: {
          messages,
          title: d.title,
          pinnedStudies: d.pinned_studies || [],
          totalStudiesInProject: d.total_studies_in_project,
        },
      }));
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

  const applyStreamDone = (chatId, title, reportStudyId) => {
    patchLast(chatId, m => ({ ...m, isStreaming: false }));
    setChatCache(prev => {
      const cur = prev[chatId] || {};
      const pins = cur.pinnedStudies || [];
      const nextPins = (reportStudyId != null && !pins.includes(reportStudyId)) ? [...pins, reportStudyId] : pins;
      return { ...prev, [chatId]: { ...cur, title, pinnedStudies: nextPins } };
    });
  };

  const unpinStudy = async (chatId, studyId) => {
    setChatCache(prev => {
      const cur = prev[chatId];
      if (!cur) return prev;
      return { ...prev, [chatId]: { ...cur, pinnedStudies: (cur.pinnedStudies || []).filter(id => id !== studyId) } };
    });
    try {
      if (view.type === 'project-chat' && view.projId) {
        await apiDel(`/projects/${view.projId}/chats/${chatId}/pinned/${studyId}?user_id=${USER_ID}`);
      } else if (view.type === 'global-chat') {
        await apiDel(`/global-chats/${chatId}/pinned/${studyId}?user_id=${USER_ID}`);
      }
    } catch (_) { /* optimistic — ignore */ }
  };

  // ─── send ──────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    const reportMatch = /^\/report\s+(\d+)\s*$/i.exec(msg);
    const reportStudyId = reportMatch ? parseInt(reportMatch[1], 10) : null;
    const displayMsg = reportStudyId != null
      ? `/report ${reportStudyId} - Full study report`
      : msg;
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
          setChatCache(prev => ({
            ...prev,
            [chatId]: {
              messages: [],
              title: displayMsg.slice(0, 60),
              pinnedStudies: chat.pinned_studies || [],
              totalStudiesInProject: chat.total_studies_in_project,
            },
          }));
          setView(v => ({ ...v, chatId }));
        }
        optimisticAppend(chatId, displayMsg);
        const res = await fetch(`${API}/projects/${projId}/chats/${chatId}/message/stream`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: USER_ID,
            message: msg,
            ...(reportStudyId != null && { report_study_id: reportStudyId }),
          }), signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error('Stream failed');
        await parseSSE(res, {
          onToken: ({ token }) => patchLast(chatId, m => ({ ...m, content: (m.content||'') + (token||'') })),
          onUi: (payload) => patchLast(chatId, m => ({ ...m, ui: payload, content: '' })),
          onDone: () => {
            const title = displayMsg.slice(0, 60);
            applyStreamDone(chatId, title, reportStudyId);
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
          setChatCache(prev => ({ ...prev, [chatId]: { messages: [], title: displayMsg.slice(0, 60) } }));
          setGlobalChats(prev => [chat, ...prev]);
          setView(v => ({ ...v, chatId }));
        }
        optimisticAppend(chatId, displayMsg);
        const res = await fetch(`${API}/global-chats/${chatId}/message/stream`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: USER_ID,
            message: msg,
            selected_studies: ctxStudies,
            ...(reportStudyId != null && { report_study_id: reportStudyId }),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error('Stream failed');
        await parseSSE(res, {
          onToken: ({ token }) => patchLast(chatId, m => ({ ...m, content: (m.content||'') + (token||'') })),
          onUi: (payload) => patchLast(chatId, m => ({ ...m, ui: payload, content: '' })),
          onDone: () => {
            const title = displayMsg.slice(0, 60);
            applyStreamDone(chatId, title, reportStudyId);
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
              <div className={`chat-messages${activeMsgs.some(m => m.ui?.kind === 'samples_report') ? ' chat-messages-wide' : ''}`}>
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
                      {['What are the key themes?','Who are the PIs?','Summarize the abstracts','What sample types were used?','/report 104 - Full study report']
                        .map(q => (
                          <button key={q} className="chat-starter" onClick={() => { setInput(q); taRef.current?.focus(); }}>{q}</button>
                        ))}
                    </div>
                  </div>
                ) : (
                  activeMsgs.map((m, i) => (
                    <div key={i} className={`msg-row ${m.role}${m.ui?.kind === 'samples_report' ? ' article' : ''}`}>
                      {m.role === 'assistant' && m.ui?.kind === 'samples_report' ? (
                        <SamplesReportBubble ui={m.ui} messageKey={`${view.chatId}-${i}`} />
                      ) : m.role === 'assistant' ? (
                        <div
                          className={`msg-bubble${m.isStreaming ? ' streaming' : ''}`}
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(marked.parse(m.content || ''))
                          }}
                        />
                      ) : (
                        <div className="msg-bubble">{m.content}</div>
                      )}
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
          {isChat && view.chatId && (chatCache[view.chatId]?.pinnedStudies || []).length > 0 && (
            <div className="composer-pins">
              <span className="composer-pins-label">Pinned:</span>
              {(chatCache[view.chatId]?.pinnedStudies || []).map(sid => (
                <span key={sid} className="composer-pin-chip">
                  Study {sid}
                  <button
                    className="composer-pin-x"
                    title="Unpin"
                    onClick={() => unpinStudy(view.chatId, sid)}
                  >×</button>
                </span>
              ))}
              {(() => {
                const cur = chatCache[view.chatId] || {};
                const pinned = (cur.pinnedStudies || []).length;
                const total = cur.totalStudiesInProject;
                return (total != null && total > pinned) ? (
                  <span className="composer-pins-hint">{pinned} of {total} studies in context</span>
                ) : null;
              })()}
            </div>
          )}
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
                <SamplesBrowser
                  samples={modalDetail.samples || []}
                  totalSamples={modalDetail.total_samples}
                  layout="two-pane"
                  fetchFields={async (sampleId) => {
                    const res = await apiFetch(`/studies/${modalStudy.study_id}/samples/${encodeURIComponent(sampleId)}`);
                    if (!res.ok) return null;
                    const d = await res.json();
                    return d.fields || null;
                  }}
                />
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