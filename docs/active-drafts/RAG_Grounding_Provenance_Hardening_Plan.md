---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/Technical_Component_Design.md
last_reviewed: 2026-03-16
audience: engineering
---
# RAG Grounding and Provenance Hardening Plan

## Purpose

This document is the implementation artifact for permanently closing the current grounding, provenance, observability, and documentation drift gaps in the local RAG runtime.

The goal is not to make the system merely retrieve relevant chunks. The goal is to make the system able to prove, preserve, and expose exactly what source material was retrieved, what portion was promoted into the prompt, what the model was allowed to rely on, and what references can be emitted to the user without inventing unsupported attribution.

This plan is intentionally stricter than the prior retrieval redesign work. It treats provenance and grounding as contract surfaces rather than best-effort metadata.

## Evidence Baseline

The plan is driven by current implementation evidence, not by historical design assumptions.

### Verified Runtime Facts

1. Live ingestion is Node-native in `gui/server/IngestionQueue.js`; the deprecated `/api/ingest` route in `gui/server/server.js` returns `410` and points callers to `/api/queue`.
2. Live retrieval and prompt assembly are Node-native in `gui/server/server.js`, `gui/server/lib/vectorStore.js`, and `gui/server/lib/retrievalModes.js`.
3. The manifest currently keys entries by lowercase `FileName` rather than a stable source identifier in `gui/server/lib/documentParser.js`.
4. LanceDB mutation and cleanup are currently performed by `FileName` equality in `gui/server/IngestionQueue.js`.
5. The model receives one concatenated context string in `server.js`; citations are emitted separately and are not bound to generated claims.
6. PDF ingestion currently flattens text via `pdf2json` raw extraction without page-level provenance being persisted.
7. Query logging captures only approved prompt inputs, not the full retrieved candidate set or dropped-by-budget reasons.
8. Canonical documentation is split between accurate Node-first runtime docs and stale PowerShell-ingestion narratives.
9. Historic `Logs/query_log.jsonl` entries contain score values inconsistent with the current normalized score contract.

## Project Standards Baseline

This plan must be executed inside the repository's existing standards, not alongside them.

### Architecture and Runtime Standards

Verified against `docs/DEVELOPER_ONBOARDING.md`, `docs/Architecture_Design.md`, `docs/Technical_Component_Design.md`, and the live server code:

1. Node.js owns the hot path and the active ingestion runtime.
2. PowerShell remains a utility and diagnostics layer, not the primary request-time or ingestion-time execution engine.
3. The project permits embedded LanceDB in-process usage, but rejects new external daemon dependencies.
4. Retrieval, prompt assembly, queue orchestration, and SSE behavior are contract-sensitive runtime seams.

### Security Standards

Verified against `docs/SECURITY.md` and current endpoint behavior:

1. API binding must remain loopback-only.
2. CORS must remain explicitly restricted.
3. File access must remain confined to validated allowed roots with canonical containment checks.
4. Browse and queue ingestion path validation must preserve the current symlink/junction rejection policy.
5. Error contracts must not leak raw filesystem or internal exception details to the browser.

### Contract and Testing Standards

Verified against `docs/SSE_CONTRACT.md`, `docs/API_REFERENCE.md`, and the current Jest suites:

1. SSE changes require synchronized updates to server behavior, client parsing, documentation, and contract tests.
2. API behavior changes require synchronized updates to reference docs and tests.
3. Regression protection already exists through Jest, Supertest, SSE contract tests, retrieval behavior tests, and doc validation.
4. Query semantics, citation semantics, and timing semantics are already treated as explicit contracts, not implementation details.

### Documentation Governance Standards

Verified against `docs/DOCS_GOVERNANCE.md`, `docs/DOCS_INDEX.md`, and `scripts/Validate-Docs.ps1`:

1. Canonical and reference-contract docs are authoritative.
2. Active drafts can drive implementation, but cannot be allowed to drift from canonical runtime truth indefinitely.
3. Every markdown file must be indexed and frontmatter-valid.
4. Validator failures are hard blockers, not warnings to ignore.

### Observability Standards

Verified against `docs/Observability_Analysis.md` and existing runtime seams:

1. New telemetry paths must be explainable against implementation anchors, not only documentation narratives.
2. Query logs, health endpoints, queue state, and bridge logs are existing observability surfaces and must remain internally coherent.
3. Timing and retrieval telemetry should be durable enough for offline analysis, not only visible in live headers or console output.

## Pre-Phase-A Analysis Gate

Phase A must not start immediately. The current plan contains design intentions that still require direct repository-backed analysis and decision records before schema or contract changes begin.

The purpose of this gate is to eliminate assumptions that would otherwise harden the wrong identity model, the wrong locator model, or the wrong stream contract.

### Rule

No Phase A implementation PR may merge until every item in the assumption register below has one of these outcomes:

1. verified by code and fixtures
2. verified by a standards-backed decision record
3. explicitly deferred with a justified boundary that does not block Phase A

## Assumption Register To Eliminate Before Phase A

### A1. Source Identity Semantics

Current assumption in the plan:

1. `sourceId` should be `sha256(normalizedCanonicalSourcePath)`.

Why this is not yet safe enough:

1. Rename handling currently relies on content hash lineage, not path identity.
2. A pure path-hash identity may break desired rename semantics.
3. A pure path-hash identity may also make root relocation or portable corpus moves appear as entirely new sources.

Required analysis:

1. Compare three candidate identity models:
  - path-derived identity
  - content-derived identity
  - composite identity with persistent source lineage and current path
2. Evaluate each model against rename detection, orphan cleanup, duplicate basenames, root relocation, and integrity scanning.
3. Document the chosen source-identity contract and the rejected alternatives.

Phase A blocker:

1. Do not add `sourceId` until its semantics are explicitly chosen for both rename and relocation behavior.

### A2. Chunk Identity Stability Semantics

Current assumption in the plan:

1. `chunkId` should be deterministic from `sourceId`, chunk index, and content hash.

Why this is not yet safe enough:

1. Small edits earlier in a document may shift all chunk indices.
2. A chunk ID that overfits index position may create unnecessary churn in citations and traces.
3. A chunk ID that overfits content hash may make small whitespace edits destroy useful continuity.

Required analysis:

1. Evaluate whether `chunkId` is required to be stable across re-ingests of lightly edited files, or only stable within a given index version.
2. Define separate roles for `chunkId`, `chunkHash`, and `chunkOrdinal` if needed.
3. Verify how integrity tooling and answer reference resolution should treat chunk churn.

Phase A blocker:

1. Do not finalize the chunk schema until chunk identity lifetime is explicitly defined.

### A3. Locator Feasibility By File Type

Current assumption in the plan:

1. Markdown, PowerShell, XML, plain text, and PDF can all emit durable locators in the desired form.

Why this is not yet safe enough:

1. Current chunkers do not persist line or offset metadata.
2. The active PDF extraction path uses `pdf2json` raw text flattening and may not expose the exact page or block fidelity assumed by the plan.
3. XML locator quality depends on whether line mappings can be preserved without introducing a fragile parser path.

Required analysis:

1. Verify the actual extractor outputs available today for each supported file type.
2. Produce a locator support matrix with `required`, `supported`, `unsupported`, and `fallback` states per file type.
3. For each unsupported locator type, define the domain-safe fallback behavior.

Phase A blocker:

1. Do not promise `lineStart`, `lineEnd`, `pageStart`, or `pageEnd` universally until the support matrix is complete.

### A4. Prompt and Answer Reference Reliability

Current assumption in the plan:

1. The model can be instructed to emit machine-readable `chunkId` references reliably enough for production use.

Why this is not yet safe enough:

1. The current SSE and client parsing model only assumes `status`, `metadata`, and token events.
2. Model-emitted inline references may be noisy or malformed.
3. The project standards require contract-backed behavior, not prompt optimism.

Required analysis:

1. Compare three grounding-reference designs:
  - model emits inline chunk tags
  - server post-processes explicit answer-reference blocks
  - server emits approved citations only and treats references as UI-side evidence, not LLM-authored artifacts
2. Evaluate each design for determinism, parseability, streaming compatibility, and client complexity.
3. Define the minimum acceptable answer-reference contract for the first implementation slice.

Phase A blocker:

1. Do not change the SSE contract until the reference-emission design is selected and test strategy is written.

### A5. Client Compatibility and Stream Migration Strategy

Current assumption in the plan:

1. The client can absorb new grounding events without breakage.

Why this is not yet safe enough:

1. `useRagApi.js` currently parses the existing SSE payload model.
2. Contract tests currently assert the current event set and shapes.
3. A breaking stream change can silently degrade chat UX even if the backend is correct.

Required analysis:

1. Audit the current client event parser and message reducer paths.
2. Define whether grounding events will be additive, versioned, or breaking.
3. Plan a compatibility window if both old and new event forms must coexist temporarily.

Phase A blocker:

1. No stream shape changes without a migration strategy that preserves current UI behavior.

### A6. Telemetry Retention and Rotation Strategy

Current assumption in the plan:

1. Query log rotation and schema rollover can be introduced without conflicting with current logging and analysis workflows.

Why this is not yet safe enough:

1. Logging retention is configured centrally, but the JSONL logger currently appends directly.
2. Eval scripts and offline analysis may implicitly assume a single file path.
3. Historical mixed-schema logs already exist.

Required analysis:

1. Define the authoritative query-log path contract after schema versioning is introduced.
2. Define archive naming, retention ownership, and eval-script discovery rules.
3. Decide whether the logger or an operational maintenance routine owns rotation.

Phase A blocker:

1. Do not introduce `scoreSchemaVersion` without also defining the storage and discovery contract for new versus historical logs.

### A7. Migration Burden and Re-index Strategy

Current assumption in the plan:

1. Existing collections can be re-indexed into the new provenance model as a later release step.

Why this is not yet safe enough:

1. Manifest migration, LanceDB row-shape migration, and integrity tooling updates are coupled.
2. Some schema changes may be impractical to backfill without full re-ingestion.
3. The project already uses migration tables for queue and manifest schema evolution.

Required analysis:

1. Distinguish fields that can be migrated in place from fields that require full re-ingest.
2. Define manifest versioning and migration-table changes before Phase A code lands.
3. Define rollout order so integrity tooling remains truthful during mixed-state transitions.

Phase A blocker:

1. No schema work should begin until the migration strategy is specified at manifest, DB, and tooling levels.

### A8. Evaluation Floor and Success Metrics

Current assumption in the plan:

1. Existing eval scripts and datasets are sufficient to validate provenance and grounding changes.

Why this is not yet safe enough:

1. Current retrieval evals focus on retrieval quality and latency, not provenance correctness.
2. There is no current corpus proving duplicate-basename safety, locator fidelity, or answer-reference validity.
3. The repo’s standards require regression blockers, not informal confidence.

Required analysis:

1. Define new provenance-specific fixture corpora and assertion strategy.
2. Define minimum acceptance metrics for provenance correctness separate from recall and MRR.
3. Decide which tests are merge blockers from the first Phase A PR onward.

Phase A blocker:

1. Phase A must start by adding failing provenance tests, not by writing schema code first.

## Required Pre-Phase-A Deliverables

Before Phase A starts, the following artifacts must exist.

1. A standards-backed decision record for source identity semantics.
2. A chunk identity lifetime definition.
3. A locator support matrix for all supported file types.
4. A stream-contract migration note for grounding events.
5. A telemetry rollover and score-schema note.
6. A migration strategy note covering manifest, LanceDB, integrity tooling, and re-indexing.
7. A provenance fixture plan with explicit failing tests to add first.

## Pre-Phase-A Analysis Work Package

This work package replaces assumption-driven design with repository-backed decisions.

### Analysis Tasks

1. Inspect all supported extractors and chunkers and record what locator fidelity they actually expose today.
2. Inspect manifest, integrity, and queue code paths and document all places where identity semantics currently depend on `FileName`.
3. Inspect the client stream parser and enumerate which SSE event additions are additive versus breaking.
4. Inspect current eval scripts and identify what provenance correctness they do not yet measure.
5. Inspect query-log consumers and decide how schema versioning and rollover will be discovered.

### Analysis Outputs

1. `Phase 0 decision record: source identity`
2. `Phase 0 decision record: chunk identity and locator schema`
3. `Phase 0 contract note: SSE grounding evolution`
4. `Phase 0 migration note: schema and re-index strategy`
5. `Phase 0 test plan: provenance fixtures and blocking assertions`

### Exit Gate

Phase A may begin only when the repository owners can point to direct evidence for the chosen identity model, locator model, migration model, and stream model, and when the first provenance regression tests are specified as merge blockers.

### Identified Gaps To Close

| Gap | Current Symptom | Root Cause | Permanent Closure Target |
| --- | --- | --- | --- |
| Claim-to-source binding gap | Answers feel grounded but are not referenceable in detail | Context is concatenated, citations are side-channel only | Structured grounding contract with chunk IDs and answer references |
| Source identity collapse | Same basename in multiple folders can collide operationally | Manifest and DB operations key on `FileName` | Stable source identity independent of basename |
| Positional provenance gap | No reliable line or page references | Ingestion stores text and high-level headers only | Persist exact locators from extractor and chunker |
| Retrieval-to-prompt blind spot | Cannot tell if retrieval failed or budget pruning dropped evidence | Telemetry logs approved context only | Full retrieval trace with candidate, included, and dropped sets |
| Documentation drift | Engineers reason against obsolete PowerShell flow | Canonical docs still contain stale path narratives | Code-backed docs with validation rules that reject stale runtime claims |
| Score-contract drift | Mixed telemetry makes analysis unreliable | Legacy log artifacts and missing score versioning | Versioned score schema and log rollover rules |
| Domain violation risk | Future changes can invent references not supported by data | No explicit hard rules on provenance semantics | Enforced invariants in runtime, tests, and docs validation |

## Program Goals

1. Every emitted citation must map to a single stable chunk identity.
2. Every chunk identity must map to a stable source identity.
3. Every source identity must preserve exact locator data allowed by the extractor domain.
4. Every answer-level reference must only cite chunks that were actually included in the prompt.
5. Every retrieval decision must be observable after the fact.
6. Every canonical document must describe the current runtime, not legacy alternatives.
7. Every regression path must be blocked by automated tests or validators before merge.

## Non-Goals

1. Replacing Ollama.
2. Introducing a remote vector database.
3. Moving the hot path back into PowerShell.
4. Generating fake line numbers, page numbers, or source references when the extractor does not provide them.
5. Solving general hallucination beyond the scope of prompt grounding and evidence attribution.

## Non-Negotiable Domain Guardrails

These rules define what the implementation is allowed to claim.

1. Do not emit a source reference unless the corresponding chunk was present in the approved prompt context.
2. Do not infer page or line references heuristically after chunking unless those locators were persisted from extraction or deterministic text segmentation.
3. Do not use `FileName` alone as operational identity for manifest records, LanceDB upserts, deletions, or orphan cleanup.
4. Do not allow docs to describe `/api/ingest`, `PowerShellRunner.js`, `.vectors.bin`, or `.metadata.json` as the live runtime path unless that code path is reintroduced intentionally and contractually.
5. Do not change SSE or query-log semantics without corresponding contract and regression-test updates.
6. Do not bypass `project-config.psd1` for grounding-related thresholds, modes, or telemetry switches.
7. Do not break the Node-only hot path boundary.

## Target State

At completion, the runtime should work as follows:

1. Ingestion emits chunks with stable `sourceId`, `chunkId`, and domain-valid locators.
2. LanceDB rows store both retrieval text and provenance fields required for citation rendering and audit.
3. Retrieval returns normalized scores plus provenance-complete rows.
4. Prompt assembly records exactly which candidate chunks were included or excluded and why.
5. The model receives context annotated with chunk identities.
6. The response layer can emit answer references that map only to approved chunks.
7. Telemetry captures a full retrieval trace with a versioned score schema.
8. Canonical docs and validators reject any stale architecture claims.

## Closure Matrix

| Gap | Implementation Change | Regression Barrier | Exit Condition |
| --- | --- | --- | --- |
| Claim-to-source binding | Structured prompt context and answer reference schema | SSE contract tests, end-to-end grounding tests | Every answer reference resolves to an included `chunkId` |
| Source identity collapse | `sourceId` and `sourcePath` become primary identity | Duplicate-basename ingestion tests | Two identical basenames in different folders coexist safely |
| Positional provenance | Add extractor-specific locator fields | Chunker/extractor tests, fixture corpus | Markdown, PowerShell, XML, and PDF locators are persisted or explicitly unavailable |
| Retrieval blind spot | Trace candidates, approved context, dropped reasons | Query-log schema tests, eval scripts | Post-hoc analysis can separate retrieval miss from budget pruning |
| Documentation drift | Update canonical docs and add stale-runtime validators | `Validate-Docs.ps1`, doc contract checks | No canonical doc describes obsolete runtime ownership |
| Score drift | Add `scoreSchemaVersion`, rotate log file, archive legacy logs | Logger schema tests | All new logs use one declared score contract |
| Domain violation | Runtime assertions and test fixtures for unsupported locators | Unit, integration, contract tests | The system cannot emit unsupported provenance claims |

## Workstreams

## WS1: Stable Source Identity

### Problem

The current system treats `FileName` as the effective identity key in the manifest and in LanceDB row mutation paths. That is unsafe for any corpus containing duplicate basenames.

### Required Changes

1. Introduce `sourceId` as the primary source identity.
2. Define `sourceId` deterministically as a normalized absolute path hash, for example `sha256(normalizedCanonicalSourcePath)`.
3. Persist both `sourceId` and `sourcePath` in the manifest.
4. Persist `sourceId` and `sourcePath` in every LanceDB row.
5. Use `sourceId` for deletes, updates, rename handling, and orphan cleanup.
6. Preserve `FileName` as display metadata only.
7. Add optional `sourceRelativePath` when the ingestion root is known and stable.

### Primary Files

1. `gui/server/lib/documentParser.js`
2. `gui/server/IngestionQueue.js`
3. `gui/server/lib/integrityCheck.js`
4. `gui/server/scripts/check-integrity.js`

### Data Model Additions

```json
{
  "sourceId": "sha256:c14d...",
  "sourcePath": "C:/Users/Owner/RAG_Documents/docs/guide.md",
  "sourceRelativePath": "docs/guide.md",
  "fileName": "guide.md"
}
```

### Acceptance Criteria

1. Ingesting `A/spec.md` and `B/spec.md` into the same collection produces two distinct manifest entries and two distinct row sets.
2. Re-ingesting one source does not delete or overwrite the other.
3. Rename detection updates only the matching `sourceId` lineage.

## WS2: Stable Chunk Identity and Locator Schema

### Problem

Current chunk metadata is useful for retrieval ranking, but insufficient for durable references.

### Required Changes

1. Introduce `chunkId` as a stable identifier per chunk.
2. Define `chunkId` deterministically from `sourceId`, chunk index, and a chunk-content hash.
3. Add `chunkHash` to support integrity checking and future re-derivation.
4. Expand the chunk schema to include domain-valid locators.

### Required Locator Fields

| Field | Meaning | Required For |
| --- | --- | --- |
| `locatorType` | `line-range`, `page-range`, `xml-path`, `section`, `offset-range`, `none` | All chunks |
| `lineStart`, `lineEnd` | 1-based line positions | Markdown, PowerShell, XML, plain text where available |
| `pageStart`, `pageEnd` | Page locator | PDF |
| `charStart`, `charEnd` | Character offsets in extracted source text | All deterministic extractors |
| `sectionPath` | Breadcrumb path | Markdown, PowerShell, XML |
| `symbolName` | Optional declaration identity | PowerShell and JavaScript where relevant |

### Extractor Rules

1. Markdown: persist heading path and line range.
2. PowerShell: persist declaration path, symbol name, and line range.
3. XML: persist element path and line range when parsable, otherwise fallback to `xml-path` plus character offsets.
4. Plain text: persist character offsets and line range if deterministic.
5. PDF: persist page ranges from extractor output; if exact line ranges are unavailable, explicitly mark `locatorType = page-range` and do not invent lines.

### Primary Files

1. `gui/server/lib/smartChunker.js`
2. `gui/server/IngestionQueue.js`
3. `gui/server/lib/documentParser.js`
4. PDF extraction wiring in `gui/server/IngestionQueue.js`

### Acceptance Criteria

1. Every LanceDB row includes `chunkId` and `locatorType`.
2. PDF chunks include `pageStart` and `pageEnd` when the extractor exposes them.
3. No chunk emits a line or page reference unless it originated from an extractor-supported locator.

## WS3: Grounding Contract and Prompt Assembly

### Problem

The current runtime supplies context but does not preserve answer-to-chunk binding.

### Required Changes

1. Replace the flat prompt context string with a structured context block format that includes `chunkId`, `sourceId`, `FileName`, and locators.
2. Require the model instruction to cite supporting `chunkId` values in a machine-readable way.
3. Separate citation rendering from retrieval previews.
4. Emit a final answer event containing resolved references, not just token text.

### Prompt Contract

The model should see context blocks in a deterministic form such as:

```text
[CHUNK chunkId=chunk_001 sourceId=src_123 file=guide.md locator=line 18-31]
...chunk text...
[/CHUNK]
```

The instruction layer should require one of these two behaviors:

1. Inline references in a normalized syntax such as `[chunk:chunk_001]`.
2. A final structured citations payload listing the supporting chunk IDs used in the answer.

Preferred implementation is both: inline references for transparency plus a normalized final references array for the UI and logs.

### SSE Contract Additions

Add or revise event types so the stream can support grounding without overloading the current `metadata` event.

| Event | Purpose |
| --- | --- |
| `metadata` | Retrieved and approved citations for initial render |
| `message` | Token stream for UX continuity |
| `answer_references` | Final normalized chunk references actually cited by the answer |
| `grounding_warning` | Explicit signal when no approved evidence exists |

### Primary Files

1. `gui/server/server.js`
2. `gui/server/lib/ollamaClient.js`
3. `docs/SSE_CONTRACT.md`
4. `docs/API_REFERENCE.md`
5. Client stream parser in `gui/client/react-client`

### Acceptance Criteria

1. Every answer reference resolves to an approved `chunkId`.
2. The UI can render references with stable locators.
3. The system can explicitly state when the answer contains no grounded references.

## WS4: Retrieval Trace Observability

### Problem

The current query log loses the distinction between retrieved candidates and prompt-approved context.

### Required Changes

Extend query telemetry with three explicit sets.

1. `retrievedCandidates`
2. `approvedContext`
3. `droppedCandidates`

Each dropped candidate must include a `dropReason`.

### Required Drop Reasons

1. `below_min_score`
2. `context_budget_exceeded`
3. `strict_filter_excluded`
4. `collection_not_ready`
5. `embedding_model_mismatch`

### Score Contract Hardening

1. Add `scoreSchemaVersion` to every new query log entry.
2. Add `scoreType = normalized-relevance`.
3. Rotate the log file on deployment of the new schema, archiving prior mixed-format logs under a versioned historical path.
4. Update evaluation scripts to reject entries missing the declared score schema.

### Optional Diagnostic Artifact

Add a per-query trace artifact in development mode:

```json
{
  "queryId": "...",
  "retrievalPlan": { "mode": "hybrid" },
  "retrievedCandidates": [...],
  "approvedContext": [...],
  "droppedCandidates": [...],
  "answerReferences": [...]
}
```

### Primary Files

1. `gui/server/server.js`
2. `gui/server/lib/queryLogger.js`
3. `gui/server/scripts/run-golden-eval.js`
4. `gui/server/scripts/run-retrieval-mode-eval.js`
5. `docs/Observability_Analysis.md`
6. `docs/Observability_Execution_Plan.md`

### Acceptance Criteria

1. A failed answer can be classified as retrieval miss, threshold loss, or budget pruning from telemetry alone.
2. All new query logs declare one score schema.
3. No new mixed-score-format entries are produced.

## WS5: Documentation and Contract Realignment

### Problem

Canonical docs still contain obsolete runtime descriptions.

### Required Changes

1. Update `docs/RAG_Copilot_Instructions.md` to match the live Node ingestion path.
2. Remove obsolete references to `PowerShellRunner.js`, `/api/ingest` as the active path, `.vectors.bin`, and `.metadata.json` as current runtime storage.
3. Update `docs/Technical_Component_Design.md` with provenance and grounding contracts.
4. Update `docs/Architecture_Design.md` data-flow diagrams to include chunk IDs, source IDs, and grounding trace events.
5. Update `docs/API_REFERENCE.md` and `docs/SSE_CONTRACT.md` with new event shapes.
6. Mark stale legacy narratives historical if they still need to be preserved.

### Validation Hardening

Extend `scripts/Validate-Docs.ps1` so canonical docs fail validation if they contain known-obsolete runtime claims such as:

1. live `POST /api/ingest` ownership
2. `PowerShellRunner.js`
3. `.vectors.bin` as current hot-path store
4. `.metadata.json` as live citation source

### Acceptance Criteria

1. There is one authoritative narrative for live ingestion and retrieval.
2. The validator blocks reintroduction of stale runtime claims.
3. Active drafts and historical docs clearly distinguish proposal from implementation truth.

## WS6: Regression and Evaluation Barrier

### Problem

Without explicit provenance test fixtures, drift will recur.

### Required Test Corpus Additions

1. Duplicate-basename fixture corpus: two files with the same filename under different directories.
2. Locator fidelity corpus: markdown, PowerShell, XML, plain text, and PDF fixtures with expected line/page references.
3. Grounding corpus: prompts requiring multiple supporting chunks and prompts that should return no grounded answer.
4. Budget-pruning corpus: queries where the relevant chunk is retrieved but should be dropped for context budget reasons.
5. Legacy-log schema corpus: verifies log rollover and score schema version behavior.

### Required Automated Test Layers

| Layer | Required Coverage |
| --- | --- |
| Unit | `sourceId`, `chunkId`, locator derivation, drop reasons, score schema |
| Ingestion integration | duplicate basenames, rename detection, orphan cleanup by `sourceId` |
| Retrieval behavior | approved versus dropped context, answer reference validity |
| SSE contract | new `answer_references` and `grounding_warning` events |
| End-to-end | ingest, retrieve, answer, and cite with stable locators |
| Docs validation | stale-runtime terminology rejection |

### Required CI Gates

1. Server tests must pass.
2. SSE and API contract tests must pass.
3. Docs validator must pass.
4. Retrieval evaluation must not regress below agreed floors.
5. A provenance fixture suite must pass before merge.

## Implementation Sequence

## Phase 0: Standards Alignment and Analysis

1. Re-verify the current runtime seams against code, contracts, and canonical docs.
2. Resolve the assumption register into explicit decisions or documented deferrals.
3. Produce the required pre-Phase-A decision records and fixture plan.
4. Add the first failing provenance regression tests that define the intended Phase A behavior.

### Gate

No schema or contract implementation work begins until Phase 0 outputs exist and the first provenance regression tests are in place.

## Phase A: Schema and Identity Hardening

1. Add `sourceId`, `sourcePath`, `chunkId`, `chunkHash`, and the locator fields approved by Phase 0.
2. Update manifest schema and migration logic.
3. Update LanceDB write path and integrity check path.
4. Add duplicate-basename regression tests.

### Gate

No DB mutation or cleanup path may still key on `FileName` alone.

## Phase B: Extractor and Chunker Provenance

1. Upgrade chunkers to emit the Phase 0-approved line and offset metadata.
2. Upgrade PDF ingestion to persist page ranges only if confirmed by the Phase 0 locator support matrix.
3. Add locator fidelity fixtures and tests.

### Gate

Every emitted chunk must declare either a valid locator or an explicit `locatorType = none` with a justified extractor limitation.

## Phase C: Grounding Contract

1. Rework prompt assembly to carry the Phase 0-approved chunk identity model.
2. Add the Phase 0-selected answer reference contract.
3. Update SSE and API contracts according to the Phase 0 stream migration note.
4. Update client rendering to display structured references.

### Gate

The stream must expose a final machine-readable references payload that resolves only to approved chunks.

## Phase D: Retrieval Trace and Score Hardening

1. Extend query logging schema.
2. Add score schema versioning and log rollover using the Phase 0-approved retention and discovery rules.
3. Add development retrieval trace artifacts.
4. Update eval scripts and observability docs.

### Gate

An investigator must be able to tell whether a bad answer was caused by retrieval failure, thresholding, or context pruning without replaying the request manually.

## Phase E: Documentation and Validator Hardening

1. Update canonical docs.
2. Relocate stale narratives to historical if still needed.
3. Add stale-runtime term detection to docs validation.

### Gate

No canonical doc may describe obsolete runtime ownership or storage architecture.

## Phase F: Release and Migration

1. Rotate query logs.
2. Re-index existing collections into the new provenance schema.
3. Run integrity checks and provenance test corpus.
4. Generate a migration note documenting schema version changes.

### Gate

No collection remains on the old basename-only operational identity model.

## Acceptance Metrics

The program is complete only when all of the following are true.

1. Duplicate basenames are safe across ingestion, retrieval, and cleanup.
2. Every citation includes a stable `chunkId` and valid source locator.
3. Every answer reference can be resolved to an approved prompt chunk.
4. Query logs distinguish retrieved, approved, and dropped evidence.
5. New query logs use one declared score schema version.
6. Canonical docs match the live runtime.
7. Validators and CI gates reject stale or unsupported provenance behavior.

## Permanent Regression Barriers

These are mandatory merge blockers once the implementation lands.

1. `DocumentParser` tests covering duplicate basenames and source-ID migrations.
2. `IngestionQueue` tests proving deletion and orphan cleanup run by `sourceId`.
3. `VectorStore` and retrieval behavior tests proving approved/dropped evidence accounting.
4. SSE contract tests for `answer_references` and grounding warnings.
5. End-to-end ingest-and-cite tests over a provenance fixture corpus.
6. Docs validator checks for stale runtime claims.
7. Eval-script assertions for `scoreSchemaVersion`.

## Deferred Items

These items are explicitly outside the required closure scope unless later promoted.

1. Fine-grained claim extraction beyond chunk-level attribution.
2. Cross-document reasoning graphs.
3. Remote observability backends.
4. Multi-model evidence arbitration.

## Decision Record

The implementation should treat the following choices as locked unless a new approved plan supersedes them.

1. Node remains the sole live ingestion and retrieval runtime owner.
2. Provenance must be deterministic and persisted, not inferred after the fact.
3. `FileName` is display metadata, not source identity.
4. Citations are contract surfaces and must be test-covered.
5. Documentation drift is a correctness issue, not a cosmetic issue.

## Immediate Next Implementation Steps

1. Complete the Phase 0 assumption register and write the missing decision records.
2. Produce the locator support matrix from actual extractor and chunker analysis.
3. Add provenance fixtures and failing tests before any schema changes.
4. Select and document the answer-reference and SSE migration strategy.
5. Start Phase A only after the approved identity and migration semantics are locked.