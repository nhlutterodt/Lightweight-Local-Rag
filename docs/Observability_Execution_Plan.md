---
doc_state: canonical
doc_owner: architecture
canonical_ref: docs/Observability_Execution_Plan.md
last_reviewed: 2026-03-15
audience: engineering
---
# Observability Execution Plan

## Purpose

This document turns `docs/Observability_Analysis.md` into an execution plan for improving observability in the current local application runtime.

The plan is intentionally implementation-aware.

It is based on:

1. current code paths in the Node.js bridge, React client, and PowerShell utilities
2. current test coverage in the repo
3. current on-disk observability artifacts already present in the workspace

The goal is not to add telemetry for its own sake.

The goal is to make the system measurably better at:

1. decision making
2. reporting
3. debugging

## Companion Documents

This plan depends on:

- `docs/Observability_Analysis.md`
- `docs/API_REFERENCE.md`
- `docs/Architecture_Design.md`
- `docs/RAG_Copilot_Instructions.md`

## Planning Standard

Each phase in this plan declares:

- scope
- primary files
- allowed changes
- explicit non-goals
- concrete repo work
- evidence and rationale
- tests required
- validation commands
- rollback condition
- promotion gate

This plan is designed to be practical, observable, and reversible.

## Current Ground Truth In The Repo

The execution plan is anchored to the following implementation seams.

## Current Runtime Signal Sources

### Query Telemetry

- `gui/server/server.js`
- `gui/server/lib/queryLogger.js`
- `logs/query_log.jsonl`

### Bridge And UI Log Sink

- `gui/server/server.js`
- `gui/server/lib/xmlLogger.js`
- `PowerShell Scripts/Data/bridge-log.xml`

### Health And Metrics

- `gui/server/lib/healthCheck.js`
- `GET /api/health`
- `GET /api/index/metrics`
- `Server-Timing` header on `POST /api/chat`

### Queue And Ingestion State

- `gui/server/IngestionQueue.js`
- `PowerShell Scripts/Data/queue.json`
- collection manifests in `PowerShell Scripts/Data/*.manifest.json`

### PowerShell Diagnostic Logging

- `PowerShell Scripts/XMLLogger.ps1`
- `PowerShell Scripts/ExecutionContext.ps1`
- XML logs under `logs/`

### UI Exposure

- `gui/client/react-client/src/components/AnalyticsPanel.jsx`
- `gui/client/react-client/src/hooks/useRagApi.js`

## Current Test And Validation Seams

### Server Tests

- `gui/server/tests/queryLogger.test.js`
- `gui/server/tests/xmlLogger.test.js`
- `gui/server/tests/healthCheck.test.js`
- `gui/server/tests/retrieval.behavior.test.js`
- `gui/server/tests/sse.contract.test.js`
- `gui/server/tests/api.routes.test.js`
- `gui/server/tests/IngestionQueue.test.js`
- `gui/server/tests/api.e2e.test.js`

### PowerShell Tests

- `PowerShell Scripts/Tests/XMLLogger.Tests.ps1`
- `PowerShell Scripts/Tests/PathUtils.Tests.ps1`
- `PowerShell Scripts/Tests/ErrorIntegration.Tests.ps1`

### Documentation Validation

- `scripts/Validate-Docs.ps1`

## Observed Artifact Evidence

Observed in the workspace on 2026-03-15:

### Query Telemetry Baseline

- `logs/query_log.jsonl` contains 41 records.
- 17 of 41 records are `lowConfidence`, or 41.5%.
- 39 of 41 records have blank or missing `retrievalMode`, or 95.1%.
- Average `resultCount` is 3.22.
- Logged chat models are `llama3.1:8b` (25), `dolphin3:latest` (12), and `dolphin3-llama3.1:latest` (4).
- Logged `minScore` values split across `0.5` (39) and `0.003` (2), which is direct evidence of config and schema drift across log history.

### Bridge XML Baseline

- `bridge-log.xml` contains 62 entries.
- Levels: `SUCCESS` 45, `INFO` 9, `ERROR` 8.
- Categories: `SESSION` 45, `QUEUE` 9, `CHAT` 8.
- The bridge XML is useful, but currently coarse. Most entries are session heartbeats or queue/chat summaries rather than deeply structured debug events.

### Queue State Baseline

- `queue.json` contains 22 jobs, all currently `completed`.
- Average observed duration is 2203.91 ms.
- Observed p95 duration is 15260 ms.
- The queue state has usable operational fields today: `addedAt`, `startedAt`, `completedAt`, `status`, `progress`, `collection`, and `path`.

### Performance Baseline

From `logs/perf-baseline.json`:

- `VectorStore Load` median: 1.3 ms
- `findNearest` median: 368.3 microseconds at 319 vectors
- `Ollama Embed Round-Trip` median: 18.2 ms
- `Config spawnSync Cold-Start` median: 318.5 ms

This baseline is important because observability changes must not accidentally reintroduce cold-path behavior or block the hot path.

## Execution Rules

The following rules apply across all phases.

1. Do not block the `/api/chat` hot path on log flushing or report generation.
2. Do not expand raw prompt logging beyond the current truncation behavior without an explicit privacy review.
3. Do not introduce per-token telemetry writes for streamed response chunks.
4. Do not create a second hidden telemetry schema without a migration and documentation story.
5. Every new telemetry field must have a documented purpose, type, and owner.
6. Every new durable artifact must have a retention or cleanup strategy.
7. Every phase must preserve the current `/api/chat` SSE contract unless tests and docs are updated in the same change.
8. Every phase must keep `/api/health` lightweight and cache-friendly.
9. Every phase must preserve the current security controls around localhost binding, CORS, path validation, and browse error contracts.
10. Every phase must define how to validate the change locally using existing repo tooling.

## Delivery Strategy Overview

The rollout should proceed through seven phases.

1. Phase 0: Baseline Freeze And Evidence Capture
2. Phase 1: Shared Telemetry Vocabulary And Event Contract
3. Phase 2: Correlation IDs And Outcome Taxonomy
4. Phase 3: Runtime Instrumentation Upgrade
5. Phase 4: Derived Reporting And Rollups
6. Phase 5: Operator-Facing Debugging Workflow
7. Phase 6: Retention, Hygiene, And Drift Prevention

Each phase is intentionally narrow.

## Phase 0: Baseline Freeze And Evidence Capture

## Scope

Create a reliable starting point by formalizing the current observability baseline, sample schemas, and artifact inventory before adding new instrumentation.

## Primary Files

- `docs/Observability_Analysis.md`
- new baseline or inventory script under `scripts/` or `gui/server/scripts/`
- `logs/query_log.jsonl`
- `logs/bridge-log.xml`
- `PowerShell Scripts/Data/queue.json`
- `logs/perf-baseline.json`

## Allowed Changes

- add a baseline summary script
- add a checked-in baseline snapshot document or machine-readable artifact
- add field inventory notes to docs
- add non-invasive parsing helpers for current artifacts

## Explicit Non-Goals

- no new runtime telemetry yet
- no schema mutations yet
- no UI changes yet
- no endpoint changes yet

## Concrete Repo Work

1. Add a baseline-generation script that summarizes current query logs, bridge XML, queue state, and perf baseline.
2. Capture the current field inventory for `query_log.jsonl`, `bridge-log.xml`, and `queue.json`.
3. Identify parse hazards in current data such as missing `retrievalMode` or mixed threshold values.
4. Record the baseline snapshot in a stable document or generated artifact that future phases can compare against.

## Evidence And Rationale

- The current query telemetry already shows strong schema drift: 95.1% blank `retrievalMode`.
- The bridge XML is active but low-detail, with 45 session entries dominating the sample.
- Queue timings already exist implicitly in `queue.json`; they should be harvested before changing the schema.

## Tests Required

- test the baseline parser against current workspace artifacts if the script is committed
- ensure the parser tolerates missing or legacy fields without fatal failure

## Validation Commands

- `pwsh ./scripts/Validate-Docs.ps1`
- command for the new baseline script once introduced

## Rollback Condition

Rollback Phase 0 if baseline tooling cannot parse current first-party artifacts without manual repair.

## Promotion Gate

Phase 0 is complete only when:

- the team has a committed baseline summary
- current telemetry fields are inventoried
- legacy-field drift is explicitly documented

## Phase 1: Shared Telemetry Vocabulary And Event Contract

## Scope

Define the canonical telemetry contract the runtime will use going forward.

## Primary Files

- `docs/Observability_Analysis.md`
- `docs/Observability_Execution_Plan.md`
- new contract doc if needed, such as `docs/OBSERVABILITY_CONTRACT.md`
- `gui/server/lib/queryLogger.js`
- `gui/server/server.js`
- `PowerShell Scripts/XMLLogger.ps1`
- `PowerShell Scripts/ExecutionContext.ps1`

## Allowed Changes

- add shared vocabulary documentation
- add a contract module or constants file
- add schema comments or helper builders

## Explicit Non-Goals

- no UI analytics feature work yet
- no endpoint expansion yet
- no broad log migration yet

## Concrete Repo Work

1. Define a canonical event vocabulary for:
   - query events
   - queue lifecycle events
   - ingestion file events
   - health snapshot events
   - error events
   - operator/UI interaction events
2. Define required shared fields for all new structured events:
   - `timestamp`
   - `eventType`
   - `severity`
   - `requestId` or `operationId`
   - `collection`
   - `chatModel`
   - `embeddingModel`
   - `durationMs`
   - `outcome`
   - `errorCode`
3. Define which fields are durable, optional, or debug-only.
4. Decide the format boundary:
   - JSONL remains the primary reporting-friendly event format
   - XML remains acceptable for PowerShell debug and execution traces
5. Define a versioning approach for future query log and event schema changes.

## Evidence And Rationale

- `query_log.jsonl` is already parse-friendly and should remain the easiest reporting source.
- PowerShell XML logs are richer for execution tracing and should not be discarded casually.
- The current bridge XML path is minimal; without a shared contract it will keep diverging from the rest of the runtime.

## Tests Required

- extend `gui/server/tests/queryLogger.test.js` if event builders or schema enforcement are added
- extend PowerShell XML logger tests only if contract helpers alter the XML shape

## Validation Commands

- `Set-Location gui/server; npm test -- queryLogger.test.js`
- `pwsh ./scripts/Validate-Docs.ps1`

## Rollback Condition

Rollback Phase 1 if the proposed contract requires immediate breaking changes to existing logs before migration tooling exists.

## Promotion Gate

Phase 1 is complete only when:

- the event vocabulary is documented
- shared fields are named and typed
- JSONL versus XML responsibilities are explicit

## Phase 2: Correlation IDs And Outcome Taxonomy

## Scope

Introduce end-to-end correlation so one user-visible event can be traced through chat, queue, ingestion, health, and utility workflows.

## Primary Files

- `gui/server/server.js`
- new helper module such as `gui/server/lib/requestContext.js`
- `gui/server/lib/queryLogger.js`
- `gui/server/IngestionQueue.js`
- `PowerShell Scripts/ExecutionContext.ps1`

## Allowed Changes

- add correlation ID generation and propagation
- add standardized `outcome` and `errorCode` fields
- add request or job IDs to logs and responses where safe

## Explicit Non-Goals

- no new dashboard yet
- no report generation yet
- no large UI redesign

## Concrete Repo Work

1. Generate a `requestId` for `/api/chat`, `/api/browse`, `/api/log`, and `/api/queue` request lifecycles.
2. Propagate `job.id` as the ingestion correlation key.
3. Add correlation IDs to query telemetry, bridge XML entries where possible, and ingestion lifecycle events.
4. Define an outcome taxonomy:
   - `success`
   - `partial`
   - `rejected`
   - `failed`
   - `cancelled`
5. Define an initial error-code taxonomy for:
   - configuration mismatch
   - model unavailable
   - browse restriction
   - queue persistence failure
   - ingestion read failure
   - embedding failure
   - vector store corruption

## Evidence And Rationale

- Current bridge XML `CHAT` errors read as plain text like `Chat failed: network error`, which is human-readable but not easy to aggregate or trace.
- Current query logs do not explain whether an answer failed after retrieval versus succeeding with weak evidence.

## Tests Required

- extend `gui/server/tests/retrieval.behavior.test.js` for `requestId`, `outcome`, and error taxonomy assertions
- extend `gui/server/tests/api.routes.test.js` if any response metadata becomes observable
- add queue tests for correlation propagation if queue telemetry is formalized

## Validation Commands

- `Set-Location gui/server; npm test -- retrieval.behavior.test.js`
- `Set-Location gui/server; npm test -- api.routes.test.js`

## Rollback Condition

Rollback Phase 2 if correlation IDs leak into user-visible payloads in a way that breaks current clients or tests.

## Promotion Gate

Phase 2 is complete only when:

- every new structured event type has a correlation field
- outcomes and error codes are documented
- query and queue telemetry can be joined deterministically

## Phase 3: Runtime Instrumentation Upgrade

## Scope

Upgrade the runtime to persist the most valuable missing signals without degrading the hot path.

## Primary Files

- `gui/server/server.js`
- `gui/server/lib/queryLogger.js`
- `gui/server/lib/healthCheck.js`
- `gui/server/IngestionQueue.js`
- possibly new helpers such as `gui/server/lib/telemetryEvents.js`
- `gui/client/react-client/src/hooks/useRagApi.js`

## Allowed Changes

- add new structured fields to query telemetry
- add low-volume ingestion lifecycle telemetry
- add optional health snapshot persistence if carefully scoped
- add structured logging around queue failures and embed failures

## Explicit Non-Goals

- no per-token streaming event logging
- no full request body capture
- no noisy polling log stream

## Concrete Repo Work

1. Extend `query_log.jsonl` entries to include:
   - `requestId`
   - `outcome`
   - `errorCode`
   - `embedDurationMs`
   - `searchDurationMs`
   - `totalDurationMs`
   - `collection`
   - optional `citationCount` if distinct from `resultCount`
2. Persist ingestion lifecycle telemetry for:
   - job enqueued
   - job started
   - file skipped
   - file read failure
   - chunk embed failure
   - job completed
   - job failed
3. Decide whether `/api/health` remains purely ephemeral or also emits periodic snapshot events. Default should be to keep it ephemeral until a reporting need is proven.
4. Normalize console-only failures into structured events where they are important for analysis.
5. Ensure `bridge-log.xml` is used deliberately for UI and bridge events, not as the accidental default for everything.

## Evidence And Rationale

- `Server-Timing` already provides timing data, but it is not durable.
- Queue state already provides timestamps that can be converted into lifecycle telemetry with minimal invention.
- The workspace shows real failures in bridge XML, but without a structured error taxonomy they cannot be rolled up well.

## Tests Required

- extend `gui/server/tests/queryLogger.test.js` for new fields and backward-compatible writes
- extend `gui/server/tests/retrieval.behavior.test.js` for timing and outcome fields
- extend `gui/server/tests/healthCheck.test.js` only if health snapshot behavior changes
- extend `gui/server/tests/IngestionQueue.test.js` for new telemetry emission behavior

## Validation Commands

- `Set-Location gui/server; npm test`
- `pwsh ./scripts/Validate-Docs.ps1`

## Rollback Condition

Rollback Phase 3 if:

- `/api/chat` latency visibly regresses
- log write errors become noisy on the request path
- queue processing becomes materially slower under test load

## Promotion Gate

Phase 3 is complete only when:

- new query records contain correlation, outcome, and timing fields
- ingestion lifecycle telemetry exists in a durable format
- hot-path logging remains non-blocking by design and by code review

## Phase 4: Derived Reporting And Rollups

## Scope

Turn raw telemetry into repeatable summaries that support decision making and operational reporting.

## Primary Files

- new report script under `scripts/` or `gui/server/scripts/`
- `logs/query_log.jsonl`
- `PowerShell Scripts/Data/queue.json`
- `logs/bridge-log.xml`
- `logs/perf-baseline.json`
- documentation for generated outputs

## Allowed Changes

- add offline rollup script
- add generated report formats such as JSON, markdown, or HTML
- add documentation for KPI definitions and report consumers

## Explicit Non-Goals

- no hosted dashboard platform
- no external database
- no long-running report service

## Concrete Repo Work

1. Add a report-generation script that can summarize:
   - query volume
   - low-confidence rate
   - retrieval-mode usage
   - model usage
   - latency distributions
   - queue durations and failure counts
   - bridge XML error counts by category
2. Emit a canonical machine-readable rollup artifact.
3. Optionally emit a markdown or HTML summary for humans.
4. Define how historical comparisons will work when schema versions differ.

## Evidence And Rationale

- The repo already contains report-generation precedents and static artifact directories.
- Existing raw logs are enough to support a first generation of offline summaries without adding infrastructure.

## Tests Required

- add focused tests for the rollup parser against checked-in fixtures or generated samples
- validate that legacy rows with blank `retrievalMode` are handled gracefully

## Validation Commands

- command for the new rollup script
- `pwsh ./scripts/Validate-Docs.ps1`

## Rollback Condition

Rollback Phase 4 if report generation depends on brittle assumptions that break on current first-party log history.

## Promotion Gate

Phase 4 is complete only when:

- one command can produce a stable observability summary from current artifacts
- legacy rows are tolerated
- KPI definitions are documented

## Phase 5: Operator-Facing Debugging Workflow

## Scope

Make the new telemetry materially useful for debugging without overwhelming the UI or runtime.

## Primary Files

- `gui/client/react-client/src/components/AnalyticsPanel.jsx`
- `gui/client/react-client/src/hooks/useRagApi.js`
- `docs/DEVELOPER_ONBOARDING.md`
- `docs/API_REFERENCE.md`
- new debugging playbook doc if needed

## Allowed Changes

- add lightweight drill-down surfaces or operator workflows
- add documented debugging playbooks
- add debug-only views or endpoints if clearly guarded

## Explicit Non-Goals

- no complex analytics dashboard framework
- no always-on verbose live log viewer
- no feature that requires cloud services

## Concrete Repo Work

1. Define the minimum operator workflow for debugging:
   - identify failed or weak request
   - correlate to query record
   - inspect queue or index state if relevant
   - inspect bridge or PowerShell logs if needed
2. Add documentation and, if justified, UI affordances for:
   - recent low-confidence requests
   - latest queue failures
   - recent bridge XML errors
3. Keep the UI operationally useful, not noisy.

## Evidence And Rationale

- The current analytics panel surfaces status but not cause.
- The current logs are present, but the repo lacks a canonical “where do I look first?” workflow beyond high-level docs.

## Tests Required

- extend client tests if analytics panel behavior changes
- extend docs and contract validation where new debug endpoints or payloads are added

## Validation Commands

- `Set-Location gui/client/react-client; npm test`
- `Set-Location gui/client/react-client; npm run build`
- `pwsh ./scripts/Validate-Docs.ps1`

## Rollback Condition

Rollback Phase 5 if new debug UX increases runtime polling noise or exposes raw internal data without clear operator value.

## Promotion Gate

Phase 5 is complete only when:

- one documented debugging path exists from symptom to evidence
- UI additions remain lightweight and testable

## Phase 6: Retention, Hygiene, And Drift Prevention

## Scope

Make observability sustainable by clarifying cleanup, rotation, ownership, and documentation sync.

## Primary Files

- `config/project-config.psd1`
- `gui/server/lib/configLoader.js`
- `PowerShell Scripts/PathUtils.ps1`
- docs describing observability and API behavior

## Allowed Changes

- clarify retention policy ownership
- add cleanup or rotation support for new JSONL artifacts if needed
- add docs drift checks and release checklist items

## Explicit Non-Goals

- no major telemetry redesign
- no new storage backend

## Concrete Repo Work

1. Clarify which retention settings apply to:
   - XML logs
   - query JSONL logs
   - generated reports
   - queue snapshots
2. Decide whether new JSONL or rollup artifacts need rotation logic beyond existing PowerShell utilities.
3. Update docs whenever observability fields or endpoints change.
4. Add a release or PR checklist item for telemetry contract changes.

## Evidence And Rationale

- Logging retention is configured in `project-config.psd1`, but current enforcement is clearer for PowerShell-managed artifacts than for Node query JSONL telemetry.
- This is exactly the kind of drift that caused the previous API-reference mismatch.

## Tests Required

- extend PowerShell path or cleanup tests if retention behavior changes
- run docs validation

## Validation Commands

- `Set-Location gui/server; npm test`
- `pwsh ./scripts/Validate-Docs.ps1`

## Rollback Condition

Rollback Phase 6 if cleanup logic risks deleting first-party artifacts needed for debugging or tests.

## Promotion Gate

Phase 6 is complete only when:

- retention ownership is documented
- cleanup behavior is explicit
- documentation is synchronized with implementation

## Required Acceptance Metrics

These are rollout gates, not aspirational suggestions.

1. Baseline parser coverage:
   - current first-party artifacts parse with zero fatal errors
   - at minimum this includes `query_log.jsonl`, `bridge-log.xml`, `queue.json`, and `perf-baseline.json`

2. Query telemetry completeness for new records after Phase 3:
   - 100% of newly written query records include `requestId`
   - 100% of newly written query records include `outcome`
   - 100% of newly written query records include `retrievalMode`
   - 100% of newly written query records include durable timing fields

3. Correlation coverage:
   - 100% of queue lifecycle events include a stable job identifier
   - query and ingestion traces can be joined deterministically when a queue-backed workflow is involved

4. Hot-path safety:
   - query logging remains fire-and-forget and is not awaited in the streaming request path
   - no per-token durable telemetry writes are introduced

5. Reporting readiness:
   - one command can produce a stable baseline or rollup summary from local artifacts
   - legacy rows with missing `retrievalMode` do not crash the pipeline

6. Documentation correctness:
   - `docs/API_REFERENCE.md`, `docs/Architecture_Design.md`, and observability docs remain synchronized
   - docs validation passes

## Suggested Milestone Order For Implementation

If executed as incremental pull requests, the safest order is:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 6
7. Phase 5

Phase 6 comes before broad UI debugging work because retention and drift rules should stabilize before more observability surface area is exposed.

## Recommended First Deliverables

The highest-value first deliverables are:

1. a baseline summary script
2. a shared telemetry contract
3. correlation IDs on query and queue paths
4. durable timing fields in `query_log.jsonl`
5. a single offline rollup command

These create the most leverage with the least product risk.

## Done Criteria

This initiative is complete only when:

1. the runtime has a documented shared telemetry contract
2. new hot-path events carry correlation, outcome, and timing fields
3. ingestion has durable lifecycle telemetry
4. the team can generate a stable local observability summary from current artifacts
5. one documented workflow exists for tracing a failure from symptom to evidence
6. retention and docs drift controls are in place

## Reference Evidence

This plan was grounded in:

- `gui/server/server.js`
- `gui/server/lib/queryLogger.js`
- `gui/server/lib/xmlLogger.js`
- `gui/server/lib/healthCheck.js`
- `gui/server/IngestionQueue.js`
- `gui/server/tests/queryLogger.test.js`
- `gui/server/tests/xmlLogger.test.js`
- `gui/server/tests/healthCheck.test.js`
- `gui/server/tests/retrieval.behavior.test.js`
- `gui/server/tests/IngestionQueue.test.js`
- `gui/server/tests/api.routes.test.js`
- `PowerShell Scripts/XMLLogger.ps1`
- `PowerShell Scripts/ExecutionContext.ps1`
- `PowerShell Scripts/PathUtils.ps1`
- `logs/query_log.jsonl`
- `logs/bridge-log.xml`
- `PowerShell Scripts/Data/queue.json`
- `logs/perf-baseline.json`
