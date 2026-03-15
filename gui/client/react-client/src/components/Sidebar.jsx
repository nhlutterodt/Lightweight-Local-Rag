import React, { useState } from 'react';
import AnalyticsPanel from './AnalyticsPanel';
import FolderBrowserModal from './FolderBrowserModal';

function Sidebar({ models, activeModel, setActiveModel, isConnected, isModelReady, metrics, queue, isWide, onEnqueue, onClearSession }) {
  const [collectionName, setCollectionName] = useState("TestIngest");
  const [ingestPath, setIngestPath] = useState("");
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [enqueueError, setEnqueueError] = useState(null);

  const handleEnqueue = async () => {
    setEnqueueError(null);
    if (!ingestPath || !collectionName) {
      setEnqueueError("Path and collection are required.");
      return;
    }
    try {
      if (onEnqueue) {
        await onEnqueue(ingestPath, collectionName);
        setIngestPath(""); // clear on success
      }
    } catch (err) {
      setEnqueueError(err.message);
    }
  };
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
          <input 
            type="text" 
            id="collectionName" 
            value={collectionName} 
            onChange={(e) => setCollectionName(e.target.value)} 
            placeholder="Collection Name..." 
          />
        </div>
        
        <div className="nav-item">
          <label>Status</label>
          <div 
            id="connectionStatus" 
            className={`status-indicator ${!isConnected ? 'status-offline' : (isModelReady ? 'status-online' : 'status-warning')}`}
          >
            {!isConnected
              ? 'Checking Ollama...'
              : (isModelReady ? 'System Online' : 'Ollama reachable; model setup needed')}
          </div>
        </div>

        <div className="nav-divider"></div>

        <div className="nav-item">
          <label>Vectorize New Data</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              id="ingestPath" 
              value={ingestPath}
              onChange={(e) => setIngestPath(e.target.value)}
              placeholder="C:\MyDocuments" 
              style={{ flex: 1 }} 
            />
            <button 
              id="browseFolderBtn" 
              className="btn-secondary" 
              style={{ marginTop: 0, padding: '0 12px', width: 'auto' }} 
              data-tooltip="Browse for a folder"
              onClick={() => setIsBrowseOpen(true)}
            >
              📁
            </button>
          </div>
          <div className="ingest-actions" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button 
              id="enqueueIngest" 
              className="btn-primary" 
              style={{ flex: 1 }} 
              data-tooltip="Add to queue for background processing"
              onClick={handleEnqueue}
              disabled={!isConnected || !ingestPath}
            >
              ➕ Queue
            </button>
          </div>
          {enqueueError && <div style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '5px' }}>{enqueueError}</div>}
        </div>
        <div className="nav-divider"></div>

        {!isWide && <AnalyticsPanel metrics={metrics} queue={queue} />}

      </nav>
      
      <footer>
        <button id="clearChat" className="btn-secondary" data-tooltip="Clear the current conversation history" onClick={onClearSession}>Clear Session</button>
      </footer>
      
      <FolderBrowserModal 
        isOpen={isBrowseOpen} 
        onClose={() => setIsBrowseOpen(false)} 
        initialPath={ingestPath}
        onSelect={(path) => {
          setIngestPath(path);
          setIsBrowseOpen(false);
        }} 
      />
    </aside>
  );
}

export default Sidebar;
