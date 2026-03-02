import React from 'react';

function AnalyticsPanel({ metrics, queue }) {
  return (
    <>
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
          {queue.length === 0 ? (
            <div className="queue-empty">Queue is empty</div>
          ) : (
            queue.map((q, idx) => (
               <div key={idx} className="queue-item" style={{ marginBottom: '8px', fontSize: '0.85rem' }}>
                 <div style={{ color: 'var(--text-main)' }}>{q.path.split(/[\\/]/).pop()}</div>
                 <small style={{ color: 'var(--accent-primary)' }}>{q.status}</small>
               </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default AnalyticsPanel;
