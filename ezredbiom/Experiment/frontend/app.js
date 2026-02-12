const { useState } = React;

const API_BASE = 'http://localhost:5001/api';

function App() {
    const [query, setQuery] = useState('');
    const [studies, setStudies] = useState([]);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState(null);
    const [showSql, setShowSql] = useState(false);
    const [sqlQuery, setSqlQuery] = useState(null);

    const exampleQueries = [
        "soil microbiome",
        "gut bacteria",
        "ocean samples",
        "Rob Knight",
        "UC San Diego"
    ];

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

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            setStudies(data.results);
            setSqlQuery(data.sql_query);

        } catch (err) {
            setError(err.message);
        } finally {
            setSearching(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const clearResults = () => {
        setStudies([]);
        setQuery('');
        setSqlQuery(null);
    };
    return (
        <>
            <div className="header">
                <div className="header-content">
                    <h1>Qiita Study Explorer</h1>
                    <p className="subtitle">Discover and analyze microbiome research</p>
                </div>
            </div>

            <div className="search-section">
                <div className="search-box">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Search studies by keywords, author, or topic..."
                    />
                    <button 
                        className="btn" 
                        onClick={handleSearch} 
                        disabled={searching || !query.trim()}
                    >
                        {searching ? '⏳ Searching...' : '🔍 Search'}
                    </button>
                    {studies.length > 0 && (
                        <button 
                            className="btn btn-secondary" 
                            onClick={clearResults}
                        >
                            ✕ Clear
                        </button>
                    )}
                </div>

                <div className="examples">
                    <span className="example-label">Quick search:</span>
                    {exampleQueries.map((example, idx) => (
                        <span
                            key={idx}
                            className="example-tag"
                            onClick={() => setQuery(example)}
                        >
                            {example}
                        </span>
                    ))}
                </div>

                {sqlQuery && (
                    <label className="toggle-sql">
                        <input
                            type="checkbox"
                            checked={showSql}
                            onChange={(e) => setShowSql(e.target.checked)}
                        />
                        Show generated SQL query
                    </label>
                )}
            </div>

            {showSql && sqlQuery && (
                <div className="sql-query">
                    <span className="sql-label">Generated SQL Query</span>
                    <div>WHERE {sqlQuery.where_clause}</div>
                    {sqlQuery.params && sqlQuery.params.length > 0 && (
                        <div style={{marginTop: '1rem', opacity: 0.7}}>
                            Parameters: {JSON.stringify(sqlQuery.params)}
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="error">
                    <span style={{fontSize: '1.5rem'}}>⚠️</span>
                    <div>
                        <strong>Error:</strong> {error}
                    </div>
                </div>
            )}

            {searching && (
                <div className="loading">
                    <div className="spinner"></div>
                    <p>Searching through Qiita studies...</p>
                </div>
            )}

            {!searching && studies.length > 0 ? (
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
                                    <span className="study-id-badge">
                                        ID {study.study_id}
                                    </span>
                                </div>

                                <h3 className="study-title">{study.study_title}</h3>
                                
                                <p className="study-abstract">
                                    {study.study_abstract || 'No abstract available.'}
                                </p>

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
            ) : !searching && studies.length === 0 && query ? (
                <div className="empty-state">
                    <div className="empty-icon">🔬</div>
                    <h3 className="empty-title">No studies found</h3>
                    <p className="empty-text">Try different keywords or refine your search</p>
                </div>
            ) : !searching && studies.length === 0 && !query ? (
                <div className="empty-state">
                    <div className="empty-icon">🔍</div>
                    <h3 className="empty-title">Start Searching</h3>
                    <p className="empty-text">Enter keywords to search through the Qiita microbiome database</p>
                </div>
            ) : null}

            <div className="footer">
                Powered by <a href="https://github.com/qiita-spots/qiita" target="_blank" rel="noopener noreferrer">Qiita</a> microbiome database
            </div>
        </>
    );
        
}

ReactDOM.render(<App />, document.getElementById('root'));