---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md
last_reviewed: 2026-03-16
audience: engineering
---
# Phase A Failing Provenance Test Plan

## Purpose

Start Phase A in test-first mode with intentionally failing provenance gates before schema or runtime implementation changes.

This plan operationalizes the approved decisions in:

1. docs/active-drafts/RAG_Chunk_Identity_Decision_Record.md
2. docs/active-drafts/RAG_Grounding_Stream_Contract_Decision_Record.md

## Red-Baseline Status

Current status is intentionally red.

### Server Provenance Contract Suite

File:

1. gui/server/tests/provenance.phaseA.test.js

Command:

```powershell
Set-Location "gui/server"
npm test -- tests/provenance.phaseA.test.js
```

Expected red assertions (current runtime):

1. `metadata.citations[*].chunkId` missing
2. `metadata.citations[*].sourceId` missing
3. final `answer_references` event not emitted
4. subset rule cannot be validated because `answer_references` is absent

### Client Provenance Contract Suites

Files:

1. gui/client/react-client/src/hooks/__tests__/useRagApi.test.jsx
2. gui/client/react-client/src/state/__tests__/chatStateMachine.test.js

Command:

```powershell
Set-Location "gui/client/react-client"
npm test -- src/hooks/__tests__/useRagApi.test.jsx src/state/__tests__/chatStateMachine.test.js
```

Expected red assertions (current client):

1. stream parser does not emit `answer_references`
2. stream parser does not emit `grounding_warning`
3. `CHAT_ACTIONS` lacks explicit grounding action constants
4. reducer does not persist answer references or grounding warning state

## Gate Definition

Phase A may proceed only through implementation slices that convert these red assertions to green without violating additive stream compatibility.

Required gate outcomes:

1. `chunkId` and `sourceId` appear in metadata citations
2. final `answer_references` SSE event exists and references approved chunks only
3. client stream hook emits `answer_references` and `grounding_warning`
4. reducer stores answer references separately from citations
5. reducer stores grounding warning payload separately from transport errors

## Execution Order

1. Maintain current red baseline tests unchanged.
2. Implement smallest backend slice to satisfy server provenance tests.
3. Implement smallest client parsing and state slice to satisfy client provenance tests.
4. Re-run both targeted suites.
5. Only then extend broader suites (`sse.contract`, `api.e2e`) for compatibility and regression coverage.

## Non-Negotiables

1. No schema-first changes without preserving failing-test evidence.
2. No replacement of existing SSE events in first rollout.
3. No answer references to chunks outside approved context.
4. No promotion of prompt-only inline tags as authoritative grounding evidence.