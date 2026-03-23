---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_PhaseF_Migration_Closure_Evidence_Package.md
last_reviewed: 2026-03-22
audience: engineering
---
# Phase F Migration Readiness Note

## Status

Blocked on 2026-03-22.

This note records the current Phase F posture after a fresh workspace manifest
inventory and an integrity scan of the active `TestIngestNodeFinal` collection.
The result is not migration closure. It is a readiness assessment showing that
host-side manifest migration has advanced further than the indexed data state.

## Evidence Collected

Commands executed on 2026-03-22:

1. Host manifest inventory summary written to `tmp/phasef-manifest-summary.json`
2. Integrity scan report written to `tmp/phasef-integrity-report.json`
3. Focused regression barriers run successfully for Phase B and Phase E changes:
   `tests/smartChunker.test.js`, `tests/IngestionQueue.test.js`,
   `tests/vectorStore.test.js`, `tests/sse.contract.test.js`, and
   `pwsh ./scripts/Validate-Docs.ps1`

Relevant runtime anchors still showing live compatibility scope:

1. `gui/server/server.js` retrieval-time `SourceId` fallback
2. `gui/server/server.js` retrieval-time `ChunkHash` fallback
3. `gui/server/lib/sourceIdentity.js` deprecated legacy compatibility helper
4. `gui/server/lib/documentParser.js` manifest migration support

## Inventory Freeze

Current retained host manifest state from `tmp/phasef-manifest-summary.json`:

1. Manifest count: `6`
2. Version distribution: all `6` manifests are `Version = 2.0`
3. Collections: `TestIngest`, `TestIngestFinalSSE`, `TestIngestNode`,
   `TestIngestNodeFinal`, `TestIngestNodeFixed`, and
   `TestIngestTestIngestFinalSSE`
4. Every retained host manifest reports `MissingSourceIdEntries = 0`
5. Every retained host manifest reports `MissingSourcePathEntries = 0`
6. Each retained host manifest currently contains `48` entries

Immediate conclusion:

1. The retained host-side manifest set is no longer mixed-state.
2. The host-side manifest migration objective is materially ahead of the runtime
   data-integrity objective.
3. Host manifests alone are not sufficient evidence to retire compatibility
   branches.

## Integrity Closure Check

Current integrity state from `tmp/phasef-integrity-report.json` for
`TestIngestNodeFinal`:

1. Manifest entries scanned: `48`
2. Vector source IDs present in the active collection scan: `1`
3. Vector rows present: `390`
4. Issues found: `49`
5. Issue breakdown:
   - `MISSING_VECTORS = 48`
   - `ORPHANED_VECTORS = 1`
   - `CHUNK_COUNT_MISMATCH = 0`
   - `MODEL_MISMATCH = 0`

Observed implication:

1. The current manifest and indexed data are not in closure alignment.
2. This is a hard blocker for fallback retirement.
3. The active collection does not yet provide evidence that retrieval and
   integrity operations are fully on canonical `SourceId`/`ChunkHash` data.

## Fallback Retirement Decision Table

| Fallback Surface | Current Decision | Reason |
| --- | --- | --- |
| `deriveSourceId` in `server.js` | keep for now | No current evidence that all active retrieval rows carry canonical `SourceId`; integrity state is not closed |
| `deriveChunkId` in `server.js` | keep for now | Integrity closure is incomplete and chunk-level canonical coverage is not yet proven across active rows |
| Legacy manifest migration support in `documentParser.js` | keep for now | Host manifests are all `v2.0`, but runtime data closure is not complete and this note does not prove all live environments are free of older manifests |
| Deprecated content-hash compatibility helper in `sourceIdentity.js` | keep for now | Explicitly documented as removable only after corpus re-ingest is complete |

## Phase F Readiness Assessment

What is now complete:

1. Host manifest inventory freeze for the retained workspace copy
2. Confirmation that retained host manifests are all `v2.0` with populated
   `SourceId` and `SourcePath`
3. Documentation of the remaining blocker using current integrity evidence

What remains blocked:

1. Re-ingest or data repair needed to reconcile manifest entries with vector rows
   for `TestIngestNodeFinal`
2. Proof that normal retrieval paths do not hit compatibility branches in active
   collections
3. Final fallback-retirement approval
4. Final migration closure declaration

## Required Next Actions

1. Reconcile `TestIngestNodeFinal` so manifest coverage and vector-row coverage
   match again.
2. Re-run `node scripts/check-integrity.js --output ../../tmp/phasef-integrity-report.json`
   from `gui/server` after reconciliation.
3. Confirm retrieval on the active collection does not emit runtime warnings for
   missing `SourceId` or synthesized chunk identity on the normal path.
4. Only after those checks pass, revisit fallback retirement decisions.

## Conclusion

Phase F is not ready for closure on 2026-03-22.

The manifest migration inventory is in much better shape than before, but the
active collection integrity evidence still shows a mismatch severe enough to make
fallback retirement unsafe. The correct state is therefore `blocked`, not
`complete`.
