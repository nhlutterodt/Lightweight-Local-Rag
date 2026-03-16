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
      <div className="ingest-input-row">
        <input
          type="text"
          id="ingestPath"
          value={ingestPath}
          onChange={(event) => setIngestPath(event.target.value)}
          placeholder="C:\\MyDocuments"
          list="recentPaths"
          className="ingest-path-input"
        />
        <datalist id="recentPaths">
          {recentPaths.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <button
          id="browseFolderBtn"
          type="button"
          className="btn-secondary ingest-browse-button"
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
      <div className="ingest-actions">
        <button
          id="enqueueIngest"
          type="button"
          className="btn-primary ingest-queue-button"
          data-tooltip="Add to queue for background processing"
          onClick={onEnqueue}
          disabled={!isConnected || !ingestPath}
        >
          ➕ Queue
        </button>
      </div>
      <label htmlFor="clearPathOnQueue" className="ingest-clear-toggle-label">
        <input
          id="clearPathOnQueue"
          type="checkbox"
          checked={clearPathOnQueue}
          onChange={(event) => setClearPathOnQueue(event.target.checked)}
        />
        Clear path after successful queue
      </label>
      {enqueueError && <div className="ingest-error-message">{enqueueError}</div>}

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
