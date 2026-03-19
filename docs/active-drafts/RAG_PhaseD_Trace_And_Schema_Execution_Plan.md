---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md
last_reviewed: 2026-03-17
audience: engineering
---
# Phase D Execution Plan - Retrieval Trace and Score Schema Hardening

## Purpose

This document is the execution plan for the next phase after Phase C closure.

It operationalizes the remaining hardening work for:

1. Full `dropReason` classification in retrieval trace telemetry.
2. Score-schema rollover and archive policy.
3. Fixture and gate completion for regression barriers.
4. Freeze criteria before starting implementation work.

This plan is test-first and gate-driven. Implementation starts only after this plan is approved and validated.

## Scope

### In Scope

1. Implement full `dropReason` classification in `gui/server/server.js`.
2. Add classification points for:
   - `below_min_score`
   - `strict_filter_excluded`
   - `collection_not_ready`
   - `embedding_model_mismatch`
   - `context_budget_exceeded` (already present, must remain)
3. Extend retrieval behavior tests to assert each reason path.
4. Implement score-schema rollover and archive policy for query telemetry.
5. Add versioned log target and archive naming convention.
6. Define and enforce old/new discovery rules in eval tooling.
7. Add WS6 fixture barrier completion for:
   - budget-pruning corpus
   - legacy-log schema corpus
8. Add CI gate assertions tied to the new fixtures.
9. Run and freeze the full gate set.

### Out of Scope

1. New grounding UX beyond current SSE contract.
2. New retrieval ranking algorithms.
3. Cross-document reasoning features.
4. Cloud observability backends.

## Implementation Anchors Reviewed

- `gui/server/server.js`
- `gui/server/lib/queryLogger.js`
- `gui/server/scripts/run-golden-eval.js`
- `gui/server/scripts/run-retrieval-mode-eval.js`
- `gui/server/tests/retrieval.behavior.test.js`
- `gui/server/tests/queryLogger.test.js`
- `gui/server/tests/sse.contract.test.js`
- `docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md`
- `docs/SSE_CONTRACT.md`
- `docs/API_REFERENCE.md`

## Workstream D1 - Full dropReason Classification

### Problem

Current trace output records only `context_budget_exceeded` for dropped candidates.

This prevents clean post-hoc diagnosis across threshold filtering, strict metadata filtering, readiness failure, and model mismatch scenarios.

### Required Changes

1. Introduce classification points in retrieval and approval flow.
2. Ensure every dropped candidate has exactly one `dropReason`.
3. Ensure no approved candidate is duplicated in dropped sets.
4. Preserve backward compatibility for existing `results` projection.

### Classification Rules

1. `below_min_score`: candidate retrieved but filtered by minimum score threshold.
2. `strict_filter_excluded`: candidate removed by strict metadata constraints.
3. `context_budget_exceeded`: candidate retrieved and otherwise eligible but pruned by token budget.
4. `collection_not_ready`: retrieval did not execute due to unavailable collection state.
5. `embedding_model_mismatch`: collection/model compatibility check fails for retrieval path.

### Primary Files

- `gui/server/server.js`
- `gui/server/lib/retrievalModes.js` (if classification helper extraction is needed)
- `gui/server/tests/retrieval.behavior.test.js`
- `gui/server/tests/queryLogger.test.js`

### Test-First Gate

Add failing tests before implementation for each reason path.

Required assertions:

1. Log entry includes dropped candidates with expected `dropReason` value.
2. Approved context contains only non-dropped candidates.
3. `answerReferences` remain subset of approved citations.

## Workstream D2 - Score-Schema Rollover and Archive Policy

### Problem

Score schema fields are present in new entries, but rollover/archive policy is not yet explicit in the runtime logger path.

### Required Changes

1. Introduce a versioned active log target for score schema v1.
2. Move mixed historical logs to an archive path with deterministic naming.
3. Ensure logger discovery rules are explicit in scripts and docs.
4. Ensure compare/eval scripts reject schema-missing input unless explicitly in legacy mode.

### Proposed Storage Contract

1. Active path:
   - `logs/query_log.v1.jsonl`
2. Archive path pattern:
   - `logs/archive/query_log.legacy.<yyyyMMdd-HHmmss>.jsonl`
3. Compatibility behavior:
   - if legacy `logs/query_log.jsonl` exists at upgrade, rotate to archive once.
   - write all new records only to `query_log.v1.jsonl`.

### Discovery Rules

1. Runtime logger writes to active v1 path only.
2. Eval scripts default to active v1 path.
3. Legacy-file analysis requires explicit flag:
   - `--allow-legacy-schema`

### Primary Files

- `gui/server/lib/queryLogger.js`
- `gui/server/server.js` (logger path wiring)
- `gui/server/scripts/run-golden-eval.js`
- `gui/server/scripts/run-retrieval-mode-eval.js`
- `docs/Observability_Execution_Plan.md`

### Test-First Gate

Required failing tests before implementation:

1. Logger rotates legacy file to archive on first v1 initialization.
2. Logger writes only to v1 active target after rotation.
3. Eval scripts fail fast when schema fields are missing and legacy mode is not enabled.

## Workstream D3 - WS6 Fixture Barrier Completion

### Problem

Core provenance tests exist, but fixture corpus coverage is incomplete for the phase gate set.

### Required Corpus Additions

1. Budget-pruning corpus:
   - Controlled multi-chunk query where relevant chunk is retrieved but dropped by context budget.
2. Legacy-log schema corpus:
   - JSONL samples missing `scoreSchemaVersion` and/or `scoreType`.
   - Mixed-format lines to verify strict parser behavior.

### Primary Files

- `gui/server/tests/data/` (new fixture files)
- `gui/server/tests/retrieval.behavior.test.js`
- `gui/server/tests/queryLogger.test.js`
- `gui/server/tests/api.e2e.test.js` (if end-to-end budget corpus assertion is added)
- `gui/server/scripts/run-golden-eval.js`

### Test-First Gate

1. Budget-pruning fixture must assert expected dropped reason and approved subset behavior.
2. Legacy-log fixture must assert strict schema rejection in eval tooling.
3. New tests must be deterministic and not depend on external model behavior.

## Workstream D4 - CI Gate Assertions and Freeze

### Required Gate Set

1. Full server tests:
   - `cd gui/server && npm test`
2. Docs validator:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\Validate-Docs.ps1`
3. Eval scripts with schema checks:
   - `node gui/server/scripts/run-golden-eval.js --mode compare`
   - `node gui/server/scripts/run-retrieval-mode-eval.js`

### Freeze Criteria

All must pass in one verification cycle:

1. New `dropReason` paths covered and green.
2. Rollover policy behavior tested and green.
3. Fixture barrier tests green.
4. Docs validator green with no warnings.
5. Eval scripts enforce schema contract and green.

## Execution Sequence

1. D1 test-first additions for dropReason paths.
2. D1 implementation and targeted test pass.
3. D2 test-first rollover/discovery assertions.
4. D2 implementation and targeted test pass.
5. D3 fixtures + test barriers.
6. D4 full gate run and freeze report.

## Risk Register

1. Risk: Drop reason overlap causes ambiguous classification.
   - Mitigation: enforce precedence order and single-reason invariant in tests.
2. Risk: Log rotation accidentally drops records.
   - Mitigation: atomic rename + post-rotation existence assertions.
3. Risk: Eval scripts break on historical datasets.
   - Mitigation: explicit `--allow-legacy-schema` mode with clear warnings.
4. Risk: Fixture corpus becomes flaky due to model variance.
   - Mitigation: use mocked retrieval responses for barrier logic tests.

## Acceptance Criteria

1. Every dropped candidate in new query logs has a valid `dropReason` from the approved set.
2. Query log storage and archive paths are versioned and deterministic.
3. Eval scripts enforce score schema by default.
4. Budget-pruning and legacy-log fixture barriers are present and enforced.
5. Full gate set passes and is repeatable.

## Validation Commands

```powershell
cd gui/server
npm test
cd ..\..
powershell -ExecutionPolicy Bypass -File .\scripts\Validate-Docs.ps1
node .\gui\server\scripts\run-golden-eval.js --mode compare
node .\gui\server\scripts\run-retrieval-mode-eval.js
```

## Start Condition

Implementation work starts only after:

1. This document is created in-repo.
2. This document is indexed in `docs/DOCS_INDEX.md`.
3. Docs validation passes.
4. Team sign-off on this exact execution scope.
