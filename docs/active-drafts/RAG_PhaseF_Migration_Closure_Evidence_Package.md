---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md
last_reviewed: 2026-03-19
audience: engineering
---
# Phase F Evidence Package — Legacy Fallback Retirement and Re-Ingest Closure

## Status

In progress on 2026-03-19.

This document is the Phase F evidence package for migration closure. It does not
authorize fallback removal yet. It records the currently verified fallback paths,
the retained workspace artifacts that still require migration-aware handling, and
the evidence thresholds that must be met before legacy compatibility can be retired.

Execution update at this revision:

1. The 35 dead host-side collections have been retired.
2. The 2 partial host-side collections have been resolved by retiring their
	stale flat-file artifacts.
3. The stale live manifests for `GoldenTest`, `ProjectDocs`, and `TestIPC`
	have been removed from the container volume after verifying those
	collections had no matching LanceDB tables.
4. The 6 `TestIngest*` collections have already been re-ingested and verified
	on `Version=2.0` in the live container volume.
5. The 6 retained host-side `TestIngest*` manifests have been synchronized from
	the live container and now also reflect `Version=2.0` plus persisted
	`SourceId` values.
6. The server container has been explicitly rebuilt with
	`docker compose up --build -d server` after the migration work to ensure the
	running image matches the analyzed source state.

---

## Purpose

Phase F is not a feature phase. It is the closure phase for legacy provenance,
identity, telemetry, and re-ingest compatibility.

The central question is no longer whether the runtime supports the new model.
It does. The central question is whether the repository and retained data have
fully exited the old model strongly enough that fallback paths can be removed
without corrupting retrieval, model migration, integrity scanning, or evaluation.

---

## Scope

### In Scope

1. Identify every live fallback or compatibility path that still exists in code.
2. Identify retained workspace artifacts that still require those fallbacks.
3. Define the evidence needed before any fallback can be removed.
4. Define the re-ingest and migration closure criteria for collections, manifests, queue state, and telemetry.

### Out of Scope

1. Removing legacy fallbacks in this change set.
2. Bulk re-ingesting collections in this change set.
3. Tightening runtime compatibility guards before closure evidence is collected.
4. Rewriting history or deleting retained historical artifacts without an approved retirement plan.

---

## Evidence Anchors Reviewed

### Live Runtime Code

1. `gui/server/server.js`
2. `gui/server/IngestionQueue.js`
3. `gui/server/lib/documentParser.js`
4. `gui/server/lib/vectorStore.js`
5. `gui/server/lib/integrityCheck.js`
6. `gui/server/lib/modelMigration.js`
7. `gui/server/lib/queryLogger.js`
8. `gui/server/lib/evalLogSchema.js`
9. `gui/server/lib/sourceIdentity.js`

### Retained Workspace Artifacts

1. `PowerShell Scripts/Data/TestIngestNodeFinal.manifest.json`
2. `PowerShell Scripts/Data/queue.json`
3. `logs/query_log.v1.jsonl`
4. `logs/archive/query_log.legacy.20260318-021357.jsonl`
5. retained live-volume manifests under `/app/PowerShell Scripts/Data/`

---

## Workspace Artifact Baseline

The current workspace still contains both migrated and legacy-state artifacts.

### Manifest Baseline

Observed after cleanup on 2026-03-19:

1. Total retained host manifest files under `PowerShell Scripts/Data`: `6`
2. `Version=1.0` host manifests: `0`
3. `Version=2.0` host manifests: `6`
4. All retained host manifests are the `TestIngest*` workspace-copy files.
5. The 35 dead collections and the 2 partial collections are no longer present
	in the retained host artifact set.

Observed in the live container volume on 2026-03-19:

1. Total live manifests under `/app/PowerShell Scripts/Data`: `11`
2. `Version=1.0` live manifests: `5`
3. `Version=2.0` live manifests: `6`
4. The 6 live `Version=2.0` manifests are the migrated `TestIngest*`
	collections.
5. The 5 remaining `Version=1.0` live manifests are unrelated to the retired
	dead/partial host artifact set: `CleanTest`, `PDFTest`, `PDFTestFinal`,
	`PDFTestV2`, and `PlayStoreFinal`.

Representative retained host manifest:

1. `PowerShell Scripts/Data/TestIngestNodeFinal.manifest.json` is now
	`Version: "2.0"` and its entries carry persisted `SourceId` values.

Representative migrated live manifest:

1. `/app/PowerShell Scripts/Data/TestIngestNodeFinal.manifest.json` is now
	`Version: "2.0"` in the live container volume and its entries carry
	`SourceId` plus `/docs/...` `SourcePath` values.

Immediate implication:

1. The retained workspace copy is no longer mixed-state across dead and partial
	collections.
2. Repository-wide migration closure has not yet happened because runtime
	fallback code is still live, even though both the live container volume and
	the retained workspace copy now show the `TestIngest*` collections on v2.0.
3. The manifest migration fallback is no longer justified by dead/partial host
	artifacts; it is justified only by the remaining runtime compatibility scope.

### Container Posture Baseline

Observed after rebuild on 2026-03-19:

1. The server container was refreshed with `docker compose up --build -d server`.
2. Post-rebuild `/api/health` returned `status: healthy`.
3. The running container still reports `MANIFEST_KNOWN_VERSIONS = ["1.0", "2.0"]`
	and `MANIFEST_VERSION = "2.0"` in `gui/server/lib/documentParser.js`.
4. The running container still includes the `pre-SourceId schema` LanceDB
	table-drop guard in `gui/server/IngestionQueue.js`.
5. `docker-compose.yml` remains aligned with the migration posture:
	`ALLOWED_BROWSE_ROOTS=/data;/docs` and `./docs:/docs:ro` are present for the
	re-ingest path that was used during the TestIngest migration.

Immediate implication:

1. The current container posture matches the analyzed migration state.
2. The stale-build failure mode that originally blocked v2.0 manifest writes is
	not the current risk anymore.
3. Remaining Phase F work is about runtime fallback retirement and scope
	decisions, not about container drift.

### Queue-State Baseline

Observed on 2026-03-18:

1. `PowerShell Scripts/Data/queue.json` has `schemaVersion: 1`.
2. The retained queue file contains completed historical jobs and therefore represents a real persisted compatibility surface, not a purely synthetic test path.

Immediate implication:

1. Queue-state schema handling remains part of migration closure, even though the current persisted file is already on the first versioned schema.

### Query-Log Baseline

Observed on 2026-03-18:

1. Active runtime telemetry exists at `logs/query_log.v1.jsonl`.
2. A rotated legacy query log exists at `logs/archive/query_log.legacy.20260318-021357.jsonl`.
3. The archived legacy rows use the pre-v1 shape with `chunkIndex` and lack `scoreSchemaVersion`, `scoreType`, and retrieval-trace fields.

Immediate implication:

1. Legacy query-log handling is no longer the default path.
2. Historical legacy telemetry still exists and remains a supported opt-in analysis input.

### Legacy Flat-File Artifact Baseline

Observed after cleanup on 2026-03-19:

1. The stale host-side flat-file artifacts for `GoldenTest`, `ProjectDocs`, and
	`TestIPC` have been removed.
2. The dead/partial host artifact cleanup is complete for the set identified in
	the manifest inventory report.
3. Historical flat-file artifacts may still exist elsewhere in the workspace,
	but they no longer include the retired Phase F dead/partial collections.

Immediate implication:

1. Phase F can now distinguish completed retained-artifact cleanup from the
	still-open runtime fallback retirement work.
2. Removing code fallbacks remains a separate task from deleting stale host-side
	historical files, but the highest-noise host artifacts are gone.

---

## Verified Live Fallback and Compatibility Paths

### 1. Retrieval-Time `SourceId` Fallback Remains Live

Evidence anchor: `gui/server/server.js`

Verified behavior:

1. `deriveSourceId(result)` still accepts rows with missing `SourceId`.
2. When `SourceId` is absent, the server logs a provenance warning and falls back to a deterministic hash derived from `FileName`.
3. The warning explicitly tells operators to re-ingest the collection to migrate to canonical `sourceId`.

Phase F implication:

1. Retrieval still supports basename-derived identity for legacy rows.
2. This fallback cannot be removed safely until collection evidence shows normal retrieval no longer encounters rows without `SourceId`.

### 2. Retrieval-Time `ChunkHash` Fallback Remains Live

Evidence anchors: `gui/server/server.js`, `gui/server/lib/vectorStore.js`

Verified behavior:

1. `deriveChunkId(result, sourceId)` still synthesizes a fallback chunk identity when `ChunkHash` is missing.
2. Retrieval mapping still tolerates ordinal compatibility through `chunkOrdinal ?? ChunkIndex`.
3. Retrieval trace generation emits an empty `chunkId` when a mapped result lacks `ChunkHash`.

Phase F implication:

1. Chunk-identity closure is incomplete while active rows may omit `ChunkHash`.
2. `ChunkIndex` compatibility cannot be retired until collection evidence shows canonical `chunkOrdinal` and `ChunkHash` are present for all approved collections.

### 3. Manifest Migration Still Relies on Legacy Reconstruction

Evidence anchor: `gui/server/lib/documentParser.js`

Verified behavior:

1. Manifest `Version: "1.0"` remains supported input.
2. The `1.0 -> 2.0` migration mints `SourceId` from `(collection, SourcePath)` when `SourcePath` exists.
3. The same migration falls back to `(collection, FileName)` when `SourcePath` is missing.

Phase F implication:

1. Manifest migration still supports basename-derived identity recovery when older entries are missing `SourcePath`.
2. That path cannot be removed until retained manifests are either upgraded or explicitly retired.

### 4. Rename Detection Still Carries Legacy `SourcePath`-Absent Behavior

Evidence anchor: `gui/server/IngestionQueue.js`

Verified behavior:

1. Same-content rename detection still treats `!originalPath` as a legacy-compatible rename case.
2. The queue preserves prior rename behavior when a matched entry has no `SourcePath`.
3. New-source ingest and rename continuity decisions still depend on those legacy checks.

Phase F implication:

1. Re-ingest closure is not just a retrieval problem.
2. Rename and duplicate-content handling still rely on manifest quality and retained compatibility logic.

### 5. `ChunkIndex` Compatibility Remains Intentionally Live

Evidence anchors: `gui/server/IngestionQueue.js`, `gui/server/lib/vectorStore.js`

Verified behavior:

1. Ingestion still writes `ChunkIndex` for compatibility.
2. Ingestion also writes canonical `chunkOrdinal`.
3. Retrieval still reads `chunkOrdinal ?? ChunkIndex`.

Phase F implication:

1. Ordinal migration is not closed while `ChunkIndex` remains a compatibility read path.
2. Phase F must decide whether `ChunkIndex` becomes permanent compatibility baggage or is removable after full re-ingest closure.

### 6. Queue-State Migration Support Remains Live

Evidence anchor: `gui/server/IngestionQueue.js`

Verified behavior:

1. Plain-array queue state is still treated as legacy version `0`.
2. `_migrateQueueState(raw)` migrates older queue payloads up to `QUEUE_STATE_VERSION = 1`.
3. Forward-incompatible state is backed up and reset.

Phase F implication:

1. Queue persistence remains a real migration surface.
2. Closure work must keep queue rollback and backup semantics explicit.

### 7. Model Migration Depends on Valid `SourcePath`

Evidence anchors: `gui/server/server.js`, `gui/server/lib/modelMigration.js`

Verified behavior:

1. When the stored embedding model differs from the configured model, the runtime triggers `triggerModelMigration(...)`.
2. Model migration collects source directories from manifest `SourcePath` values.
3. If no valid `SourcePath` values exist, migration warns and returns `queued: 0`.
4. The server then leaves vector search unavailable until re-indexing completes.

Phase F implication:

1. Manifest quality directly governs model-migration recoverability.
2. Collections with incomplete `SourcePath` provenance remain a release risk until they are re-ingested or retired.

### 8. Legacy Query-Log Access Remains Explicitly Supported

Evidence anchors: `gui/server/lib/queryLogger.js`, `gui/server/lib/evalLogSchema.js`

Verified behavior:

1. Runtime writes new rows only to `logs/query_log.v1.jsonl`.
2. Legacy `logs/query_log.jsonl` is rotated to `logs/archive/query_log.legacy.<yyyyMMdd-HHmmss>.jsonl`.
3. Evaluation tooling still allows explicit legacy-path selection via `allowLegacySchema`.

Phase F implication:

1. Legacy telemetry is no longer first-class runtime truth.
2. Historical log access is still intentionally preserved and must be retired by policy, not by accident.

### 9. Historical Flat-File Storage Artifacts Remain in the Workspace

Evidence anchor: retained files under `PowerShell Scripts/Data/`

Verified behavior:

1. Multiple `*.vectors.bin` and `*.metadata.json` files remain in the data directory.
2. The current Node runtime does not use them as active hot-path storage.
3. Their presence still matters for operator understanding and potential historical cleanup planning.

Phase F implication:

1. Workspace cleanup must be handled separately from runtime fallback retirement.
2. Documentation and tooling must keep distinguishing historical artifacts from live runtime contracts.

---

## Closure Blockers Verified Today

The following blockers are currently evidence-backed and prevent Phase F closure.

1. The retained workspace copy and the live container volume are now aligned for
	the 6 `TestIngest*` collections, but runtime fallback code is still live.
2. Retrieval fallback code for missing `SourceId` and missing `ChunkHash` is still live.
3. `ChunkIndex` compatibility remains active in both write and read paths.
4. Model migration still depends on manifest `SourcePath` completeness.
5. Legacy query-log analysis remains intentionally available via explicit opt-in.
6. Remaining closure work is now runtime-focused; the dead/partial host artifact
	cleanup identified by the manifest inventory report has been executed.

---

## Required Evidence Before Fallback Retirement

### Collection and Manifest Evidence

1. Inventory every retained manifest and classify it as `1.0`, `2.0`, or invalid.
2. Verify whether any approved collection still lacks persisted `SourceId` in its manifest and row set.
3. Verify whether any approved collection still lacks persisted `ChunkHash` or canonical `chunkOrdinal` in its row set.
4. Verify whether any approved collection still depends on `SourcePath`-absent compatibility.

### Retrieval Evidence

1. Verify that normal retrieval for approved collections no longer emits the `SourceId absent` provenance warning.
2. Verify that approved retrieval results carry canonical `ChunkHash` and do not rely on synthesized `chunkId` fallback.
3. Verify that answer references remain a strict subset of approved canonical chunk identities after re-ingest closure.

### Model-Migration Evidence

1. Verify that every approved manifest entry required for automatic model migration has a valid `SourcePath`.
2. Verify that model migration can always enumerate at least one valid source directory for approved collections.
3. Record any collections that require manual recovery because the manifest no longer carries enough path information.

### Queue and Telemetry Evidence

1. Verify whether any retained queue payload still requires legacy v0 migration support.
2. Verify whether any active reporting flow still needs explicit `allowLegacySchema` to analyze operationally relevant telemetry.
3. Distinguish historical-reporting needs from active runtime dependency.

---

## Phase F Closure Criteria

Phase F is complete only when all of the following are true.

1. Approved collections no longer rely on retrieval-time `SourceId` fallback.
2. Approved collections no longer rely on retrieval-time `ChunkHash` fallback.
3. Approved manifests are migrated or re-ingested such that `SourceId` and `SourcePath` are durable and sufficient for recovery workflows.
4. A decision is recorded for `ChunkIndex`: either retire it after closure or explicitly declare it a permanent compatibility field.
5. Model migration can recover approved collections without manual directory reconstruction.
6. Active tooling defaults exclusively to `logs/query_log.v1.jsonl`; legacy telemetry remains historical-only by policy.
7. Any retained historical `*.vectors.bin`, `*.metadata.json`, and legacy manifests are either explicitly preserved as historical artifacts or retired under a documented cleanup plan.

---

## Recommended Next Actions

1. Add a targeted operational check that fails if approved retrieval emits the
	`SourceId absent` warning for the migrated `TestIngest*` collections.
2. Decide whether the 5 unrelated live `Version=1.0` manifests
	(`CleanTest`, `PDFTest`, `PDFTestFinal`, `PDFTestV2`, `PlayStoreFinal`)
	are in scope for Phase F closure or should be deferred as separate cleanup.
3. Add an operator-facing migration note separating completed retained-artifact
	cleanup from still-open runtime fallback retirement.
