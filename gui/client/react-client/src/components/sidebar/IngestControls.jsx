import React from 'react';
import FolderBrowserModal from '../FolderBrowserModal';

function IngestControls({
  ingestPath,
  setIngestPath,
  clearPathOnQueue,
  setClearPathOnQueue,
  recentPaths,
  enqueueError,
  onEnqueue,
  isConnected,
  isBrowseOpen,
  setIsBrowseOpen,
}) {
  return (
    <div className="nav-item">
      <label htmlFor="ingestPath">Vectorize New Data</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          id="ingestPath"
          value={ingestPath}
          onChange={(event) => setIngestPath(event.target.value)}
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
          type="button"
          className="btn-secondary"
          style={{ marginTop: 0, padding: '0 12px', width: 'auto' }}
          data-tooltip="Browse for a folder"
          aria-label="Browse for a folder"
          aria-haspopup="dialog"
          aria-controls="folder-browser-dialog"
          aria-expanded={isBrowseOpen}
          onClick={() => setIsBrowseOpen(true)}
        >
          📁
        </button>
      </div>
      <div className="ingest-actions" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <button
          id="enqueueIngest"
          type="button"
          className="btn-primary"
          style={{ flex: 1 }}
          data-tooltip="Add to queue for background processing"
          onClick={onEnqueue}
          disabled={!isConnected || !ingestPath}
        >
          ➕ Queue
        </button>
      </div>
      <label htmlFor="clearPathOnQueue" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.8rem' }}>
        <input
          id="clearPathOnQueue"
          type="checkbox"
          checked={clearPathOnQueue}
          onChange={(event) => setClearPathOnQueue(event.target.checked)}
        />
        Clear path after successful queue
      </label>
      {enqueueError && <div style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '5px' }}>{enqueueError}</div>}

      <FolderBrowserModal
        isOpen={isBrowseOpen}
        onClose={() => setIsBrowseOpen(false)}
        initialPath={ingestPath}
        onSelect={(path) => {
          setIngestPath(path);
          setIsBrowseOpen(false);
        }}
      />
    </div>
  );
}

export default IngestControls;
