import React from 'react';

function formatUpdateTime(value) {
  if (!value) return 'Awaiting first update';

  try {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Awaiting first update';
  }
}

function buildMetricsSummary(metrics, metricsState) {
  if (metricsState.status === 'loading') {
    return 'Loading vector index metrics.';
  }

  if (metricsState.status === 'error') {
    return `Vector index metrics unavailable. ${metricsState.error}`.trim();
  }

  if (metrics.length === 0) {
    return 'No vector indices found.';
  }

  return `${metrics.length} vector ${metrics.length === 1 ? 'index' : 'indices'} loaded.`;
}

function buildQueueSummary(queue, queueState) {
  if (queueState.status === 'loading') {
    return 'Loading ingestion queue.';
  }

  if (queueState.status === 'error') {
    return `Ingestion queue unavailable. ${queueState.error}`.trim();
  }

  if (queue.length === 0) {
    return 'Ingestion queue is empty.';
  }

  return `${queue.length} ${queue.length === 1 ? 'job' : 'jobs'} in the ingestion queue.`;
}

function AnalyticsPanel({ metrics, queue, metricsState, queueState }) {
  const metricsSummary = buildMetricsSummary(metrics, metricsState);
  const queueSummary = buildQueueSummary(queue, queueState);

  return (
    <>
      <section className="nav-item" aria-labelledby="indexMonitorLabel">
        <span className="field-label" id="indexMonitorLabel">Vector Index Monitor</span>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {metricsSummary}
        </p>
        <div id="indexMonitor" className="index-monitor-box" aria-describedby="indexMonitorSummary">
          <div id="indexMonitorSummary" className="panel-state-summary">{metricsSummary}</div>
          <div className="panel-change-summary">
            <time dateTime={metricsState.lastUpdated || ''}>Last updated: {formatUpdateTime(metricsState.lastUpdated)}</time>
            <span>{metricsState.changeSummary}</span>
          </div>
          {metricsState.status === 'loading' ? (
            <div className="monitor-empty monitor-state monitor-loading">Loading index metrics...</div>
          ) : metricsState.status === 'error' ? (
            <div className="monitor-empty monitor-state monitor-error">Unable to load indices. {metricsState.error}</div>
          ) : metrics.length === 0 ? (
            <div className="monitor-empty monitor-state monitor-empty-state">No indices found</div>
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
      </section>
      
      <div className="nav-divider"></div>

      <section className="nav-item" aria-labelledby="queueManagerLabel">
        <span className="field-label" id="queueManagerLabel">Ingestion Queue</span>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {queueSummary}
        </p>
        <div id="queueManager" className="queue-manager-box" aria-describedby="queueManagerSummary">
          <div id="queueManagerSummary" className="panel-state-summary">{queueSummary}</div>
          <div className="panel-change-summary">
            <time dateTime={queueState.lastUpdated || ''}>Last updated: {formatUpdateTime(queueState.lastUpdated)}</time>
            <span>{queueState.changeSummary}</span>
          </div>
          {queueState.status === 'loading' ? (
            <div className="queue-empty queue-state queue-loading">Loading queue...</div>
          ) : queueState.status === 'error' ? (
            <div className="queue-empty queue-state queue-error">Unable to load queue. {queueState.error}</div>
          ) : queue.length === 0 ? (
            <div className="queue-empty queue-state queue-empty-state">Queue is empty</div>
          ) : (
            queue.map((q) => (
               <div key={`${q.path}-${q.status}-${q.updatedAt || ''}`} className={`queue-item ${String(q.status || '').toLowerCase()}`}>
                 <div className="queue-filename">{q.path.split(/[\\/]/).pop()}</div>
                 <small className="queue-status-text">{q.status}</small>
               </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

export default AnalyticsPanel;
