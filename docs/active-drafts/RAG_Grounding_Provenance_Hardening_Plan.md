---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/Technical_Component_Design.md
last_reviewed: 2026-03-18
audience: engineering
---
# RAG Grounding and Provenance Hardening Plan

## Purpose

This document is the active status and hardening umbrella for grounding,
provenance, retrieval-trace observability, and documentation correctness in the
local RAG runtime.

It no longer describes a pre-implementation design space. It records what is
already delivered through Phase D, what remains open after the current evidence
pass, and what work is authorized next.

The governing rule is unchanged: provenance and grounding are contract surfaces,
not best-effort metadata. The system must be able to prove what source material
was retrieved, what evidence entered the prompt, what references were actually
emitted, and where the current runtime still lacks support for finer-grained
claims.

## Current Program Status

Status at this revision:

1. Phases A through D are delivered in the live runtime.
2. Phase D is frozen with explicit gate evidence recorded in `docs/active-drafts/PhaseD_Freeze_Report.md`.
3. Phase E is active as documentation realignment and validator hardening work.
4. Phase F remains open as migration and release-closure work.

This document is now the truthful high-level status artifact. Phase-specific
execution details live in the dedicated phase plans and freeze report.

## Evidence Baseline

This status document is grounded in the current repository state, not in the
obsolete pre-Phase-A assumptions that originally seeded the plan.

### Evidence Anchors Reviewed For This Revision

1. `gui/server/server.js`
2. `gui/server/IngestionQueue.js`
3. `gui/server/lib/vectorStore.js`
4. `gui/server/lib/retrievalModes.js`
5. `gui/server/lib/queryLogger.js`
6. `gui/server/lib/evalLogSchema.js`
7. `gui/server/lib/smartChunker.js`
8. `gui/server/tests/retrieval.behavior.test.js`
9. `gui/server/tests/sse.contract.test.js`
10. `gui/server/tests/queryLogger.test.js`
11. `gui/server/tests/pdfLocatorEvidence.test.js`
12. `scripts/Validate-Docs.ps1`
13. `docs/active-drafts/PhaseD_Freeze_Report.md`
14. `docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md`

### Verified Runtime Facts

1. Live ingestion is Node-native through `gui/server/IngestionQueue.js`; the legacy `/api/ingest` route is deprecated and the active intake path is `/api/queue`.
2. Live retrieval, prompt assembly, SSE emission, and query logging are Node-native in `gui/server/server.js`.
3. Stable `SourceId` and `ChunkHash`-derived chunk identity are present in the live ingestion, retrieval, citation, and telemetry paths, with legacy fallbacks still tolerated for older rows.
4. Prompt assembly now uses structured `[CHUNK ...]` blocks rather than flat `[Source: ...]` headers.
5. SSE emits `metadata`, token `message`, final `answer_references`, and conditional `grounding_warning` events.
6. Query telemetry now writes to `logs/query_log.v1.jsonl` and includes `scoreSchemaVersion`, `scoreType`, `retrievedCandidates`, `approvedContext`, `droppedCandidates`, and `answerReferences`.
7. Query-log initialization rotates a legacy `logs/query_log.jsonl` file into `logs/archive/query_log.legacy.<yyyyMMdd-HHmmss>.jsonl`.
8. The docs validator blocks selected stale-runtime claims in canonical and reference-contract docs, including legacy ingestion ownership and active `query_log.jsonl` language.
9. PDF page-aware provenance now exists only on the structured page-range path: `smartChunker.js` can emit per-page PDF chunks with `pageStart` and `pageEnd`, `IngestionQueue.js` persists those fields when present, and `server.js` only emits them on citations when `locatorType === "page-range"`.
10. Fine-grained locator support is still incomplete overall: the runtime does not yet provide a universal locator contract for line, character, section, symbol, or page fidelity across all extractor types.

## Project Standards Baseline

This plan must be executed inside the repository's existing standards, not alongside them.

### WS1 Architecture and Runtime Standards

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

## Delivered Through Phase D

The following capabilities are live and should be treated as already delivered,
not as future design intent.

### Grounding and Provenance Delivery

1. Stable source identity is present in the active ingestion and retrieval paths.
2. Stable chunk identity is present in retrieval, citations, SSE grounding, and telemetry.
3. `locatorType` is propagated end-to-end as the current coarse locator contract.
4. Structured `[CHUNK ...]` prompt blocks are used in the active retrieval path.
5. Final `answer_references` SSE emission is live.
6. Deterministic `grounding_warning` SSE emission is live for no-approved-context answers.

### Retrieval Trace and Telemetry Delivery

1. Query logging distinguishes `retrievedCandidates`, `approvedContext`, and `droppedCandidates`.
2. Dropped candidates carry explicit `dropReason` values.
3. The active query-log contract is versioned with `scoreSchemaVersion: "v1"` and `scoreType: "normalized-relevance"`.
4. Eval tooling enforces the current schema by default and requires explicit opt-in for legacy schema input.

### Current PDF Provenance Delivery

1. The runtime now supports structured per-page PDF chunks on the page-aware path.
2. Persisted `PageStart` and `PageEnd` are emitted only when the chunk was produced from the structured `page-range` path.
3. Legacy or flattened PDF rows remain non-page citations and must not emit page fields.

### Documentation and Validation Delivery So Far

1. SSE contract documentation now includes `answer_references`, `grounding_warning`, and optional page-range citation fields.
2. API and technical design docs now reflect the live additive page-range citation contract.
3. Docs validation now blocks a bounded set of stale runtime claims in canonical and reference-contract docs.

## Historical Record of Closed Design Questions

The original front half of this plan contained a pre-Phase-A assumption register
and start gate. That material is no longer the current operating truth.

At this point, those earlier questions are either already resolved in code and
tests or superseded by dedicated phase plans and decision artifacts. They remain
part of the repository history, but they are not the active blocker language for
current work.

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

Status: delivered in the live runtime, with migration-sensitive fallbacks still
present for legacy rows and manifests.

> The `sourceId` derivation rule in this workstream has been superseded by
> `RAG_Source_Identity_Decision_Record.md` (Option C — Persistent Lineage,
> approved 2026-03-16). The identity semantics below reflect that decision.
> Remaining work for source identity is now migration closure, not first-time
> implementation.

### WS1 Problem

The current system treats `FileName` as the effective identity key in the manifest and in LanceDB row mutation paths. That is unsafe for any corpus containing duplicate basenames.

### WS1 Required Changes

1. Introduce `sourceId` as the primary source identity.
2. Mint `sourceId` **once at first-ingest time** via `mintSourceId(collection, canonicalPath)`
   (see `gui/server/lib/sourceIdentity.js`). Persist it in the manifest and in every LanceDB
   row. Never recompute it from the current path, filename, or file content after minting.
3. Persist both `sourceId` and `sourcePath` in the manifest.
4. Persist `sourceId` and `sourcePath` in every LanceDB row.
5. Use `sourceId` for deletes, updates, rename handling, and orphan cleanup.
6. Preserve `FileName` as display metadata only; `sourcePath` holds the current canonical
   location (mutable on rename); `contentHash` tracks the current revision.
7. Add optional `sourceRelativePath` when the ingestion root is known and stable.

### WS1 Primary Files

1. `gui/server/lib/documentParser.js`
2. `gui/server/IngestionQueue.js`
3. `gui/server/lib/integrityCheck.js`
4. `gui/server/lib/sourceIdentity.js`
5. `gui/server/scripts/check-integrity.js`

### WS1 Data Model Additions

```json
{
  "sourceId": "src_c14d9f2a8b3e1d07",
  "sourcePath": "C:/Users/Owner/RAG_Documents/docs/guide.md",
  "sourceRelativePath": "docs/guide.md",
  "fileName": "guide.md"
}
```

`sourceId` is an opaque `src_<16-hex>` token minted at first ingest. It does not encode the
path or content hash and does not change when the file is renamed or edited.

### WS1 Acceptance Criteria

1. Ingesting `A/spec.md` and `B/spec.md` into the same collection produces two distinct manifest entries and two distinct row sets.
2. Re-ingesting one source does not delete or overwrite the other.
3. Rename detection updates `sourcePath` only; `sourceId` is unchanged.
4. `integrityCheck.js` groups, scans, and deletes exclusively by `sourceId` — never by `FileName`.

## WS2: Stable Chunk Identity and Locator Schema

Status: partially delivered.

Stable chunk identity is live. Fine-grained locator fidelity remains incomplete
and is still limited by extractor-specific evidence.

### WS2 Problem

Current chunk metadata is useful for retrieval ranking, but insufficient for durable references.

### WS2 Required Changes

1. Introduce `chunkId` as a stable identifier per chunk.
2. Define `chunkId` deterministically from `sourceId`, chunk index, and a chunk-content hash.
3. Add `chunkHash` to support integrity checking and future re-derivation.
4. Expand the chunk schema to include domain-valid locators.

### WS2 Required Locator Fields

| Field | Meaning | Required For |
| --- | --- | --- |
| `locatorType` | `line-range`, `page-range`, `xml-path`, `section`, `offset-range`, `none` | All chunks |
| `lineStart`, `lineEnd` | 1-based line positions | Markdown, PowerShell, XML, plain text where available |
| `pageStart`, `pageEnd` | Page locator | PDF |
| `charStart`, `charEnd` | Character offsets in extracted source text | All deterministic extractors |
| `sectionPath` | Breadcrumb path | Markdown, PowerShell, XML |
| `symbolName` | Optional declaration identity | PowerShell and JavaScript where relevant |

### WS2 Extractor Rules

1. Markdown: persist heading path and line range.
2. PowerShell: persist declaration path, symbol name, and line range.
3. XML: persist element path and line range when parsable, otherwise fallback to `xml-path` plus character offsets.
4. Plain text: persist character offsets and line range if deterministic.
5. PDF: persist page ranges from extractor output; if exact line ranges are unavailable, explicitly mark `locatorType = page-range` and do not invent lines.

### WS2 Primary Files

1. `gui/server/lib/smartChunker.js`
2. `gui/server/IngestionQueue.js`
3. `gui/server/lib/documentParser.js`
4. PDF extraction wiring in `gui/server/IngestionQueue.js`

### WS2 Acceptance Criteria

1. Every LanceDB row includes `chunkId` and `locatorType`.
2. PDF chunks include `pageStart` and `pageEnd` when the extractor exposes them.
3. No chunk emits a line or page reference unless it originated from an extractor-supported locator.

## WS3: Grounding Contract and Prompt Assembly

Status: delivered for the current contract slice.

Structured prompt blocks, final answer references, and deterministic no-evidence
warnings are live. Future expansion is limited to additive refinements only.

### WS3 Problem

The current runtime supplies context but does not preserve answer-to-chunk binding.

### WS3 Required Changes

1. Replace the flat prompt context string with a structured context block format that includes `chunkId`, `sourceId`, `FileName`, and locators.
2. Require the model instruction to cite supporting `chunkId` values in a machine-readable way.
3. Separate citation rendering from retrieval previews.
4. Emit a final answer event containing resolved references, not just token text.

### WS3 Prompt Contract

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

### WS3 SSE Contract Additions

Add or revise event types so the stream can support grounding without overloading the current `metadata` event.

| Event | Purpose |
| --- | --- |
| `metadata` | Retrieved and approved citations for initial render |
| `message` | Token stream for UX continuity |
| `answer_references` | Final normalized chunk references actually cited by the answer |
| `grounding_warning` | Explicit signal when no approved evidence exists |

### WS3 Primary Files

1. `gui/server/server.js`
2. `gui/server/lib/ollamaClient.js`
3. `docs/SSE_CONTRACT.md`
4. `docs/API_REFERENCE.md`
5. Client stream parser in `gui/client/react-client`

### WS3 Acceptance Criteria

1. Every answer reference resolves to an approved `chunkId`.
2. The UI can render references with stable locators.
3. The system can explicitly state when the answer contains no grounded references.

## WS4: Retrieval Trace Observability

Status: delivered through Phase D.

### WS4 Problem

The current query log loses the distinction between retrieved candidates and prompt-approved context.

### WS4 Required Changes

Extend query telemetry with three explicit sets.

1. `retrievedCandidates`
2. `approvedContext`
3. `droppedCandidates`

Each dropped candidate must include a `dropReason`.

### WS4 Required Drop Reasons

1. `below_min_score`
2. `context_budget_exceeded`
3. `strict_filter_excluded`
4. `collection_not_ready`
5. `embedding_model_mismatch`

### WS4 Score Contract Hardening

1. Add `scoreSchemaVersion` to every new query log entry.
2. Add `scoreType = normalized-relevance`.
3. Rotate the log file on deployment of the new schema, archiving prior mixed-format logs under a versioned historical path.
4. Update evaluation scripts to reject entries missing the declared score schema.

### WS4 Optional Diagnostic Artifact

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

### WS4 Primary Files

1. `gui/server/server.js`
2. `gui/server/lib/queryLogger.js`
3. `gui/server/scripts/run-golden-eval.js`
4. `gui/server/scripts/run-retrieval-mode-eval.js`
5. `docs/Observability_Analysis.md`
6. `docs/Observability_Execution_Plan.md`

### WS4 Acceptance Criteria

1. A failed answer can be classified as retrieval miss, threshold loss, or budget pruning from telemetry alone.
2. All new query logs declare one score schema.
3. No new mixed-score-format entries are produced.

## WS5: Documentation and Contract Realignment

Status: active in Phase E.

### WS5 Problem

Canonical docs still contain obsolete runtime descriptions.

### WS5 Required Changes

1. Update `docs/RAG_Copilot_Instructions.md` to match the live Node ingestion path.
2. Remove obsolete references to `PowerShellRunner.js`, `/api/ingest` as the active path, `.vectors.bin`, and `.metadata.json` as current runtime storage.
3. Update `docs/Technical_Component_Design.md` with provenance and grounding contracts.
4. Update `docs/Architecture_Design.md` data-flow diagrams to include chunk IDs, source IDs, and grounding trace events.
5. Update `docs/API_REFERENCE.md` and `docs/SSE_CONTRACT.md` with new event shapes.
6. Mark stale legacy narratives historical if they still need to be preserved.

### WS5 Validation Hardening

Extend `scripts/Validate-Docs.ps1` so canonical docs fail validation if they contain known-obsolete runtime claims such as:

1. live `POST /api/ingest` ownership
2. `PowerShellRunner.js`
3. `.vectors.bin` as current hot-path store
4. `.metadata.json` as live citation source

### WS5 Acceptance Criteria

1. There is one authoritative narrative for live ingestion and retrieval.
2. The validator blocks reintroduction of stale runtime claims.
3. Active drafts and historical docs clearly distinguish proposal from implementation truth.

## WS6: Regression and Evaluation Barrier

Status: partially delivered.

Core regression barriers are live for identity, grounding contract, PDF
page-range citation truthfulness, retrieval trace accounting, and score-schema
enforcement. Additional fixture expansion remains open where Phase E and Phase F
plans call it out.

### WS6 Problem

Without explicit provenance test fixtures, drift will recur.

### WS6 Required Test Corpus Additions

1. Duplicate-basename fixture corpus: two files with the same filename under different directories.
2. Locator fidelity corpus: markdown, PowerShell, XML, plain text, and PDF fixtures with expected line/page references.
3. Grounding corpus: prompts requiring multiple supporting chunks and prompts that should return no grounded answer.
4. Budget-pruning corpus: queries where the relevant chunk is retrieved but should be dropped for context budget reasons.
5. Legacy-log schema corpus: verifies log rollover and score schema version behavior.

### WS6 Required Automated Test Layers

| Layer | Required Coverage |
| --- | --- |
| Unit | `sourceId`, `chunkId`, locator derivation, drop reasons, score schema |
| Ingestion integration | duplicate basenames, rename detection, orphan cleanup by `sourceId` |
| Retrieval behavior | approved versus dropped context, answer reference validity |
| SSE contract | new `answer_references` and `grounding_warning` events |
| End-to-end | ingest, retrieve, answer, and cite with stable locators |
| Docs validation | stale-runtime terminology rejection |

### WS6 Required CI Gates

1. Server tests must pass.
2. SSE and API contract tests must pass.
3. Docs validator must pass.
4. Retrieval evaluation must not regress below agreed floors.
5. A provenance fixture suite must pass before merge.

## Implementation Sequence

## Phase A: Schema and Identity Hardening

Status: complete.

1. Add `sourceId`, `sourcePath`, `chunkId`, `chunkHash`, and the approved locator fields.
2. Update manifest schema and migration logic.
3. Update LanceDB write path and integrity check path.
4. Add duplicate-basename regression tests.

### Phase A Gate

No DB mutation or cleanup path may still key on `FileName` alone.

## Phase B: Extractor and Chunker Provenance

Status: partially complete.

Coarse locator support and structured PDF page-range support now exist on the
implemented path, but universal fine-grained locator fidelity remains open.

1. Upgrade chunkers to emit the approved line and offset metadata.
2. Upgrade PDF ingestion to persist page ranges only if confirmed by the approved locator support matrix.
3. Add locator fidelity fixtures and tests.

### Phase B Gate

Every emitted chunk must declare either a valid locator or an explicit `locatorType = none` with a justified extractor limitation.

## Phase C: Grounding Contract

Status: complete for the current approved contract.

1. Rework prompt assembly to carry the approved chunk identity model.
2. Add the approved answer reference contract.
3. Update SSE and API contracts according to the approved stream migration note.
4. Update client rendering to display structured references.

### Phase C Gate

The stream must expose a final machine-readable references payload that resolves only to approved chunks.

## Phase D: Retrieval Trace and Score Hardening

Status: complete and frozen.

1. Extend query logging schema.
2. Add score schema versioning and log rollover using the approved retention and discovery rules.
3. Add development retrieval trace artifacts.
4. Update eval scripts and observability docs.

### Phase D Gate

An investigator must be able to tell whether a bad answer was caused by retrieval failure, thresholding, or context pruning without replaying the request manually.

## Phase E: Documentation and Validator Hardening

Status: in progress.

1. Update canonical docs.
2. Relocate stale narratives to historical if still needed.
3. Add stale-runtime term detection to docs validation.

### Phase E Gate

No canonical doc may describe obsolete runtime ownership or storage architecture.

## Phase F: Release and Migration

Status: not complete.

Phase F is now a migration-closure package, not a first-time provenance design
phase.

1. Rotate query logs.
2. Re-index existing collections into the new provenance schema.
3. Run integrity checks and provenance test corpus.
4. Generate a migration note documenting schema version changes.

### Phase F Gate

No collection remains on the old basename-only operational identity model.

## WS7 Acceptance Metrics

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

1. `WS1 DocumentParser` tests covering duplicate basenames and source-ID migrations.
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

## Authorized Next Steps At This Revision

1. Complete the Phase E documentation realignment and validator-hardening inventory already recorded in `docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md`.
2. Keep grounding and citation docs synchronized with the live SSE and query-log contracts.
3. Finish the extractor-by-extractor locator evidence pass so remaining unsupported locator claims are explicit and test-backed.
4. Prepare the Phase F migration-closure package for legacy fallback retirement and final re-ingest evidence.

## Post-Phase-D Remaining Gaps and Evidence-First Planning Directive

This section records the current program state after Phase D closure and defines the
required evidence-first path for the remaining work. It is intentionally explicit:
the remaining gaps are known, but they are not approved for implementation until the
necessary granular evidence is collected and a phase-scoped execution plan is written.

### Current Delivered State Through Phase D

The repository now has the following program capabilities implemented and frozen:

1. Stable source identity in the live ingestion and retrieval hot path.
2. Stable chunk identity usage in retrieval, citations, SSE grounding, and telemetry.
3. `locatorType` propagated end-to-end as the safe locator contract currently supported by the extractor evidence.
4. Structured `[CHUNK ...]` prompt context blocks in the live retrieval path.
5. Final `answer_references` and deterministic no-evidence `grounding_warning` SSE events.
6. Retrieval trace logging with approved versus dropped evidence and explicit `dropReason` classification.
7. Score-schema versioning, runtime rollover to `logs/query_log.v1.jsonl`, and strict eval enforcement.
8. Phase D freeze evidence recorded in `docs/active-drafts/PhaseD_Freeze_Report.md`.

### Remaining Gaps After Phase D

The following gaps remain open and must be treated as active planning targets rather than
immediate implementation tasks.

#### Gap 1. Fine-Grained Locator Fidelity Is Still Incomplete

Current state:

1. The runtime emits `locatorType`, but not the full approved locator detail model.
2. Exact fields such as `lineStart`, `lineEnd`, `pageStart`, `pageEnd`, `charStart`, `charEnd`, `sectionPath`, and `symbolName` are not fully implemented across supported extractors.
3. PDF provenance remains limited by the current extraction path and must not claim page or line fidelity beyond verified evidence.

Planning implication:

1. No implementation work should begin until extractor-by-extractor evidence is re-collected from the live code paths.
2. The next plan must distinguish what is safe to persist now from what requires extractor upgrades.

#### Gap 2. Canonical Documentation Still Lags the Runtime

Current state:

1. Some canonical documents still contain obsolete runtime descriptions or stale terminology.
2. Documentation updates performed during earlier phases closed only the directly affected contracts and observability anchors.
3. Full narrative convergence between canonical docs and live runtime code has not yet been completed.

Planning implication:

1. Phase E must begin with a direct code-versus-docs audit, not with blind editing.
2. Every canonical claim about ingestion ownership, retrieval ownership, SSE behavior, telemetry paths, and storage shape must be traced back to a current implementation anchor.

#### Gap 3. Validator Hardening Is Not Yet Sufficiently Strict

Current state:

1. The docs validator currently enforces indexing and selected stale-runtime rules.
2. The validator does not yet fully encode the complete stale-runtime rejection set required by this plan.
3. Reintroduction risk remains until the validator blocks obsolete runtime ownership and storage claims comprehensively.

Planning implication:

1. Validator expansion must be planned from evidence of actual stale patterns found in canonical docs.
2. New validation rules must be tied to explicit canonical/runtime terms and covered by deterministic tests where feasible.

#### Gap 4. Release and Migration Closure Remains Open

Current state:

1. The runtime supports the new provenance and telemetry model, but repository-wide migration closure has not been formally completed.
2. Existing collections may still contain legacy rows requiring re-ingest before the old fallback paths can be retired.
3. A final migration note documenting closure of the basename-only operational identity model does not yet exist.

Planning implication:

1. Phase F must be treated as a distinct release-and-migration work package.
2. No claim of total program closure is valid until the migration evidence shows no collection remains on the legacy identity model.

### Directive: Evidence First, Plan Second, Implement Last

The remaining work must proceed in this order only:

1. Collect granular implementation evidence from the live codebase and runtime contracts.
2. Record the remaining gaps with file-anchored findings, not assumptions.
3. Produce a phase-scoped execution plan that resolves each gap with explicit in-scope, out-of-scope, acceptance criteria, and gates.
4. Review the plan for correctness against the evidence.
5. Only after that review may implementation begin.

No remaining gap is approved for direct execution based on this document alone.
The next implementation phase must be informed by fresh repository-backed evidence gathered after Phase D freeze.

### Required Evidence Collection Before Phase E Planning

The following evidence must be gathered before the Phase E execution plan is finalized:

1. Trace the live ingestion path from queue intake through manifest persistence, LanceDB writes, and any remaining legacy fallbacks.
2. Trace the live retrieval and grounding path from retrieval planning through approved context assembly, SSE emission, and query telemetry.
3. Compare canonical docs line-by-line against current runtime ownership, storage, and contract behavior.
4. Enumerate all stale runtime terms still present in canonical documents and classify them as remove, rewrite, relocate-to-historical, or retain-with-context.
5. Inspect `scripts/Validate-Docs.ps1` and identify exactly which stale-runtime rules exist today versus which additional rules are required.
6. Identify migration-sensitive fallback paths that still exist in code and determine what evidence is needed before their removal can be planned.

### Required Planning Output Before Any New Implementation

Before Phase E execution begins, the repository must contain a planning artifact that includes:

1. A concrete inventory of remaining documentation drift with file-level anchors.
2. A validator hardening rule set derived from observed stale patterns.
3. A distinction between immediate canonical corrections and historical relocations.
4. A defined Phase E gate set covering docs updates, validator hardening, and regression validation.
5. A defined handoff into Phase F for migration closure items that are not documentation-only.

### Execution Constraint

Until that evidence-backed Phase E plan exists, the repository should treat the current state as:

1. Phase D complete and frozen.
2. Remaining gaps known but not yet implementation-approved.
3. Analysis and planning authorized.
4. Implementation deferred pending plan resolution.
