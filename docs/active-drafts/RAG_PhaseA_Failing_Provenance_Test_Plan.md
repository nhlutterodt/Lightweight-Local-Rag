---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md
last_reviewed: 2026-03-16
audience: engineering
---
# Phase A Provenance Test Plan — Executed and Green

## Status

Phase A baseline is **complete and green** as of 2026-03-16.

All originally-failing provenance gates have been implemented and converted to
passing tests.  This document now records the executed baseline, the current
green gates, and the next regression blockers for identity migration (Slices B–D).

---

## Executed Baseline (Originally Red, Now Green)

### Server Provenance Contract Suite

File: `gui/server/tests/provenance.phaseA.test.js`

Run command:

```sh
cd gui/server && npm test -- tests/provenance.phaseA.test.js
```

Originally-red assertions now green:

1. `metadata.citations[*].chunkId` — present, non-empty string ✓
2. `metadata.citations[*].sourceId` — present, non-empty string ✓
3. final `answer_references` event emitted after all token events ✓
4. `answer_references.references[*].chunkId` all contained in citation set ✓
5. stored `SourceId` field used as-is (not re-derived from FileName) ✓
6. stored `ChunkHash` field used as chunkId token (not re-minted at chat time) ✓
7. no-evidence path emits empty `answer_references` **and** deterministic
   `grounding_warning` with `code` and `message` ✓

### Client Provenance Contract Suites

Files:

- `gui/client/react-client/src/hooks/__tests__/useRagApi.test.jsx`
- `gui/client/react-client/src/state/__tests__/chatStateMachine.test.js`

Originally-red assertions now green:

1. stream parser emits `answer_references` event ✓
2. stream parser emits `grounding_warning` event ✓
3. `CHAT_ACTIONS` defines explicit grounding action constants ✓
4. reducer persists answer references separately from citations ✓
5. reducer persists grounding warning payload separately from transport errors ✓

---

## Current Green Gates (Regression Blockers)

These must stay green on every PR.  Any failure is a release blocker.

### Identity contract gates

| Gate                                                | File                        | What it locks                        |
| --------------------------------------------------- | --------------------------- | ------------------------------------ |
| `SourceId` stored at ingest, read at chat           | `IngestionQueue.test.js`    | Rename-stable source identity        |
| `ChunkHash` stored at ingest, read as `chunkId`     | `IngestionQueue.test.js`    | Ingest-time canonical chunk identity |
| Stored `SourceId` used verbatim, not re-derived     | `provenance.phaseA.test.js` | No FileName-collision regression     |
| Stored `ChunkHash` used verbatim as `chunkId` token | `provenance.phaseA.test.js` | No chat-time drift                   |

### Stream contract gates

| Gate                                                    | File                                                      | What it locks                    |
| ------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| `answer_references` emitted after last token            | `sse.contract.test.js`                                    | SSE ordering                     |
| `answer_references` ids subset of citation ids          | `provenance.phaseA.test.js`                               | No phantom references            |
| No-evidence path emits `grounding_warning`              | `sse.contract.test.js`, `provenance.phaseA.test.js`       | Deterministic warning signal     |
| `grounding_warning` has non-empty `code` and `message`  | both above                                                | Client-parseable warning shape   |

### Telemetry gate

| Gate                                                  | File                      | What it locks          |
| ----------------------------------------------------- | ------------------------- | ---------------------- |
| Query log includes `chunkId` and `sourceId` per result | `queryLogger.test.js` (add) | Post-hoc traceability |

---

## Next Regression Blockers to Add (Slices C–D)

The following tests should be added before the next identity migration ships:

1. **Slice C — grounding_warning determinism end-to-end**: `api.e2e.test.js`
   test that a live no-evidence request always produces a `grounding_warning`
   event (not just the unit-level mock test).

2. **Slice D — telemetry hardening**: Add a `queryLogger` integration test that
   verifies a logged entry for an approved-context query includes both `chunkId`
   and `sourceId` per result, and that an emitted `answer_references` set is
   recorded alongside the retrieved candidates.

3. **FileName-fallback audit test**: Once all rows in the corpus have been
   re-ingested with `SourceId`, add a contract test asserting that
   `deriveSourceId` never emits the `[Provenance] SourceId absent` warning
   during normal operation (i.e., zero legacy rows remain).

---

## Non-Negotiables (Preserved from Original Plan)

1. No schema-first changes without preserving failing-test evidence.
2. No replacement of existing SSE events.
3. No answer references to chunks outside approved context.
4. No promotion of prompt-only inline tags as authoritative grounding evidence.
