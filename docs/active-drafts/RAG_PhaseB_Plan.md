---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md
last_reviewed: 2026-03-16
audience: engineering
---
# Phase B Implementation Plan — Locator Schema and Integration Gate Closure

## Status

Active. Phase A complete and green as of 2026-03-16.

This document defines the verified scope, sequencing, acceptance criteria, and
test-first gates for Phase B.  It supersedes the deferred-items list in
`RAG_PhaseA_Failing_Provenance_Test_Plan.md` for all items listed here.

---

## Evidence Base

The following files were verified directly before this plan was written:

| File | Verified Finding |
| --- | --- |
| `gui/server/tests/api.e2e.test.js` | 4 steps (A–D) exist. Step D resolves on first `message.content` token — never waits for stream end, never asserts `answer_references` or `grounding_warning`. |
| `gui/server/lib/queryLogger.js` | Append-only JSONL, no `scoreSchemaVersion`, no `retrievedCandidates`/`approvedContext`/`droppedCandidates`. `logger.log()` is called in `server.js` **before** `chatStream` runs — `answerReferences` is never included in the logged entry. |
| `gui/server/lib/smartChunker.js` | `SmartChunk` constructor fields: `text`, `headerContext`, `level`, `chunkType`, `fileType`, `structuralPath`. No `locatorType` field. All five chunkers pass no positional locator metadata. |
| `gui/server/server.js` prompt assembly | Flat string: `` `[Source: ${r.FileName}]\n${r.ChunkText || r.TextPreview}` ``. No chunk identity markers in the system prompt. |
| `gui/server/server.js` citation shape | `{ chunkId, sourceId, fileName, headerContext, score, preview }` — no `locatorType` field. |
| `docs/active-drafts/RAG_Locator_Support_Analysis.md` | Evidence is complete and approved. Safe claim per file type is established. |

---

## Stale Context Corrections

The Phase A handoff described the following as "next steps." The following
corrections apply after direct code verification:

| Stale Claim | Corrected Finding |
| --- | --- |
| "Add `api.e2e.test.js` test" | `api.e2e.test.js` exists. Step D needs extending to assert grounding events and a new no-evidence describe block needs adding. Not a new file. |
| "Slice D — add queryLogger integration test" | Slice D requires a **code change** to `server.js` (`logger.log` must move to after `chatStream` and include `answerReferences`) in addition to the test. |
| "WS2 not started" | Confirmed. `SmartChunk` has no `locatorType` field. WS2 starts from zero. |
| "WS3 structured prompt blocks after WS2" | Confirmed dependency. Phase C (WS3) gate requires `locatorType` in LanceDB rows before structured prompt context is safe to implement. |

---

## Scope Boundary

Phase B closes:

1. The last two open integration gates from Phase A (Slices C and D).
2. The Phase B gate from the hardening plan WS2: every emitted chunk must declare
   `locatorType` with a domain-accurate value or an explicit `"none"`.

Phase B does not include:

1. Actual `lineStart`/`lineEnd`/`pageStart`/`pageEnd` fields — the locator support
   analysis confirms these require extractor upgrades that are not safe to claim yet.
2. Structured `[CHUNK ...]` system prompt blocks (Phase C / WS3) — depends on
   `locatorType` reaching LanceDB rows first.
3. Retrieval trace split (Phase D / WS4) — three-set candidate logging.
4. Score schema versioning (Phase D / WS6) — `scoreSchemaVersion` field and log
   rotation.
5. Documentation drift removal and validator hardening (Phase E / WS5).

---

## Phase B Workstreams

Phase B is three sequential workstreams. B1 and B2 are independent of B3/B4 and
may be developed in parallel, but B4 depends on B3, and B5 depends on B3–B4.

---

## B1: Slice C — E2E SSE Grounding Contract

### Problem

`api.e2e.test.js` Step D resolves on the first token event.  It never collects
the full SSE stream, so it never asserts `answer_references` or the no-evidence
`grounding_warning` path.  These are integration-level regression blockers
listed in the Phase A test plan.

### Evidence

The server already emits both events correctly per `provenance.phaseA.test.js`
and `sse.contract.test.js`.  This workstream is test-only — no production code
changes.

### Test-First Requirements

Add failing assertions before any commits are considered "passing."

**Extension to Step D:**

Collect all SSE events until stream end.  Assert:

1. At least one `metadata` event with non-empty `citations` containing `chunkId`
   and `sourceId` on each entry.
2. An `answer_references` event appears after all token events.
3. `answer_references.references` is a non-empty array when documents were
   retrieved.
4. Every `chunkId` in `answer_references.references` matches a `chunkId` in
   the earlier citations set.

**New describe block — no-evidence path:**

Submit a `/api/chat` request to a collection that either:
- Does not exist (store not ready), or
- Forces `MinScore` to `1.0` via environment override so all candidates are
  filtered out.

Assert:

1. A `grounding_warning` event is emitted.
2. `grounding_warning.code` is the non-empty string `"NO_APPROVED_CONTEXT"`.
3. `grounding_warning.message` is a non-empty string.
4. An `answer_references` event is also present (may have empty `references`
   array per current contract behavior).

### Files

- `gui/server/tests/api.e2e.test.js` — add assertions to Step D, add new
  describe block for no-evidence path.

### Acceptance Criteria

1. Step D passes without relying on early stream resolve.
2. No-evidence describe block passes deterministically.
3. All prior `api.e2e.test.js` steps remain green.

### Gate

B1 is complete when `api.e2e.test.js` runs to PASS with no skipped tests in the
new blocks.

---

## B2: Slice D — QueryLogger `answerReferences` Integration

### Problem

`server.js` calls `logger.log(logEntry)` before `chatStream` runs.
`answerReferences` is computed after `chatStream` completes.  Therefore no
logged entry ever includes the emitted answer references.  Slice D requires
round-trip evidence: write a query log entry, read it back, assert both
`results[*].chunkId`/`sourceId` AND the `answerReferences` set are present.

### Code Change Required

**In `server.js`:** Move `logger.log(logEntry)` to after `chatStream` completes
and after `answerReferences` is computed.  Add `answerReferences` to the
`logEntry` object before logging.

```js
// After chatStream and after answerReferences array is built:
logEntry.answerReferences = answerReferences;
logger.log(logEntry).catch((err) => console.error("[QueryLogger]", err));
```

**No `logEntry` structural changes are needed** other than the addition of the
`answerReferences` field.

### Test-First Requirements

Add to `gui/server/tests/queryLogger.test.js`:

**Integration test — round-trip with answerReferences:**

1. Create a temp JSONL file for the logger.
2. Log an entry that includes both `results` (with `chunkId`/`sourceId`) and
   `answerReferences` (with `chunkId`/`sourceId`/`fileName`).
3. Read the JSONL back.
4. Assert `entry.results[*].chunkId` present and non-empty.
5. Assert `entry.results[*].sourceId` present and non-empty.
6. Assert `entry.answerReferences` is an array.
7. Assert `entry.answerReferences[*].chunkId` present and non-empty.
8. Assert `entry.answerReferences[*].sourceId` present and non-empty.

**Integration test — approved-context only entries have answerReferences:**

Verify that when `results` is non-empty, `answerReferences` is also non-empty
and that all `chunkId` values in `answerReferences` are present in `results`.

### Files

- `gui/server/server.js` — move `logger.log` call, add `answerReferences` to
  logEntry.
- `gui/server/tests/queryLogger.test.js` — add two integration gate tests.

### Acceptance Criteria

1. New `queryLogger.test.js` integration tests pass.
2. No existing `queryLogger.test.js` tests regress.
3. The `logEntry` shape is backward-compatible: existing fields unchanged, one
   new optional `answerReferences` field added.

### Gate

B2 is complete when `queryLogger.test.js` runs PASS with the new integration
tests green.

---

## B3: WS2 — `locatorType` Field on SmartChunk

### Problem

`SmartChunk` has no `locatorType` field.  The hardening plan Phase B gate
requires every emitted chunk to declare a valid locator type or an explicit
`"none"`.  The locator support analysis established exactly what safe values
each file type can claim.

### locatorType Value Mapping

Per `RAG_Locator_Support_Analysis.md` (evidence-locked values):

| `chunkType` | `locatorType` |
| --- | --- |
| `markdown-section` | `"section"` |
| `markdown-preamble` | `"section"` |
| `javascript-block` | `"declaration"` |
| `javascript-preamble` | `"declaration"` |
| `powershell-function` | `"declaration"` |
| `powershell-class` | `"declaration"` |
| `powershell-param-block` | `"declaration"` |
| `powershell-preamble` | `"declaration"` |
| `xml-logentry` | `"xml-element"` |
| `xml-element` | `"xml-element"` |
| `xml-trailing` | `"none"` |
| `text-block` | `"none"` |
| PDF (all — handled in IngestionQueue) | `"none"` |

Domain guardrail: do NOT invent `line-range`, `page-range`, `offset-range`,
or `char-range` values.  These require extractor upgrades confirmed by actual
extractor output, which the locator analysis explicitly marks unsafe today.

### Test-First Requirements

Add failing assertions to `gui/server/tests/smartChunker.test.js` **before**
any changes to `smartChunker.js`:

1. For each file-type describe block, add an assertion that all returned
   `SmartChunk` objects have a `locatorType` field that is a non-empty string.
2. Add per-type assertions:
   - `splitMarkdown` chunks → `locatorType === "section"`
   - `splitPowerShell` chunks → `locatorType === "declaration"`
   - `splitXml` LogEntry chunks → `locatorType === "xml-element"`
   - `splitPlainText` chunks → `locatorType === "none"`

### Implementation

In `gui/server/lib/smartChunker.js`:

1. Add `locatorType` parameter to `SmartChunk` constructor.
2. Set `this.locatorType = locatorType || "none"` in the constructor.
3. Derive `locatorType` in `processSection` from `metadata.locatorType` if
   provided, else fall back to `"none"`.
4. Update every `processSection` call in every chunker to pass the appropriate
   `locatorType` in the metadata object.
5. Update overlap split paths: carry `locatorType` through when splitting a
   single large section into multiple smaller chunks — locatorType is the same
   for all sub-chunks from the same section.

### Files

- `gui/server/lib/smartChunker.js`
- `gui/server/tests/smartChunker.test.js`

### Acceptance Criteria

1. Every `SmartChunk` has a non-null `locatorType` string.
2. Tests pass for all five file-type chunkers.
3. No existing `smartChunker.test.js` tests regress.

### Gate

B3 is complete when `smartChunker.test.js` runs PASS including the new
locatorType assertions.

---

## B4: WS2 — `LocatorType` Propagation (IngestionQueue → LanceDB → Citations)

### Problem

Even after B3, `locatorType` is only on the in-memory `SmartChunk`.  It must
reach LanceDB rows, pass through `vectorStore.js`, and appear in citations
emitted by `server.js`.

### Test-First Requirements

Add failing tests before each propagation step:

**`IngestionQueue.test.js`:**
1. LanceDB `add` call includes `LocatorType` field per row.
2. PDF ingest path includes `LocatorType: "none"` (PDF bypasses smartChunker).

**`gui/server/tests/__mocks__/lancedb.js`:**
- Add `LocatorType` to all mock result entries.

**`vectorStore.test.js`:**
- Add assertion that `mappedResult` includes `LocatorType` pass-through.

**`provenance.phaseA.test.js`:**
- Add assertion that `metadata.citations[*].locatorType` is a non-empty string.

### Implementation

1. **`gui/server/IngestionQueue.js`**: add `LocatorType: chunk.locatorType` to
   the row object written per chunk.  For the PDF ingestion path (which reads
   raw text and does not call the chunker), write `LocatorType: "none"`.
2. **`gui/server/lib/vectorStore.js`**: add `LocatorType: row.LocatorType` to
   `mappedResult`.
3. **`gui/server/server.js`**: add `locatorType: r.LocatorType` to citations in
   the `approvedResults.map(...)` block.
4. **`gui/server/tests/__mocks__/lancedb.js`**: add `LocatorType` field to all
   three mock result entries.

### Files

- `gui/server/IngestionQueue.js`
- `gui/server/lib/vectorStore.js`
- `gui/server/server.js`
- `gui/server/tests/IngestionQueue.test.js`
- `gui/server/tests/__mocks__/lancedb.js`
- `gui/server/tests/vectorStore.test.js`
- `gui/server/tests/provenance.phaseA.test.js`

### Acceptance Criteria

1. `metadata.citations[*].locatorType` is a non-empty string in provenance tests.
2. LanceDB save path includes `LocatorType` per row.
3. `vectorStore.js` `mappedResult` includes `LocatorType`.
4. All Phase A regression suites remain green.

### Gate

B4 is complete when `IngestionQueue.test.js`, `vectorStore.test.js`, and
`provenance.phaseA.test.js` all pass with the new locatorType field assertions,
and when `sse.contract.test.js` remains green.

---

## B5: Phase B Hardening Gate Check

### Gate Definition (from hardening plan)

> Every emitted chunk must declare either a valid locator or an explicit
> `locatorType = none` with a justified extractor limitation.

### Verification Steps

1. Run `gui/server && npm test` for the full server suite.
2. Confirm `smartChunker.test.js` passes locatorType assertions for all file
   types.
3. Confirm `IngestionQueue.test.js` passes LocatorType row assertions.
4. Confirm `provenance.phaseA.test.js` passes citation locatorType assertion.
5. Confirm `api.e2e.test.js` passes including B1 new blocks.
6. Confirm `queryLogger.test.js` passes including B2 new integration tests.

### Files

No new files at this step — verification only.

### Gate

Phase B is declared complete when all six checks above pass in a single run.

---

## Non-Negotiables Carried Forward from Phase A

These rules govern all Phase B work:

1. Test-first on every change: failing test must exist before any implementation
   commits.
2. No fake locator values: do not emit `lineStart`, `lineEnd`, `pageStart`,
   `pageEnd`, `charStart`, or `charEnd` from any chunker or extractor until the
   phase-specific decision record approves the extraction path.
3. No replacement of existing SSE events: `answer_references` and
   `grounding_warning` shapes are locked. Any extension must be additive.
4. No phantom references: `answer_references.references` may only contain
   `chunkId` values present in the approved prompt context.
5. `locatorType` values must map to evidence in `RAG_Locator_Support_Analysis.md`.
   Do not introduce a new `locatorType` value without updating that document
   first.
6. Legacy fallback (`[Provenance] SourceId absent`) remains permitted until
   corpus is re-ingested — it must still log an auditable warning.

---

## Immediate Next Phase: Phase C

Phase C scope (do not begin until Phase B gate passes):

1. **WS3 — Structured prompt context blocks**: replace flat
   `[Source: fileName]\ntext` with `[CHUNK chunkId=... sourceId=... file=...
   locator=...]` delimited blocks.  Requires `locatorType` in LanceDB rows
   (provided by B3/B4) before prompt injection is worth doing.
2. **WS4 — Retrieval trace observability**: three-set candidate logging
   (`retrievedCandidates`, `approvedContext`, `droppedCandidates` with
   `dropReason`).
3. **WS6 — Score schema versioning**: `scoreSchemaVersion` field in every new
   query log entry plus log rotation/archive policy.
4. **WS5 — Documentation drift removal**: update `RAG_Copilot_Instructions.md`,
   `Technical_Component_Design.md`, `Architecture_Design.md`, `API_REFERENCE.md`,
   `SSE_CONTRACT.md` to reflect current runtime.  Extend `Validate-Docs.ps1`
   with stale-term detection.

Phase C entry gate: Phase B gate must be satisfied. `locatorType` must be
confirmed present in LanceDB rows before structured prompt context is
implemented.

---

## Summary Table

| Step | Workstream | Type | Primary Gate |
| --- | --- | --- | --- |
| B1 | Slice C | Tests only | `api.e2e.test.js` PASS (new blocks) |
| B2 | Slice D | Code + test | `queryLogger.test.js` PASS (integration tests) |
| B3 | WS2 locatorType on chunk | Code + test | `smartChunker.test.js` PASS (locatorType assertions) |
| B4 | WS2 locatorType propagation | Code + test | `IngestionQueue.test.js` + `vectorStore.test.js` + `provenance.phaseA.test.js` PASS |
| B5 | Phase B gate check | Verification | All 6 suite checks pass in single run |

Execution order: B1 and B2 may run in parallel with each other. B3 must
precede B4. B5 verifies everything.
