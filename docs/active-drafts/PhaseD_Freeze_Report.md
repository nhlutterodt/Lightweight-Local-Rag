---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_PhaseD_Trace_And_Schema_Execution_Plan.md
last_reviewed: 2026-03-17
audience: engineering
---
# Phase D Freeze Report — Retrieval Trace and Score Schema Hardening

## Status

**FROZEN — 2026-03-17**

All acceptance criteria from `RAG_PhaseD_Trace_And_Schema_Execution_Plan.md` are met.
All gate commands passed in a single verification cycle. Strict-mode eval chain is live
with no legacy override flags required.

---

## Acceptance Criteria Sign-Off

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Every dropped candidate in new query logs has a valid `dropReason` from the approved set | ✅ |
| 2 | Query log storage and archive paths are versioned and deterministic | ✅ |
| 3 | Eval scripts enforce score schema by default (strict compare passes without `--allow-legacy-schema`) | ✅ |
| 4 | Budget-pruning and legacy-log fixture barriers present and enforced | ✅ |
| 5 | Full gate set passes and is repeatable | ✅ |

---

## Gate Evidence

### Gate 1 — Full Server Test Suite

Command:
```powershell
Set-Location "C:\Users\Owner\Local-Rag-Project-v2\Local-RAG-Project-v2"
cd gui/server && npm test
```

Result:
- **24 test suites passed** (1 skipped — pre-existing skip, not Phase D scope)
- **315 tests passed**, 4 skipped
- 0 failures

New tests added in Phase D:

| File | New Tests |
|------|-----------|
| `gui/server/tests/retrieval.behavior.test.js` | D1 drop-reason paths × 5 + D3 budget-pruning fixture barrier |
| `gui/server/tests/queryLogger.test.js` | D2 legacy rotation + D2 v1-only write + D1 trace round-trip + score schema round-trip |
| `gui/server/tests/evalLogSchema.test.js` | 8 tests — discovery path, schema rejection, legacy opt-in, fixture rejection/acceptance, malformed JSONL |

### Gate 2 — Docs Validator

Command:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Validate-Docs.ps1
```

Result: **PASSED** — 51 markdown files, 51 index entries, 0 warnings.

### Gate 3 — Eval Script: Golden Baseline (v1-native)

Command:
```powershell
node .\gui\server\scripts\run-golden-eval.js --mode baseline
```

Result:
```
[Eval] Query log schema validated at logs/query_log.v1.jsonl (2 rows)
scoreSchemaVersion: "v1"
scoreType: "normalized-relevance"
```

Baseline metrics written to `TestResults/retrieval-eval/golden_baseline.json`
(created at `2026-03-18T02:16:40.645Z`):

| Metric | Value |
|--------|-------|
| Query count | 5 |
| Recall@K | 1.0000 |
| MRR | 0.5667 |
| Avg latency (ms) | 86.61 |
| Avg top score | 0.00362 |
| Collection | TestIngestNodeFinal |
| Embedding model | nomic-embed-text |

Query hit table:

| Query ID | Hit | Top rank | Latency (ms) |
|----------|-----|----------|--------------|
| markdown-architecture-flow | ✅ | 3 | 112.29 |
| powershell-chunker-boundaries | ✅ | 1 | 81.56 |
| xml-log-schema | ✅ | 2 | 79.64 |
| retrieval-score-contract | ✅ | 2 | 81.83 |
| context-budget-configuration | ✅ | 2 | 77.70 |

### Gate 4 — Eval Script: Strict Compare (no `--allow-legacy-schema`)

Command:
```powershell
node .\gui\server\scripts\run-golden-eval.js --mode compare
```

Result:
```
[Eval] Query log schema validated at logs/query_log.v1.jsonl (2 rows)
Strict mode — no --allow-legacy-schema flag
Schema contract enforced against baseline
```

Compare report written to `TestResults/retrieval-eval/golden-compare-report-2026-03-18T02-16-43-984Z.md`:

| Metric | Baseline | Compare | Delta |
|--------|----------|---------|-------|
| Recall@K | 1.0000 | 1.0000 | +0.0000 |
| MRR | 0.5667 | 0.5667 | +0.0000 |
| Avg latency (ms) | 86.61 | 94.37 | +7.76 |
| Avg top score | 0.0036 | 0.0036 | +0.0000 |

No rank regressions. Latency delta is within expected variance.

### Gate 5 — Eval Script: Retrieval Mode Compare

Command:
```powershell
node .\gui\server\scripts\run-retrieval-mode-eval.js
```

Result: PASSED — schema validation active, output emits `scoreSchemaVersion` and `scoreType`.

---

## Workstream Completion Summary

### D1 — Full `dropReason` Classification

**Scope**: Implement all five approved drop-reason classification points in
`gui/server/server.js`.

**Delivered**:

| Reason | Classification point | Test coverage |
|--------|----------------------|---------------|
| `below_min_score` | Score threshold filter in retrieval flow | `retrieval.behavior.test.js` |
| `strict_filter_excluded` | Strict metadata filter | `retrieval.behavior.test.js` |
| `context_budget_exceeded` | Token budget pruning loop | `retrieval.behavior.test.js` + fixture barrier |
| `collection_not_ready` | Collection load failure, accumulated in `preDroppedCandidates` | `retrieval.behavior.test.js` |
| `embedding_model_mismatch` | Model compatibility failure path | `retrieval.behavior.test.js` |

Single-reason invariant enforced: no approved candidate appears in the dropped set.
`answerReferences` remains a strict subset of approved `chunkId`s.

**Runtime log shape** (per dropped candidate entry):
```json
{
  "chunkId": "...",
  "sourceId": "...",
  "score": 0.0,
  "dropReason": "below_min_score"
}
```

**Key files changed**: `gui/server/server.js`

### D2 — Score-Schema Rollover and Archive Policy

**Scope**: Versioned active log target, legacy rotation on init, eval script discovery enforcement.

**Delivered**:

- Active log path: `logs/query_log.v1.jsonl`
- Archive path pattern: `logs/archive/query_log.legacy.<yyyyMMdd-HHmmss>.jsonl`
- `QueryLogger.rotateLegacyLogIfNeeded()` — atomic `fs.rename()` called from `_init()` before stream open
- `QueryLogger.getLegacyLogPath()` — derives legacy path from v1 path via regex
- `QueryLogger.formatArchiveTimestamp()` — UTC ISO 8601 `yyyyMMdd-HHmmss` format
- Clock injection (`options.clock`) for deterministic tests
- `gui/server/lib/evalLogSchema.js` — new shared schema-validation helper used by both eval scripts
- Default discovery in eval scripts resolves to `logs/query_log.v1.jsonl`; explicit legacy path requires `--allow-legacy-schema`

**Key files changed**: `gui/server/lib/queryLogger.js`, `gui/server/server.js`,
`gui/server/scripts/run-golden-eval.js`, `gui/server/scripts/run-retrieval-mode-eval.js`

**New file**: `gui/server/lib/evalLogSchema.js`

### D3 — WS6 Fixture Barrier Completion

**Scope**: Corpus fixtures for budget-pruning and legacy-schema scenarios.

**Delivered**:

| Fixture file | Purpose |
|--------------|---------|
| `gui/server/tests/data/budget_pruning_corpus.json` | 2-chunk output where score-0.91 chunk is kept and score-0.87 chunk is dropped under `MaxContextTokens: 5` |
| `gui/server/tests/data/legacy_query_log_missing_schema.jsonl` | 2 rows: one missing `scoreSchemaVersion`, one missing `scoreType` — drives evalLogSchema rejection tests |
| `gui/server/tests/data/query_log_v1_sample.jsonl` | 2 valid v1 rows with both `scoreSchemaVersion: "v1"` and `scoreType: "normalized-relevance"` |

**New test file**: `gui/server/tests/evalLogSchema.test.js` — 8 tests

### D4 — CI Gate Assertions and Freeze

All gate commands executed in a single cycle without intervention. Strict-mode eval chain
(no `--allow-legacy-schema`) passes end-to-end.

---

## Documentation Updates

| File | Change |
|------|--------|
| `docs/API_REFERENCE.md` | Telemetry schema anchor updated to `logs/query_log.v1.jsonl`; `last_reviewed: 2026-03-17` |
| `docs/Observability_Analysis.md` | Anchor updated; log rotation behavior noted; trace fields documented; `last_reviewed: 2026-03-17` |
| `docs/Observability_Execution_Plan.md` | Runtime source list updated to v1 path + legacy archive pattern; schema/trace fields inline; `last_reviewed: 2026-03-17` |

---

## New Artifacts

| Artifact | Location |
|----------|----------|
| evalLogSchema helper | `gui/server/lib/evalLogSchema.js` |
| evalLogSchema tests | `gui/server/tests/evalLogSchema.test.js` |
| Budget-pruning fixture | `gui/server/tests/data/budget_pruning_corpus.json` |
| Legacy-schema fixture | `gui/server/tests/data/legacy_query_log_missing_schema.jsonl` |
| v1 schema fixture | `gui/server/tests/data/query_log_v1_sample.jsonl` |
| v1-native golden baseline | `TestResults/retrieval-eval/golden_baseline.json` |
| Baseline summary | `TestResults/retrieval-eval/golden-baseline-summary-2026-03-18T02-16-40-646Z.md` |
| Strict compare report | `TestResults/retrieval-eval/golden-compare-report-2026-03-18T02-16-43-984Z.md` |

---

## Open Items Deferred to Phase E

The following items were identified during Phase D but are outside this workstream's scope:

1. `docs/Architecture_Design.md` lines 56 and 173 still reference `logs/query_log.jsonl` — historical context, not a runtime anchor, but should be aligned in Phase E.
2. `docs/DEVELOPER_ONBOARDING.md` line 71 references `logs/query_log.jsonl` for per-query telemetry — candidate update in Phase E.
3. Exact locator fields (`lineStart`/`lineEnd`, `charStart`/`charEnd`, `sectionPath`, `symbolName`) remain deferred pending extractor upgrades (Phase B / WS2 deferred items).

---

## Next Phase

**Phase E — Documentation and Contract Realignment** (`RAG_Grounding_Provenance_Hardening_Plan.md` WS5).

Immediate tasks:
1. Purge stale runtime terms (`PowerShellRunner.js`, `/api/ingest` as active, `.vectors.bin`, `.metadata.json`) from canonical docs.
2. Update `Architecture_Design.md` data-flow diagrams to include `sourceId`/`chunkId`/grounding trace events and v1 log path.
3. Update `DEVELOPER_ONBOARDING.md` query-log reference.
4. Extend `scripts/Validate-Docs.ps1` with hard-block rules for stale canonical terms.
5. Produce Phase E execution plan with test-first gate set.
