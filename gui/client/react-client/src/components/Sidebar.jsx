import React from 'react';
import AnalyticsPanel from './AnalyticsPanel';

function Sidebar({ models, activeModel, setActiveModel, isConnected, metrics, queue, isWide }) {
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

        {!isWide && <AnalyticsPanel metrics={metrics} queue={queue} />}

      </nav>
      
      <footer>
        <button id="clearChat" className="btn-secondary" data-tooltip="Clear the current conversation history">Clear Session</button>
      </footer>
    </aside>
  );
}

export default Sidebar;
