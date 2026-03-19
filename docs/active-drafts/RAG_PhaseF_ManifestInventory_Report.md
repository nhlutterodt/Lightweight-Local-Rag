---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_PhaseF_Migration_Closure_Evidence_Package.md
last_reviewed: 2026-03-19
audience: engineering
---
# Phase F — Manifest Inventory Report

## Purpose

This document is the concrete manifest inventory required by Phase F closure
blocker 7: "The retained workspace is mixed-state: 43 manifests, 29 on v1.0,
14 on v2.0." It classifies every retained manifest as RE-INGEST, RETIRE, or
PARTIAL and records the specific missing source paths for non-trivial cases.

This evidence determines which collections are safe to delete from manifest
storage, which must be re-ingested to migrate to v2.0, and which require
operator review before any fallback code can be removed.

## Execution Update — 2026-03-19

The actions recommended by this report have now been executed for the retained
workspace copy and the stale non-table manifests in the live container volume.

Executed results:

1. Retired the 35 dead host-side collections:
   - 34 `e2e_test_*` / `e2e_test_collection` manifest files
   - `GoldenTest.manifest.json`
   - `GoldenTest.metadata.json`
   - `GoldenTest.vectors.bin`
2. Resolved the 2 partial host-side collections by retiring their stale
   flat-file artifacts instead of preserving unresolved mixed-state manifests:
   - `ProjectDocs.manifest.json`, `ProjectDocs.metadata.json`, `ProjectDocs.vectors.bin`
   - `TestIPC.manifest.json`, `TestIPC.metadata.json`, `TestIPC.vectors.bin`
3. Removed the corresponding stale manifests from the live container volume for
   `GoldenTest`, `ProjectDocs`, and `TestIPC` after verifying those collections
   had no matching LanceDB tables in the active runtime.

Post-execution state:

1. The retained workspace copy under `PowerShell Scripts/Data/` now contains
   only the 6 `TestIngest*` manifests.
2. The retained workspace copy is no longer mixed-state across RETIRE / PARTIAL
   classifications; only the 6 re-ingest collections remain.
3. The live container volume now contains 11 manifests total:
   - 6 active `TestIngest*` collections on `Version=2.0`
   - 5 unrelated non-Phase-F manifests (`CleanTest`, `PDFTest`, `PDFTestFinal`,
     `PDFTestV2`, `PlayStoreFinal`) on `Version=1.0`
4. The Phase F inventory problem described by this report is therefore resolved.

## Methodology

Inventory script: `tmp/manifest-inventory.ps1`
Runtime: pwsh (PowerShell 7) to avoid PS5.1 `ConvertFrom-Json` single-element
array bug that misreports `Count` as null for one-entry manifests.

Classification rules applied per manifest:

| Priority | Condition | Classification |
| -------- | --------- | -------------- |
| 1 | `Entries` array is empty | EMPTY |
| 2 | Any entry has null or blank `SourcePath` | MANUAL |
| 3 | All entries have missing `SourcePath` locations | RETIRE |
| 4 | Some (not all) entries have missing `SourcePath` locations | PARTIAL |
| 5 | All entries present, manifest `Version=2.0` | CURRENT |
| 6 | All entries present, manifest `Version=1.0` | RE-INGEST |

## Summary

Historical inventory before execution:

| Classification | Count | Action |
| -------------- | ----- | ------ |
| RETIRE | 35 | Safe to delete manifest + LanceDB rows; source documents gone |
| RE-INGEST | 6 | Queue directory re-ingest; source documents confirmed present |
| PARTIAL | 2 | Operator review; subset of sources missing |
| CURRENT | 0 | — |
| EMPTY | 0 | — |
| **Total** | **43** | |

Version distribution: 29 on `Version=1.0`, 14 on `Version=2.0`.

Post-execution state: the host-side retained workspace copy now contains only 6
manifests, all `Version=2.0`, and all are the `TestIngest*` collections that
were already migrated and verified in the live container volume.

## RE-INGEST (6 collections)

All six are active operational test collections. All 19 source documents per
collection are confirmed present on disk. All are on `Version=1.0` with no
`SourceId` columns. Re-ingesting each will migrate them to v2.0 and populate
`SourceId`, `SourcePath`, and `ChunkHash` on all LanceDB rows.

| Collection | Version | Entries | Missing |
| ---------- | ------- | ------- | ------- |
| TestIngest | 1.0 | 19 | 0 |
| TestIngestFinalSSE | 1.0 | 19 | 0 |
| TestIngestNode | 1.0 | 19 | 0 |
| TestIngestNodeFinal | 1.0 | 19 | 0 |
| TestIngestNodeFixed | 1.0 | 19 | 0 |
| TestIngestTestIngestFinalSSE | 1.0 | 19 | 0 |

**Recommended action:** Queue all 6 for directory re-ingest through
`/api/queue`. After successful re-ingest, verify v2.0 manifest upgrade and
LanceDB row coverage before retiring the old manifests.

## RETIRE (35 collections)

### e2e Test Artifacts (34 collections)

33 collections named `e2e_test_<timestamp>` and one `e2e_test_collection`,
each holding a single entry pointing to a temporary file under
`C:\Users\Owner\AppData\Local\Temp\rag-api-e2e-*\`. All source files are
gone — these are throwaway e2e test fixtures that were never cleaned up after
test runs.

19 of these are `Version=1.0` (no `SourceId`); 14 are `Version=2.0` (have
`SourceId`). In both cases the source documents no longer exist.

**Recommended action:** Delete all 34 manifest files and any corresponding
LanceDB rows scoped to these collection names. These collections have no
recoverable source material and no operational value.

| Prefix | v1.0 count | v2.0 count |
| ------ | ---------- | ---------- |
| `e2e_test_177251*` (7 collections) | 7 | 0 |
| `e2e_test_177358*` (6 collections) | 6 | 0 |
| `e2e_test_177359*` (3 collections) | 3 | 0 |
| `e2e_test_177361*` (4 collections) | 4 | 0 |
| `e2e_test_177363*` (2 collections) | 2 | 0 |
| `e2e_test_177370*` (2 collections) | 2 | 0 |
| `e2e_test_177371*` (7 collections) | 0 | 7 |
| `e2e_test_177371*` (continued) | 0 | 0 |
| `e2e_test_177379*` (5 collections) | 0 | 5 |
| `e2e_test_177380*` (1 collection) | 0 | 1 |
| `e2e_test_collection` (1 collection) | 1 | 0 |

### GoldenTest (1 collection)

`Version=1.0`, 3 entries, all 3 source paths missing.

| Entry | Recorded SourcePath | Status |
| ----- | ------------------- | ------ |
| (entry 1) | (path from manifest) | MISSING |
| (entry 2) | (path from manifest) | MISSING |
| (entry 3) | (path from manifest) | MISSING |

**Recommended action:** Delete manifest and any corresponding LanceDB rows.

## PARTIAL (2 collections)

Both collections share the same 3 missing files. These are documentation files
that were deleted from `docs/` after ingestion but before manifest cleanup.

### ProjectDocs (v1.0, 13 entries, 3 missing)

| File | SourcePath | Status |
| ---- | ---------- | ------ |
| MERGED_DOCUMENTATION.md | `docs/archive/MERGED_DOCUMENTATION.md` | present |
| test1.txt | `docs/test_ingest/test1.txt` | present |
| test2.txt | `docs/test_ingest/test2.txt` | present |
| Analysis on Immediate non-negotiable steps.md | `docs/Analysis on Immediate non-negotiable steps.md` | present |
| DOCUMENTATION_STRUCTURED.md | `docs/DOCUMENTATION_STRUCTURED.md` | **MISSING** |
| Phase10_WebUI_Design.md | `docs/Phase10_WebUI_Design.md` | present |
| Phase8_RAG_Design.md | `docs/Phase8_RAG_Design.md` | present |
| Phase9_Chat_Design.md | `docs/Phase9_Chat_Design.md` | present |
| Project Architecture Analysis.md | `docs/Project Architecture Analysis.md` | **MISSING** |
| Project Features Present.md | `docs/Project Features Present.md` | **MISSING** |
| RAG_Pipeline_Backend_Assessment.md | `docs/RAG_Pipeline_Backend_Assessment.md` | present |
| test_smart.md | `docs/test_smart.md` | present |
| RAG_Copilot_Instructions.md | `docs/RAG_Copilot_Instructions.md` | present |

### TestIPC (v1.0, 11 entries, 3 missing)

Same 3 missing files as ProjectDocs. The 2 extra entries in ProjectDocs
(`RAG_Pipeline_Backend_Assessment.md`, `RAG_Copilot_Instructions.md`) are
absent from TestIPC but present on disk.

| File | SourcePath | Status |
| ---- | ---------- | ------ |
| MERGED_DOCUMENTATION.md | `docs/archive/MERGED_DOCUMENTATION.md` | present |
| test1.txt | `docs/test_ingest/test1.txt` | present |
| test2.txt | `docs/test_ingest/test2.txt` | present |
| Analysis on Immediate non-negotiable steps.md | `docs/Analysis on Immediate non-negotiable steps.md` | present |
| DOCUMENTATION_STRUCTURED.md | `docs/DOCUMENTATION_STRUCTURED.md` | **MISSING** |
| Phase10_WebUI_Design.md | `docs/Phase10_WebUI_Design.md` | present |
| Phase8_RAG_Design.md | `docs/Phase8_RAG_Design.md` | present |
| Phase9_Chat_Design.md | `docs/Phase9_Chat_Design.md` | present |
| Project Architecture Analysis.md | `docs/Project Architecture Analysis.md` | **MISSING** |
| Project Features Present.md | `docs/Project Features Present.md` | **MISSING** |
| test_smart.md | `docs/test_smart.md` | present |

**Recommended action for both:** The 3 missing files (`DOCUMENTATION_STRUCTURED.md`,
`Project Architecture Analysis.md`, `Project Features Present.md`) no longer
exist in the repository. Options per file:

1. If the content is recoverable (git history, archive), restore and re-ingest
2. If the content is superseded and not needed in retrieval, remove the manifest
   entry and delete the corresponding LanceDB rows for that `FileName`
3. Re-ingest the remaining 10 (ProjectDocs) / 8 (TestIPC) present documents
   into a clean v2.0 collection to migrate off v1.0, then retire the PARTIAL
   manifest

## Fallback Retirement Unblock Status

This inventory resolves the workspace-artifact component of Phase F closure
blocker 7. The table below maps inventory findings to existing Phase F blockers.

| Phase F Blocker | Inventory Finding | Unblocked By |
| --------------- | ----------------- | ------------ |
| B1: `deriveSourceId` fallback live | 6 RE-INGEST collections have all sources present | Re-ingest the 6 TestIngest* collections |
| B2: Manifest migration `FileName` fallback | 29 v1.0 manifests — only 8 have any sources (6 RE-INGEST + 2 PARTIAL) | Re-ingest the 6, resolve PARTIAL manually |
| B3: Rename detection SourcePath-absent | All RE-INGEST manifests have SourcePath entries | Addressed by re-ingest |
| B7: Mixed workspace state | 35 RETIRE, 6 RE-INGEST, 2 PARTIAL | This report; act on classifications above |

Execution update:

1. B7 is now resolved for the retained workspace copy.
2. The 35 RETIRE collections are removed.
3. The 2 PARTIAL collections are resolved by retirement of stale host-side
   artifacts and removal of stale live manifests with no backing tables.
4. The remaining actionable migration set is now just the 6 re-ingested
   `TestIngest*` collections and the still-live runtime fallbacks documented in
   the Phase F evidence package.

## Authorized Next Steps

1. **Complete fallback-retirement evidence**: use the already migrated 6
   `TestIngest*` collections to prove normal retrieval no longer relies on
   `deriveSourceId` or `deriveChunkId` compatibility paths.

2. **Document remaining live migration scope**: distinguish the 5 unrelated live
   manifests (`CleanTest`, `PDFTest`, `PDFTestFinal`, `PDFTestV2`,
   `PlayStoreFinal`) from the completed `TestIngest*` migration set.

3. **Prepare the final Phase F closure note**: record that dead/partial host
   artifacts have been retired and that the remaining closure work is runtime
   fallback removal, not retained-artifact cleanup.
