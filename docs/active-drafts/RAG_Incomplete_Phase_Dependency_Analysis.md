---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md
last_reviewed: 2026-03-22
audience: engineering
---
# Targeted Analysis: Incomplete Phases and Inter-Phase Dependencies

## Purpose

This artifact is the proof-of-work analysis for incomplete phases in the provenance hardening program.

It answers two questions with repository-backed evidence:

1. What is still incomplete and execution-relevant (not already closed)?
2. What inter-phase dependencies must be respected to avoid false closure claims?

## Scope and Method

Scope is limited to phases not marked complete in the current phase outline:

1. Phase B: Extractor and Chunker Provenance (partially complete)
2. Phase E: Documentation and Validator Hardening (in progress)
3. Phase F: Release and Migration (not complete)

Method:

1. Verify phase status and gates from the controlling plan.
2. Trace live runtime behavior in ingestion, retrieval/SSE, telemetry, and identity fallbacks.
3. Cross-check regression barriers/tests for delivered versus open capability boundaries.
4. Derive dependency edges from gate language and runtime constraints.

## Evidence Index (Primary Anchors)

1. docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:580
2. docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:621
3. docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:633
4. docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:589
5. docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:627
6. docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:642
7. gui/server/lib/smartChunker.js:153
8. gui/server/lib/smartChunker.js:193
9. gui/server/lib/smartChunker.js:325
10. gui/server/lib/smartChunker.js:377
11. gui/server/IngestionQueue.js:346
12. gui/server/IngestionQueue.js:356
13. gui/server/IngestionQueue.js:361
14. gui/server/IngestionQueue.js:364
15. gui/server/tests/pdfLocatorEvidence.test.js:117
16. gui/server/tests/pdfLocatorEvidence.test.js:160
17. scripts/Validate-Docs.ps1:15
18. scripts/Validate-Docs.ps1:18
19. scripts/Validate-Docs.ps1:31
20. gui/server/server.js:56
21. gui/server/server.js:61
22. gui/server/server.js:71
23. gui/server/server.js:76
24. gui/server/lib/sourceIdentity.js:49
25. gui/server/lib/sourceIdentity.js:61
26. gui/server/lib/queryLogger.js:29
27. gui/server/lib/queryLogger.js:39
28. gui/server/lib/evalLogSchema.js:4
29. gui/server/lib/evalLogSchema.js:12
30. gui/server/lib/evalLogSchema.js:39
31. logs/query_log.v1.jsonl
32. docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md:10
33. docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md:218
34. docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md:248
35. docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md:262

## Targeted Findings by Incomplete Phase

## Phase B: Extractor and Chunker Provenance (Partially Complete)

### What is already delivered

1. Page-range PDF chunking exists on the structured path.
2. Ingestion persists chunk identity and coarse locator data (`LocatorType`, optional `PageStart`, `PageEnd`).
3. Runtime truth barriers prevent fake page fields on non-page locators.

Evidence:

1. smartChunker emits page-range metadata for per-page chunks: gui/server/lib/smartChunker.js:153, gui/server/lib/smartChunker.js:155, gui/server/lib/smartChunker.js:156.
2. Ingestion persists `ChunkHash`, `LocatorType`, and optional page bounds: gui/server/IngestionQueue.js:346, gui/server/IngestionQueue.js:356, gui/server/IngestionQueue.js:361, gui/server/IngestionQueue.js:364.
3. Tests enforce that flattened legacy PDF flow remains `locatorType === "none"`: gui/server/tests/pdfLocatorEvidence.test.js:117.
4. Tests enforce that structured PDF flow remains single-page `page-range`: gui/server/tests/pdfLocatorEvidence.test.js:160.

### What remains incomplete

1. Full fine-grained locator schema is not yet delivered extractor-by-extractor.
2. Current chunk locator vocabulary is still mixed/coarse (`page-range`, `declaration`, `xml-element`, `section`, `none`) and not yet aligned to the full target field model.

Evidence:

1. Locator variants currently emitted: gui/server/lib/smartChunker.js:193, gui/server/lib/smartChunker.js:325, gui/server/lib/smartChunker.js:377.
2. Persist path currently writes coarse locator plus optional page fields, with no broader locator persistence in the record construction block: gui/server/IngestionQueue.js:356 through gui/server/IngestionQueue.js:364.
3. Phase status explicitly remains partially complete with gate still active: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:580 and docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:589.

### Phase B execution-risk statement

The risk is not missing retrieval functionality; it is false precision. Until extractor-specific locator fidelity is fully evidenced, expanding locator claims would violate the non-negotiable provenance rules.

## Phase E: Documentation and Validator Hardening (In Progress)

### What is already delivered

1. Validator already blocks a bounded stale-runtime term set for canonical/reference-contract docs.
2. Active plan captures an evidence-first inventory workflow rather than bulk edits.

Evidence:

1. Stale-runtime enforcement is scoped and active for canonical/reference-contract doc states: scripts/Validate-Docs.ps1:15.
2. Current term blockers are explicitly enumerated: scripts/Validate-Docs.ps1:18 through scripts/Validate-Docs.ps1:31.
3. Phase E plan explicitly records ongoing status and inventory-governed approach: docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md:10.

### What remains incomplete

1. Validator hardening is still selective, not a complete semantic contract checker for all runtime claims.
2. Phase E still includes unresolved inventory-driven actions and handoff conditions into migration closure.

Evidence:

1. Rule set is finite and regex-term based, indicating bounded rather than exhaustive semantic coverage: scripts/Validate-Docs.ps1:18 through scripts/Validate-Docs.ps1:31.
2. Plan still lists missing rule classes and open gate work: docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md:218.
3. Phase E gate and open status are still explicit: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:621, docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:627.

### Phase E execution-risk statement

The risk is documentation/runtime drift reintroduction via unguarded phrasing. Phase E must finish validator-hardening and canonical synchronization before Phase F can claim stable closure language.

## Phase F: Release and Migration (Not Complete)

### What is already delivered

1. Runtime telemetry moved to v1 query log contract.
2. Legacy query log rotation exists.
3. Eval tooling can enforce v1 schema by default and gate legacy use.

Evidence:

1. Active score schema constants: gui/server/lib/evalLogSchema.js:4 and gui/server/lib/evalLogSchema.js:5.
2. Active/default query log path resolution to v1: gui/server/lib/evalLogSchema.js:12.
3. Optional legacy read path remains behind explicit opt-in: gui/server/lib/evalLogSchema.js:39.
4. Legacy query log rotation is implemented: gui/server/lib/queryLogger.js:29 and gui/server/lib/queryLogger.js:39.
5. Current workspace log evidence includes active v1 file: logs/query_log.v1.jsonl.

### What remains incomplete

1. Legacy fallback branches remain in runtime identity derivation for old records.
2. Full migration closure evidence package and migration-note artifact are not yet present.
3. Phase F gate is still open by program definition.

Evidence:

1. Server still has SourceId fallback path for pre-migration records: gui/server/server.js:56 and gui/server/server.js:61.
2. Server still has ChunkHash fallback path for pre-migration records: gui/server/server.js:71 and gui/server/server.js:76.
3. Source identity module marks content-hash source derivation as deprecated legacy compatibility pending full re-ingest: gui/server/lib/sourceIdentity.js:49 and gui/server/lib/sourceIdentity.js:61.
4. Phase F status and gate are still open in the controlling plan: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:633 and docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:642.
5. No migration-note artifact currently exists under docs search surface: file search for docs/**/*Migration*Note*.md returned no file.

### Phase F execution-risk statement

The risk is declaring closure while legacy corpus rows still depend on fallback identity derivation. Re-ingest and migration evidence must precede fallback retirement.

## Inter-Phase Dependency Analysis

## Dependency Matrix

| Depends On | Enables | Dependency Type | Why It Exists | Evidence |
| --- | --- | --- | --- | --- |
| Phase B | Phase F | Data-contract dependency | Migration closure cannot assert final provenance model while locator fidelity remains only partially delivered and extractor support remains uneven. | docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:580, docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:589, docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:633 |
| Phase E | Phase F | Release-governance dependency | Phase F release closure requires canonical docs and validators to describe/guard the runtime truth being released. | docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:621, docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:627, docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:642 |
| Phase B | Phase E | Documentation truth dependency | Canonical docs and validator rules can only be hardened to what runtime actually supports; locator claims must track delivered extractor evidence. | gui/server/lib/smartChunker.js:153, gui/server/lib/smartChunker.js:193, gui/server/IngestionQueue.js:356, gui/server/tests/pdfLocatorEvidence.test.js:117 |
| Phase E | Phase B | Constraint dependency | Validator hardening constrains wording around locator claims and prevents premature declaration of unsupported fidelity. | scripts/Validate-Docs.ps1:15, scripts/Validate-Docs.ps1:18, docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md:218 |

## Critical Path and Ordering

1. Complete Phase B residual locator-evidence closure for remaining extractor domains.
2. Finalize Phase E canonical/validator alignment against post-B runtime truth.
3. Execute Phase F migration closure (re-ingest evidence + fallback retirement plan + migration note).
4. Re-run regression/contract/doc validation barriers and only then declare program closure.

Rationale:

1. B controls what provenance can be truthfully claimed.
2. E controls whether those claims stay synchronized and enforced.
3. F controls whether legacy compatibility branches can be retired without data-loss or false closure.

## Gate-Readiness Snapshot (Evidence-Backed)

| Phase | Gate in Controlling Plan | Current Readiness | Blocking Conditions |
| --- | --- | --- | --- |
| B | Every emitted chunk must declare valid locator or explicit `none` with justified limitation | Partial | Fine-grained locator fidelity remains incomplete beyond current coarse/page-range path |
| E | No canonical doc may describe obsolete runtime ownership/storage architecture | In progress | Validator hardening still selective; canonical convergence and rule expansion still plan-tracked |
| F | No collection remains on old basename-only operational identity model | Not ready | Legacy fallback branches remain; migration-note evidence artifact absent |

Evidence:

1. Gate definitions and statuses: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:589, docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:627, docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md:642.
2. Legacy fallback and migration-sensitive code surface: gui/server/server.js:61, gui/server/server.js:76, gui/server/lib/sourceIdentity.js:61.
3. Phase E planning still explicitly in-progress with Phase F handoff clauses: docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md:248, docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md:262.

## Proof Summary

This analysis confirms that incomplete work is not independent backlog. It is a dependency chain:

1. Phase B bounds truthful provenance capabilities.
2. Phase E codifies and enforces those truths in canonical docs/validator rules.
3. Phase F closes migration only after B and E make runtime and documentation claims release-safe.

Any attempt to shortcut that ordering creates a high-probability false-closure risk.
