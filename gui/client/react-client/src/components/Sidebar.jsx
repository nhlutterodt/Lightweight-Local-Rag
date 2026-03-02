import React from 'react';

function Sidebar({ models, activeModel, setActiveModel, isConnected, metrics }) {
  return (
    <aside className="sidebar glass">
      <header>
        <h1>Local RAG</h1>
        <p>v2.1 Pro</p>
      </header>
      
      <nav>
        <div className="nav-item">
          <label>AI Model</label>
          <select 
            id="modelSelect" 
            value={activeModel} 
            onChange={(e) => setActiveModel(e.target.value)}
          >
            {models.length > 0 ? (
              models.map(m => (
                <option key={m.name} value={m.name}>
                  {m.name} ({(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)
                </option>
              ))
            ) : (
              <option value="llama3">Llama 3 (Default)</option>
            )}
          </select>
        </div>
        
        <div className="nav-item">
          <label>Collection</label>
          <input type="text" id="collectionName" defaultValue="TestIngest" placeholder="Collection Name..." />
        </div>
        
        <div className="nav-item">
          <label>Status</label>
          <div 
            id="connectionStatus" 
            className={`status-indicator ${isConnected ? 'status-online' : 'status-offline'}`}
          >
            {isConnected ? 'System Online' : 'Checking Ollama...'}
          </div>
        </div>

        <div className="nav-divider"></div>

        <div className="nav-item">
          <label>Vectorize New Data</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" id="ingestPath" placeholder="C:\MyDocuments" style={{ flex: 1 }} />
            <button id="browseFolderBtn" className="btn-secondary" style={{ marginTop: 0, padding: '0 12px', width: 'auto' }} data-tooltip="Browse for a folder">📁</button>
          </div>
          <div className="ingest-actions" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button id="enqueueIngest" className="btn-primary" style={{ flex: 1 }} data-tooltip="Add to queue for background processing">➕ Queue</button>
          </div>
        </div>
        <div className="nav-divider"></div>

        <div className="nav-item">
          <label>Vector Index Monitor</label>
          <div id="indexMonitor" className="index-monitor-box">
            {metrics.length === 0 ? (
              <div className="monitor-empty">No indices found</div>
            ) : (
               metrics.map(m => (
                 <div key={m.name} className="monitor-item">
                    <div className="monitor-header">
                      <span className="monitor-name" title={m.name}>{m.name}</span>
                      <span className={`monitor-health ${m.health === "CORRUPT" ? "corrupt" : ""}`}>{m.health}</span>
                    </div>
                 </div>
               ))
            )}
          </div>
        </div>
        <div className="nav-divider"></div>

        <div className="nav-item">
          <label>Ingestion Queue</label>
          <div id="queueManager" className="queue-manager-box">
            <div className="queue-empty">Queue is empty</div>
          </div>
        </div>
      </nav>
      
      <footer>
        <button id="clearChat" className="btn-secondary" data-tooltip="Clear the current conversation history">Clear Session</button>
      </footer>
    </aside>
  );
}

export default Sidebar;
