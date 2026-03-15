import React from 'react';

function ConnectionStatus({ isConnected, isModelReady }) {
  const statusClass = !isConnected ? 'status-offline' : (isModelReady ? 'status-online' : 'status-warning');
  const statusText = !isConnected
    ? 'Checking Ollama...'
    : (isModelReady ? 'System Online' : 'Ollama reachable; model setup needed');

  return (
    <div className="nav-item">
      <span className="field-label" id="connectionStatusLabel">Status</span>
      <div
        id="connectionStatus"
        role="status"
        aria-live="polite"
        aria-labelledby="connectionStatusLabel"
        className={`status-indicator ${statusClass}`}
      >
        {statusText}
      </div>
    </div>
  );
}

export default ConnectionStatus;
