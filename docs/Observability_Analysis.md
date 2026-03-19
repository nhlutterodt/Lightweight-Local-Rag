---
doc_state: canonical
doc_owner: architecture
canonical_ref: docs/Observability_Analysis.md
last_reviewed: 2026-03-18
audience: engineering
---
# Observability Analysis

## Purpose

This document captures how the application currently handles logging, telemetry, health signals, and lightweight analytics. It is intended to support three outcomes:

1. decision making
2. reporting
3. debugging

It also defines the gaps between the current implementation and a more complete observability model.

## Scope

This analysis covers the current local application runtime as implemented in the Node.js bridge, PowerShell utilities, and React UI. It does not assume Azure-hosted monitoring services or external APM infrastructure.

## Implementation Anchors Reviewed

This document should be revised against implementation anchors, not against prior documentation alone.

For the current revision, the following anchors were reviewed directly:

- `gui/server/server.js`
- `gui/server/lib/queryLogger.js`
- `gui/server/lib/xmlLogger.js`
- `gui/server/lib/healthCheck.js`
- `gui/server/IngestionQueue.js`
- `gui/server/lib/documentParser.js`
- `gui/server/lib/integrityCheck.js`
- `gui/server/scripts/check-integrity.js`
- `gui/client/react-client/src/components/AnalyticsPanel.jsx`
- `gui/client/react-client/src/hooks/useRagApi.js`
- `PowerShell Scripts/XMLLogger.ps1`
- `PowerShell Scripts/ExecutionContext.ps1`
- `logs/query_log.v1.jsonl`
- `logs/bridge-log.xml`
- `PowerShell Scripts/Data/queue.json`
- `logs/perf-baseline.json`

When this document changes in the future, this section should be updated in the same edit so the reader can see which first-party runtime seams were actually re-verified.

## Current Signal Inventory

### 1. Query Telemetry

Primary source: `gui/server/server.js` and `gui/server/lib/queryLogger.js`

Current behavior:

- Every `/api/chat` request appends one JSONL record to `logs/query_log.v1.jsonl`.
- On v1 initialization, legacy `logs/query_log.jsonl` is rotated to `logs/archive/query_log.legacy.<yyyyMMdd-HHmmss>.jsonl`.
- Entries include timestamp, truncated query, `scoreSchemaVersion` (`v1`), `scoreType` (`normalized-relevance`), retrieval settings, and `lowConfidence`.
- Entries now include retrieval trace sets: `retrievedCandidates`, `approvedContext`, and `droppedCandidates` with `dropReason`.
- Entries include final `answerReferences` emitted after stream completion.
- Logging is intentionally fire-and-forget and not awaited in the request path.

Current strengths:

- Useful for retrieval tuning and model usage analysis.
- Cheap to write and easy to parse offline.
- Already captures some decision-support fields such as `chatModel`, `embeddingModel`, `topK`, `minScore`, and retrieval result scores.

Current limits:

- No correlation ID tying a query to downstream warnings, queue work, or UI actions.
- No explicit user/session concept.
- No response outcome fields such as success, failure type, or generation duration in the JSONL payload.
- Schema evolution is visible in practice; some existing records have blank `retrievalMode`.

### 2. Bridge and UI Event Logging

Primary source: `gui/server/server.js` and `gui/server/lib/xmlLogger.js`

Current behavior:

- `/api/log` writes XML entries through the bridge logger.
- The bridge logger writes a minimal `PowerShellLog` XML file named `bridge-log.xml`.
- Node request handling also emits `console.warn` and `console.error` messages for browse failures, metrics failures, RAG warnings, and chat exceptions.

Current strengths:

- Gives the UI and bridge a simple shared log sink.
- Compatible with the existing XML log ecosystem already used by PowerShell utilities.

Current limits:

- The Node XML logger schema is much simpler than the PowerShell XML logger schema.
- The bridge log does not include structured payload fields beyond level, category, and message.
- Console logs are not normalized, aggregated, or correlated with query telemetry.

### 3. PowerShell Execution Logging

Primary source: `PowerShell Scripts/XMLLogger.ps1` and `PowerShell Scripts/ExecutionContext.ps1`

Current behavior:

- PowerShell scripts can emit structured XML logs with schema version, session metadata, categories, levels, messages, and arbitrary data.
- `ExecutionContext` adds execution start, phase timing, checkpoints, warnings, and errors.
- Logs are stored in the project log directory and are used heavily by diagnostic and model-management scripts.

Current strengths:

- Richer structure than the bridge XML logger.
- Strong for debugging long-running operations and utility workflows.
- Already includes phase-level timing and contextual metadata.

Current limits:

- Separate schema and lifecycle from Node query telemetry.
- Not naturally joined to Node request IDs or queue job IDs.
- Better suited to script execution tracing than application-wide reporting.

### 4. Health and Operational Endpoints

Primary source: `gui/server/lib/healthCheck.js` and `gui/server/server.js`

Current behavior:

- `/api/health` returns a cached health summary for Ollama reachability, vector-store availability, and local disk status.
- `/api/index/metrics` returns collection-level vector index metadata and a coarse health state.
- `Server-Timing` headers expose `embed`, `search`, and `total` timings for chat requests.

Current strengths:

- Gives the UI enough state to surface local readiness and rough vector-store condition.
- Exposes a lightweight performance signal without adding a full metrics backend.

Current limits:

- Health is point-in-time state, not historical telemetry.
- Metrics are calculated on demand and are not retained as time series.
- Timing data is not persisted alongside the query record.

### 5. Queue and Ingestion Signals

Primary source: `gui/server/IngestionQueue.js`

Current behavior:

- Queue state is persisted in `PowerShell Scripts/Data/queue.json`.
- SSE updates stream queue changes to the UI.
- Internal debug counters track persistence writes, save requests, emitted update events, and deduplicated updates.

Current strengths:

- Useful for local troubleshooting of queue churn and persistence behavior.
- Supports operational visibility in the UI.

Current limits:

- Debug metrics are in memory and not surfaced as durable telemetry.
- No formal ingestion event stream or historical success/failure reporting.
- Chunking, read failures, skipped files, and embed failures are mostly exposed through console messages rather than a reportable schema.

### 6. UI Analytics Surface

Primary source: `gui/client/react-client/src/components/AnalyticsPanel.jsx`

Current behavior:

- The UI shows vector-index monitor status and ingestion queue state.
- The panel now also shows last-updated timestamps and short change summaries for metrics and queue updates.
- The panel remains focused on operational awareness rather than deeper analytical reporting.

Current strengths:

- Good for immediate local awareness.
- Low complexity.
- Gives operators a quick sense of when the visible state last changed and whether the latest refresh added, removed, or updated visible items.

Current limits:

- No trend views.
- No query-quality dashboard.
- No drill-down from visible problems to root-cause evidence.
- The update summaries are useful situational context, but they are still UI-derived summaries rather than a full debugging or reporting surface.

## Observed Baseline

Observed in the local workspace on 2026-03-15:

- legacy `logs/query_log.jsonl` exists and contains 41 historical query records.
- 17 of those 41 records are marked `lowConfidence`.
- Most existing records have blank `retrievalMode`, indicating a schema/version transition in the log history.
- The workspace also contains XML logs, queue state, manifests, performance snapshots, and report artifacts under `logs/` and `PowerShell Scripts/Data/`.

This is enough signal to perform a real baseline review before adding new instrumentation.

## Fitness By Outcome

### Decision Making

Current support:

- Model usage can be estimated from current `query_log.v1.jsonl` rows and legacy archives when historical comparison is needed.
- Retrieval confidence can be approximated using `lowConfidence`, `resultCount`, and top scores.
- Collection/index readiness can be checked with `/api/index/metrics`.

Gaps:

- No durable latency percentiles.
- No clear breakdown of successful answer quality versus merely successful retrieval.
- No session funnel or feature-usage analytics.
- No normalized change history for configuration, model switches, or retrieval-mode adoption.

### Reporting

Current support:

- Existing JSONL and XML logs can be parsed into offline reports.
- The project already has precedent for generated reports and summaries.

Gaps:

- No canonical report schema.
- No scheduled rollups for daily or weekly summaries.
- No single source that combines query, queue, health, and execution data.
- No documented KPI set for product or operational reporting.

### Debugging

Current support:

- PowerShell XML logs are strong for script-level troubleshooting.
- Node console warnings and errors expose many failure conditions.
- `Server-Timing` helps isolate retrieval latency.
- `/api/health` and `/api/index/metrics` quickly validate local dependencies.

Gaps:

- No request-to-request correlation across layers.
- No standardized error taxonomy.
- No durable storage of request timing, failure code, or exception class inside query telemetry.
- Documentation drift makes some debugging paths harder than they should be.

## Documentation Drift

The most important drift risk in this area is not frontmatter or indexing. It is narrative drift between observability docs and the implementation seams they describe.

Examples of current drift vectors:

- the UI analytics surface can evolve without the observability docs being refreshed
- new backend operational tooling, such as integrity scanning, can be added without being reflected in the observability inventory
- endpoint contracts may be corrected in one doc while older assumptions remain in another observability-focused doc

This matters because observability decisions depend on understanding the true signal path, not merely the most recently edited narrative.

## Key Gaps To Address

1. No unified telemetry model across Node, PowerShell, and UI.
2. No correlation IDs spanning query, queue, health, and background execution.
3. Separate schemas for JSONL query telemetry and XML debug logs.
4. Valuable latency data is exposed in headers but not stored for later analysis.
5. Queue and ingestion diagnostics are not retained in a report-friendly format.
6. Logging retention is configured, but enforcement is clearer for some file types than others.
7. The UI exposes status, but not historical trends or operator workflows.
8. Documentation drift obscures actual observability behavior.

## Recommended Analysis Plan

### Phase 1. Inventory and Baseline

Deliverables:

- observability matrix of sources, fields, sinks, retention, and consumers
- baseline summary from current `query_log.v1.jsonl`, legacy query-log archives when needed, XML logs, queue state, and vector metrics
- list of schema/version inconsistencies

Questions to answer:

- Which signals already exist and where are they written?
- Which signals are useful but currently stranded in console output?
- Which current logs are stable enough to treat as input data?

### Phase 2. Outcome Mapping

Deliverables:

- matrix mapping each current signal to decision making, reporting, debugging, or local-only troubleshooting
- prioritized list of missing KPIs

Questions to answer:

- What must a product or operator be able to answer in under five minutes?
- Which questions can be answered now, and which cannot?

### Phase 3. Telemetry Contract Design

Deliverables:

- canonical event taxonomy
- proposed shared fields for all major events
- correlation strategy for request ID, queue job ID, collection, model, and operation name

Minimum shared fields should include:

- timestamp
- event type
- severity
- request or operation ID
- collection
- chat model
- embedding model
- duration
- outcome
- error code

### Phase 4. Reporting Design

Deliverables:

- KPI definitions
- report specification for daily and weekly summaries
- proposal for derived datasets from raw logs

Recommended KPI groups:

- query volume
- low-confidence rate
- retrieval-mode adoption
- median and p95 embed/search/total latency
- ingestion success and failure counts
- queue backlog and completion time
- index health by collection

### Phase 5. Debugging Workflow Design

Deliverables:

- debugging playbooks for chat failures, low-confidence answers, model unavailability, corrupted indices, and ingestion failures
- source-to-symptom lookup table showing where to inspect first

The main goal is that one user-visible failure can be traced across:

1. UI action
2. API request
3. retrieval event
4. model invocation
5. queue or ingestion state if relevant
6. script execution details if PowerShell is involved

### Phase 6. Implementation Roadmap

Deliverables:

- phased engineering roadmap
- doc updates required for API and architecture references
- validation plan and backfill considerations for existing logs

Suggested rollout order:

1. fix docs drift
2. add correlation IDs
3. persist timing and outcome fields in query telemetry
4. formalize ingestion event logging
5. define report-generation scripts
6. expand UI analytics only after the telemetry contract is stable

## Recommended Success Criteria

The observability model is good enough when the team can reliably answer:

1. What are users asking and which models or retrieval modes are being used?
2. How often are answers low-confidence, slow, or operationally degraded?
3. Why did this specific request, ingestion job, or workflow fail?
4. Which collections, models, or settings are driving the most issues?
5. What changed over time after an instrumentation or retrieval adjustment?

## Immediate Next Actions

1. Create the observability matrix from the existing code paths and on-disk artifacts.
2. Keep `docs/API_REFERENCE.md`, `docs/Architecture_Design.md`, and the observability docs synchronized when implementation anchors change.
3. Define a shared telemetry contract for query, queue, ingestion, and error events.
4. Decide whether XML remains the debug format while JSONL becomes the reporting format, or whether a unified structured event format is preferred.
5. Add a small baseline-report script that summarizes current `query_log.v1.jsonl`, legacy archives when needed, and queue/index state.

## References

- `gui/server/server.js`
- `gui/server/lib/queryLogger.js`
- `gui/server/lib/xmlLogger.js`
- `gui/server/lib/healthCheck.js`
- `gui/server/IngestionQueue.js`
- `gui/client/react-client/src/components/AnalyticsPanel.jsx`
- `PowerShell Scripts/XMLLogger.ps1`
- `PowerShell Scripts/ExecutionContext.ps1`
- `config/project-config.psd1`
- `docs/Architecture_Design.md`
- `docs/API_REFERENCE.md`
- `docs/RAG_Copilot_Instructions.md`
