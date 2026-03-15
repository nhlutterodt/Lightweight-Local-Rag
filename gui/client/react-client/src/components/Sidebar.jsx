import React, { useEffect, useState } from 'react';
import AnalyticsPanel from './AnalyticsPanel';
import FolderBrowserModal from './FolderBrowserModal';

const STORAGE_KEYS = {
  collection: 'rag.sidebar.collection',
  ingestPath: 'rag.sidebar.ingestPath',
  clearOnQueue: 'rag.sidebar.clearPathOnQueue',
  recentPaths: 'rag.sidebar.recentPaths',
  recentCollections: 'rag.sidebar.recentCollections'
};

function readLocalStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function readArrayStorage(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore persistence failures (private mode/quota).
  }
}

function writeArrayStorage(key, value) {
  writeLocalStorage(key, JSON.stringify(value));
}

function updateRecentList(list, value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return list;
  const deduped = [trimmed, ...list.filter(item => item !== trimmed)];
  return deduped.slice(0, 8);
}

function Sidebar({ models, activeModel, setActiveModel, isConnected, isModelReady, metrics, queue, isWide, onEnqueue, onClearSession }) {
  const [collectionName, setCollectionName] = useState(() => readLocalStorage(STORAGE_KEYS.collection, 'TestIngest'));
  const [ingestPath, setIngestPath] = useState(() => readLocalStorage(STORAGE_KEYS.ingestPath, ''));
  const [clearPathOnQueue, setClearPathOnQueue] = useState(() => readLocalStorage(STORAGE_KEYS.clearOnQueue, 'false') === 'true');
  const [recentPaths, setRecentPaths] = useState(() => readArrayStorage(STORAGE_KEYS.recentPaths));
  const [recentCollections, setRecentCollections] = useState(() => readArrayStorage(STORAGE_KEYS.recentCollections));
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [enqueueError, setEnqueueError] = useState(null);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.collection, collectionName);
  }, [collectionName]);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.ingestPath, ingestPath);
  }, [ingestPath]);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.clearOnQueue, clearPathOnQueue ? 'true' : 'false');
  }, [clearPathOnQueue]);

  useEffect(() => {
    writeArrayStorage(STORAGE_KEYS.recentPaths, recentPaths);
  }, [recentPaths]);

  useEffect(() => {
    writeArrayStorage(STORAGE_KEYS.recentCollections, recentCollections);
  }, [recentCollections]);

  const handleEnqueue = async () => {
    setEnqueueError(null);
    if (!ingestPath || !collectionName) {
      setEnqueueError("Path and collection are required.");
      return;
    }
    try {
      if (onEnqueue) {
        await onEnqueue(ingestPath, collectionName);
        setRecentPaths((prev) => updateRecentList(prev, ingestPath));
        setRecentCollections((prev) => updateRecentList(prev, collectionName));
        if (clearPathOnQueue) {
          setIngestPath('');
        }
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
            list="recentCollections"
          />
          <datalist id="recentCollections">
            {recentCollections.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
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
              placeholder="C:\\MyDocuments"
              list="recentPaths"
              style={{ flex: 1 }} 
            />
            <datalist id="recentPaths">
              {recentPaths.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={clearPathOnQueue}
              onChange={(e) => setClearPathOnQueue(e.target.checked)}
            />
            Clear path after successful queue
          </label>
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
