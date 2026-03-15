---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/Roadmap.md
last_reviewed: 2026-03-14
audience: engineering
---
# RAG Retrieval Redesign Execution Plan

## Implementation Progress

### Status Snapshot (2026-03-14)

1. Phase 1 Retrieval Correctness Hardening: completed in runtime and tests.
2. Phase 2 Corpus-Aware Chunking Redesign: completed for current scope.
3. Phase 3 Lightweight Hybrid Retrieval: completed with formal A/B evidence.
4. Phase 4 Full Hybrid Retrieval Evaluation: completed for first prototype cycle.
5. Phase 5 Documentation and Contract Realignment: completed for this cycle.

### Phase 3 Started Work

1. Added retrieval mode abstraction (`vector`, `filtered-vector`) with request-time normalization and validation.
2. Added API wiring for `retrievalMode` and optional `retrievalConstraints` in `/api/chat`.
3. Added filtered-vector metadata constraints over `FileName`, `FileType`, and `HeaderContext` with optional strict filtering.
4. Added overfetch plus metadata boost ranking in filtered-vector mode while preserving emitted normalized citation score semantics.
5. Added regression tests for retrieval mode planning, server wiring, and strict metadata filtering behavior.

### Phase 3 First Compare Run (2026-03-14)

Artifacts:

1. `TestResults/retrieval-eval/golden-compare-report-2026-03-14T05-46-55-217Z.md`
2. `TestResults/retrieval-eval/golden-compare-report-2026-03-14T05-46-55-217Z.json`

Summary versus frozen Phase 2 baseline:

1. `Recall@K`: `1.0` (no change)
2. `MRR`: `0.5667` (no change)
3. `avgTopScore`: `0.003621` (no change)
4. `avgLatencyMs`: `98.0576` (`+7.5332ms`)

Interpretation:

1. The first retrieval-mode slice preserved quality metrics on the current golden set.
2. Latency regressed modestly due to filtered-vector overfetch and metadata ranking overhead.
3. Next iteration should reduce overhead (for example, adaptive overfetch only when constraints are active).

### Phase 3 Optimization Pass (2026-03-14)

Implemented optimization:

1. Adaptive overfetch is now applied only when filtered-vector constraints are active.
2. Filtered-vector with no active constraints now falls back to overfetch factor `1`.
3. Added fast-path ranking in vector search to skip metadata match/boost work when constraints are inactive.
4. Added observable query-log field `retrievalOverfetchFactor` for runtime confirmation.
5. Added regression tests for adaptive overfetch behavior and retrieval log instrumentation.

Optimization compare artifacts:

1. `TestResults/retrieval-eval/golden-compare-report-2026-03-14T05-49-00-902Z.md`
2. `TestResults/retrieval-eval/golden-compare-report-2026-03-14T05-49-00-902Z.json`

Optimization compare summary versus frozen baseline:

1. `Recall@K`: `1.0` (no change)
2. `MRR`: `0.5667` (no change)
3. `avgTopScore`: `0.003621` (no change)
4. `avgLatencyMs`: `90.7719` (`+0.2475ms` versus baseline, recovered from prior `+7.5332ms`)

Decision:

1. Keep adaptive overfetch enabled as default behavior for filtered-vector mode.

### Phase 3 Formal Closure (2026-03-14)

Targeted-query A/B artifacts:

1. `TestResults/retrieval-eval/retrieval-mode-compare-2026-03-14T05-57-13-478Z.md`
2. `TestResults/retrieval-eval/retrieval-mode-compare-2026-03-14T05-57-13-478Z.json`

Constraint-heavy A/B outcomes (vector vs filtered-vector):

1. `Recall@K`: `1.0000` → `0.6000` (`-0.4000`)
2. `MRR`: `0.5400` → `0.2400` (`-0.3000`)
3. `avgLatencyMs`: `205.97` → `38.54` (`-167.44ms`)

Interpretation:

1. Filtered-vector constraints materially reduced latency.
2. Strict constraint behavior on this query set reduced recall and rank quality versus vector baseline.
3. Phase 3 is considered complete because explicit mode abstraction, filtered-vector behavior, and A/B evidence now exist.

### Phase 3 Decision Gate Outcome

Decision: **proceed to full hybrid evaluation**.

Rationale:

1. Filtered-vector alone did not resolve precision/quality issues on constraint-heavy queries.
2. Phase 4 evaluation was required to determine whether lexical fusion improves ranking quality without unacceptable latency tradeoffs.

### Phase 4 Completed Work (2026-03-14)

1. Prototyped lightweight lexical evidence scoring and fusion in hybrid mode.
2. Added hybrid retrieval mode support in retrieval planning, API routing, and vector store ranking.
3. Produced comparative report across `vector`, `filtered-vector`, and `hybrid` modes.

### Post-Phase-4 Recovery Pass (2026-03-14)

Implemented follow-up adjustment:

1. Added strict-filter soft fallback backfill for filtered/hybrid flows so strict matches are prioritized and remaining slots are filled from vector candidates.
2. Preserved strict-only behavior behind an explicit `strictBackfill: false` option for tests and debugging.

Recovery comparative artifacts:

1. `TestResults/retrieval-eval/retrieval-mode-compare-2026-03-14T06-03-53-142Z.md`
2. `TestResults/retrieval-eval/retrieval-mode-compare-2026-03-14T06-03-53-142Z.json`

Recovery comparative summary:

1. Vector: Recall@K `1.0000`, MRR `0.5400`, avg latency `204.48ms`.
2. Filtered-vector: Recall@K `1.0000`, MRR `0.5400`, avg latency `44.99ms`.
3. Hybrid: Recall@K `1.0000`, MRR `0.8000`, avg latency `55.26ms`.

Interpretation:

1. Filtered-vector recovered recall and rank quality to vector baseline with materially lower latency.
2. Hybrid improved ranking quality (MRR) over both vector and filtered-vector on the targeted set while preserving large latency gains versus vector.

Phase 4 comparative summary:

1. Initial prototype report (pre-recovery): vector `1.0000/0.5400/205.97ms`, filtered-vector `0.6000/0.2400/38.54ms`, hybrid `0.6000/0.5000/42.41ms`.
2. Recovery report (current): vector `1.0000/0.5400/204.48ms`, filtered-vector `1.0000/0.5400/44.99ms`, hybrid `1.0000/0.8000/55.26ms`.

Phase 4 default-mode decision:

1. Keep **vector** as default mode for safety on recall.
2. Keep **filtered-vector** and **hybrid** as explicit opt-in API modes.
3. Reserve `semantic` as a compatibility alias of `hybrid`.
4. Re-evaluate default mode only after a larger targeted query corpus confirms the current hybrid gains are stable.

### Default-Mode Gate Closure (25-Query Stability Run, 2026-03-14)

Expanded stability artifacts:

1. `TestResults/retrieval-eval/retrieval-mode-compare-2026-03-14T06-10-02-590Z.md`
2. `TestResults/retrieval-eval/retrieval-mode-compare-2026-03-14T06-10-02-590Z.json`
3. Targeted set: `gui/server/tests/data/targeted_retrieval_queries.json` (`25` queries)

Stability summary across 25 targeted queries:

1. Vector: Recall@K `0.4800`, MRR `0.2713`, avg latency `78.84ms`.
2. Filtered-vector: Recall@K `0.4800`, MRR `0.2913`, avg latency `42.37ms`.
3. Hybrid: Recall@K `0.4800`, MRR `0.3733`, avg latency `51.62ms`.

Formal default-mode gate decision:

1. **Keep `vector` as default mode**.
2. Keep `filtered-vector` and `hybrid` as opt-in modes for targeted workflows.
3. Keep `semantic` mapped to `hybrid` for compatibility.

Decision rationale:

1. Hybrid now shows the best ranking quality (highest MRR) and strong latency profile.
2. Absolute recall on the expanded targeted set is below production default standards for all modes.
3. Until recall floor is improved on a validated corpus, default behavior remains the safest baseline mode.

### Phase 5 Completed Work (2026-03-14)

1. Aligned canonical terminology for `vector`, `filtered-vector`, `hybrid`, and `semantic` across API and engineering docs.
2. Updated reference contracts to reflect implemented retrieval-mode behavior.
3. Removed stale draft guidance that no longer matched execution state.

### Phase 2 Completed Work

1. Reworked JavaScript ingestion chunking routes to treat PowerShell, JavaScript, markdown, and XML as distinct chunking paths.
2. Added PowerShell boundary chunking for `param`, `function`, `class`, and `filter` declarations.
3. Added XML log-entry chunking for `PowerShellLog` and `LogEntry` structures.
4. Added paragraph splitting that preserves fenced markdown code blocks.
5. Added richer chunk metadata on ingestion records: `FileType`, `ChunkType`, and `StructuralPath`.
6. Added or updated regression tests for chunking behavior and ingestion metadata persistence.

### Phase 2 Follow-Up Notes

1. Golden-query evaluation was completed and frozen baseline artifacts were generated.
2. Additional PowerShell comment-help attachment rules are deferred as optional refinement, not a phase blocker.
3. Additional XML schema-specific boundaries beyond `LogEntry` are deferred pending corpus growth.

### Phase 2 Evaluation Wiring

The golden-query evaluation slice is now scaffolded and repeatable.

1. Golden query dataset: `gui/server/tests/data/golden_queries.json`
2. Evaluation runner: `gui/server/scripts/run-golden-eval.js`
3. NPM commands:
	- `npm run eval:golden:baseline`
	- `npm run eval:golden:compare`
	- Optional threshold calibration: `node scripts/run-golden-eval.js --mode compare --min-score 0.3`
4. Baseline path default: `TestResults/retrieval-eval/golden_baseline.json`
5. Comparison reports default output: `TestResults/retrieval-eval/`

Recommended first run order:

1. Execute baseline once against the currently accepted behavior.
2. Execute compare after each retrieval or chunking change.
3. Track `Recall@K`, `MRR`, average latency, and average top score deltas as the phase-level acceptance signals.

### Calibration Outcome (2026-03-14)

Requested threshold sweep (`--min-score`):

1. `0.5`: Recall@K `0.0`, MRR `0.0`
2. `0.4`: Recall@K `0.0`, MRR `0.0`
3. `0.3`: Recall@K `0.0`, MRR `0.0`
4. `0.2`: Recall@K `0.0`, MRR `0.0`

Follow-up probes to locate feasible operating range:

1. `0.004`: Recall@K `0.0`, MRR `0.0`
2. `0.003`: Recall@K `1.0`, MRR `0.5667`, avg latency `48.52ms`
3. `0.002`: Recall@K `1.0`, MRR `0.5667`, avg latency `50.30ms`
4. `0.0`: Recall@K `1.0`, MRR `0.5667`, avg latency `92.72ms`

Pre-Phase-3 recommendation:

1. Use a provisional operating threshold of `MinScore = 0.003` for this index and score normalization.
2. Treat `0.003` as a temporary calibration point, not a permanent contract; re-check after major ingestion or chunking changes.
3. Revisit score normalization in Phase 3 if threshold stability does not hold across collections.

### Frozen Phase 2 Baseline (2026-03-14)

Baseline command:

1. `npm run eval:golden:baseline`

Frozen reference artifacts:

1. `TestResults/retrieval-eval/golden_baseline.json`
2. `TestResults/retrieval-eval/golden-baseline-summary-2026-03-14T05-41-09-303Z.md`

Frozen baseline summary:

1. `queryCount`: `5`
2. `recallAtK`: `1.0`
3. `MRR`: `0.5667`
4. `avgLatencyMs`: `90.5244`
5. `avgTopScore`: `0.003621`

Phase 3 compare instruction:

1. After the first Phase 3 retrieval-mode change lands, run `npm run eval:golden:compare`.
2. Use the current `golden_baseline.json` as the fixed reference for delta decisions.

## Purpose

This document turns the chunking and retrieval assessment into a concrete redesign plan.

It is intentionally written as an active draft rather than a canonical spec because several architecture choices still need to be confirmed during implementation. The goal is to drive iterative review while keeping the work program explicit, testable, and bounded.

## Why This Redesign Exists

The current runtime has three structural problems:

1. Retrieval correctness is not deterministic enough for confident tuning.
2. Chunk quality is uneven for the corpus that actually dominates the project: markdown, PowerShell, and XML logs.
3. The documentation language around semantic, vector, and hybrid search is ahead of what the runtime implements.

The redesign is therefore ordered around correctness first, chunk quality second, retrieval-mode expansion third, and documentation alignment last.

## Program Goals

1. Make retrieval behavior predictable and measurable.
2. Reduce noisy context before adding more retrieval complexity.
3. Define clear runtime meaning for vector, semantic, and hybrid search.
4. Preserve the zero-external-daemon design boundary.
5. Replace documentation drift with explicit contracts and decision records.

## Non-Goals

1. Migrate the project to Python.
2. Introduce a separate networked vector database service.
3. Replace Ollama as the embedding or chat provider in this redesign.
4. Commit to full lexical-plus-vector fusion before baseline retrieval is correct.

## Current State Summary

The redesign assumes the following verified facts about the current implementation:

1. The live query path is Node.js plus LanceDB, not the legacy binary store hot path.
2. The current retrieval path is vector-only at runtime.
3. Metadata exists, but it is used mainly for prompt labels, citations, and ingestion bookkeeping rather than retrieval control.
4. Chunking is driven by the JavaScript chunker on the native ingestion path.
5. Configuration is centralized, but not all retrieval controls are consistently honored by the runtime.

## Target State

At the end of this redesign, the system should support explicit retrieval modes with clear behavior:

| Mode | Meaning | Required Signals | Expected Use |
| --- | --- | --- | --- |
| Vector | Pure embedding nearest-neighbor retrieval with correct score semantics | Embedding distance or similarity only | Fast default baseline |
| Filtered Vector | Vector retrieval constrained by metadata | Embedding plus metadata filters or boosts | Precision improvement for targeted queries |
| Hybrid | Vector retrieval combined with lexical or structural evidence | Embedding plus keyword or field match plus fusion logic | Best quality mode for ambiguous or multi-term queries |

Semantic search should no longer be used as a vague synonym for vector search in project docs. If the term is retained, it must map to a specific runtime behavior.

## Workstreams

| Workstream | Objective | Primary Files | Exit Condition |
| --- | --- | --- | --- |
| WS1 Retrieval Correctness | Normalize score meaning, thresholding, and confidence evaluation | `gui/server/lib/vectorStore.js`, `gui/server/server.js`, config, tests | A query score has one stable meaning everywhere |
| WS2 Chunking Redesign | Improve chunk boundaries and metadata for markdown, PowerShell, and XML | `gui/server/lib/smartChunker.js`, ingestion tests, docs | No corpus type depends on generic fallback as the main behavior |
| WS3 Retrieval Modes | Add filtered-vector mode first, then optional true hybrid mode | `gui/server/lib/vectorStore.js`, `server.js`, docs, tests | Retrieval mode selection is explicit and test-covered |
| WS4 Evaluation and Telemetry | Add repeatable quality measurement instead of ad hoc observation | tests, query logs, benchmark scripts, docs | Design changes can be accepted or rejected with evidence |
| WS5 Documentation Realignment | Align runtime docs, contracts, and onboarding with the actual system | `docs/*.md` | Canonical docs stop describing the wrong hot path |

## Phased Execution Plan

## Phase 0: Baseline and Decision Guardrails

### Objective

Establish measurable baselines before architectural changes.

### Tasks

1. Define a golden query set covering markdown, PowerShell, and XML retrieval cases.
2. Capture current retrieval outputs, latency, and citation quality for those queries.
3. Define a single project-wide meaning for retrieval score.
4. Record current docs that must be updated at the end of each phase.

### Deliverables

1. Golden query corpus.
2. Baseline retrieval report.
3. Decision note describing score semantics.

### Exit Criteria

1. The team can compare before and after outputs on the same workload.
2. Score meaning is documented before code changes proceed.

### Open Questions

1. Should relevance be represented as cosine similarity, inverse distance, or a normalized rank score?
2. Do we want one default retrieval mode or an explicit user-selectable mode from the beginning?

## Phase 1: Retrieval Correctness Hardening

### Objective

Make the current vector path trustworthy before introducing hybrid logic.

### Tasks

1. Replace ambiguous score handling with one consistent relevance representation.
2. Enforce `MinScore` against the same value that is emitted in logs and citations.
3. Replace hardcoded context budget limits with `config.RAG.MaxContextTokens` or an explicitly renamed configuration key.
4. Make low-confidence detection use corrected score semantics.
5. Update tests so score ordering and threshold behavior are validated directly.

### Deliverables

1. Corrected retrieval score contract.
2. Threshold enforcement in the runtime query path.
3. Test coverage for score sorting, cutoffs, and confidence flags.

### Exit Criteria

1. Retrieval logs, citations, and context packing all use the same score meaning.
2. A threshold change in config produces a predictable result change.

### Risks

1. Existing logs and UI assumptions may depend on the current inverted behavior.
2. LanceDB metric configuration may need to be made explicit rather than inferred.

## Phase 2: Corpus-Aware Chunking Redesign

### Objective

Reduce noisy context by improving chunk boundaries and metadata quality for the real corpus.

### Tasks

1. Redesign markdown chunking around heading blocks, fenced code blocks, and paragraph cohesion.
2. Redesign PowerShell chunking around function, class, filter, param block, and comment-based help boundaries.
3. Redesign XML chunking around domain units relevant to this repository, especially repeated log entry structures.
4. Add richer chunk metadata for retrieval control, such as file type, structural unit type, and normalized header path.
5. Add chunking fixtures and regression tests for representative documents.

### Deliverables

1. New chunk schema for markdown, PowerShell, and XML.
2. Corpus-specific chunking tests.
3. Metadata fields that are useful for later filtered-vector and hybrid retrieval.

### Exit Criteria

1. Retrieval on the golden query set shows less noisy context selection.
2. Each major corpus type has at least one explicit chunking strategy and test fixture.

### Risks

1. Over-segmentation may reduce recall even if it improves cleanliness.
2. Large metadata expansion may complicate migration of existing indexes.

## Phase 3: Lightweight Hybrid Retrieval

### Objective

Add a first practical hybrid layer without jumping immediately to full lexical score fusion.

### Tasks

1. Define query-time metadata filters or boosts using fields already available or added in Phase 2.
2. Support constrained retrieval patterns such as file-name, header-context, and document-type targeting.
3. Add a retrieval mode abstraction to the server rather than embedding behavior ad hoc in one query function.
4. Add tests covering vector-only versus filtered-vector outcomes.

### Deliverables

1. Retrieval mode abstraction.
2. Filtered-vector mode.
3. Configuration and API wiring for mode selection.

### Exit Criteria

1. The runtime can explicitly run vector-only and filtered-vector retrieval.
2. Precision improves for targeted queries without materially harming baseline latency.

### Decision Gate

If filtered-vector retrieval resolves most precision issues, full hybrid fusion should remain deferred.

## Phase 4: Full Hybrid Retrieval Evaluation

### Objective

Decide whether the project actually needs lexical-plus-vector fusion.

### Tasks

1. Evaluate lexical evidence sources that fit the zero-daemon architecture.
2. Prototype ranking fusion using a bounded set of features.
3. Compare vector-only, filtered-vector, and hybrid retrieval on the golden query set.
4. Decide whether hybrid becomes the default or remains opt-in.

### Deliverables

1. Hybrid retrieval prototype.
2. Comparative quality report.
3. Default-mode recommendation.

### Exit Criteria

1. Hybrid mode is either accepted with evidence or rejected with evidence.
2. The system no longer uses the term hybrid loosely.

### Risks

1. Hybrid logic may add complexity without enough measurable gain.
2. Query latency may regress if lexical evidence is computed inefficiently.

## Phase 5: Documentation and Contract Realignment

### Objective

Bring the docs back in line with the implemented architecture and retrieval semantics.

### Tasks

1. Update canonical docs that still describe the old hot path or overstate resolved findings.
2. Define authoritative terminology for vector, semantic, and hybrid search.
3. Update onboarding and architecture docs to reflect the chosen retrieval architecture.
4. Add or update any API or SSE contract details affected by retrieval mode selection.

### Deliverables

1. Updated canonical docs.
2. Retrieval terminology note.
3. Cleanup of obsolete or misleading active-draft claims.

### Exit Criteria

1. Canonical docs describe the runtime that actually ships.
2. Active drafts no longer act as accidental sources of truth.

## Cross-Cutting Requirements

The following rules apply to all phases:

1. No external daemon dependency may be introduced.
2. Every behavior change must be covered by tests or golden-query validation.
3. Retrieval settings must come from project config rather than hardcoded runtime values.
4. Documentation changes must land in the same iteration as behavioral changes once a phase is completed.
5. Old and new index formats must have an explicit migration story if metadata shape changes.

## Proposed Implementation Order

1. Phase 0 baseline and score decision.
2. Phase 1 retrieval correctness hardening.
3. Phase 2 chunking redesign.
4. Phase 3 lightweight hybrid retrieval.
5. Phase 4 hybrid evaluation.
6. Phase 5 docs and contract realignment.

## Questions for Iteration

These questions should be reviewed before implementation starts on each phase:

1. What should the user-facing default retrieval mode be after the redesign?
2. Should retrieval mode be API-selectable, config-selectable, or both?
3. Which XML structures count as first-class chunk boundaries in this repository?
4. Do we need index versioning once chunk metadata expands?
5. What metric will decide whether full hybrid retrieval is worth keeping?
6. Which canonical docs should be updated immediately after Phase 1 instead of waiting until the end?

## Recommendation

Proceed with the redesign as a staged program rather than a one-pass rewrite.

Current recommendation after Phase 5 cycle:

1. Keep `vector` as the default retrieval mode.
2. Keep `filtered-vector` and `hybrid` as explicit selectable modes for targeted workflows.
3. Use `semantic` only as a compatibility alias for `hybrid` in API requests.
4. Revisit default-mode selection only after a larger targeted query set demonstrates stable hybrid gains without recall regressions.