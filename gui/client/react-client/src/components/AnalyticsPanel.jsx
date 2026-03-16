import React, { useEffect, useRef, useState } from 'react';

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

function focusAndScrollElement(element) {
  if (!element) return false;

  element.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  element.focus?.({ preventScroll: true });
  return true;
}

function AnalyticsPanel({ metrics, queue, metricsState, queueState, operationalActions = [] }) {
  const metricsSummary = buildMetricsSummary(metrics, metricsState);
  const queueSummary = buildQueueSummary(queue, queueState);
  const [highlightedQueueEntityId, setHighlightedQueueEntityId] = useState('');
  const clearHighlightTimerRef = useRef(null);

  useEffect(() => () => {
    if (clearHighlightTimerRef.current) {
      window.clearTimeout(clearHighlightTimerRef.current);
    }
  }, []);

  const highlightQueueEntity = (entityId) => {
    if (!entityId) return;

    setHighlightedQueueEntityId(entityId);
    if (clearHighlightTimerRef.current) {
      window.clearTimeout(clearHighlightTimerRef.current);
    }

    clearHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedQueueEntityId('');
      clearHighlightTimerRef.current = null;
    }, 5000);
  };

  const navigateToActionTarget = (action) => {
    const target = action?.target;
    if (!target) return;

    if (target.section === 'index') {
      const indexRegion = document.getElementById('indexMonitor');
      focusAndScrollElement(indexRegion);
      return;
    }

    if (target.section === 'chat') {
      const chatRegion = document.getElementById('chatWindow');
      focusAndScrollElement(chatRegion);
      return;
    }

    if (target.section !== 'queue') {
      return;
    }

    const queueRegion = document.getElementById('queueManager');
    focusAndScrollElement(queueRegion);

    if (!target.entityId) {
      return;
    }

    const queueItems = Array.from(document.querySelectorAll('[data-queue-entity-id]'));
    const linkedQueueItem = queueItems.find((item) => item.getAttribute('data-queue-entity-id') === target.entityId);

    if (!linkedQueueItem) {
      return;
    }

    highlightQueueEntity(target.entityId);
    focusAndScrollElement(linkedQueueItem);
  };

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
               <div
                 key={q.entityId || q.id || q.path}
                 className={`queue-item ${String(q.status || '').toLowerCase()} ${highlightedQueueEntityId && highlightedQueueEntityId === (q.entityId || q.id || q.path) ? 'is-linked-highlight' : ''}`}
                 data-queue-entity-id={q.entityId || q.id || q.path}
                 tabIndex={-1}
               >
                 <div className="queue-filename">{q.path ? q.path.split(/[\\/]/).pop() : 'Unknown job'}</div>
                 <small className="queue-status-text">{q.status}</small>
               </div>
            ))
          )}
        </div>
      </section>

      <div className="nav-divider"></div>

      <section className="nav-item" aria-labelledby="operationsHistoryLabel">
        <span className="field-label" id="operationsHistoryLabel">Recent Operational Actions</span>
        <div className="queue-manager-box" aria-live="polite">
          {operationalActions.length === 0 ? (
            <div className="queue-empty queue-state queue-empty-state">No recent user actions.</div>
          ) : (
            operationalActions.map((action) => (
              <article key={action.id} className={`operation-item operation-${action.status || 'info'}`}>
                <time className="operation-time" dateTime={action.timestamp}>
                  {formatUpdateTime(action.timestamp)}
                </time>
                <p className="operation-message">{action.message}</p>
                {action.target && (
                  <button
                    type="button"
                    className="operation-link-button"
                    onClick={() => navigateToActionTarget(action)}
                  >
                    {action.target.label || 'Open related item'}
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}

export default AnalyticsPanel;
