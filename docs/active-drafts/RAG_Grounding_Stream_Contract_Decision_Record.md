---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/SSE_CONTRACT.md
last_reviewed: 2026-03-16
audience: engineering
---
# Phase 0 Decision Record: Grounding Stream Contract and Answer References

## Status

Phase 0 decision record.

Decision state: approved for Phase C planning and contract design.

This record resolves the stream-contract and answer-reference assumption in `docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md`.

## Problem Statement

The current `/api/chat` stream contract supports:

1. `status`
2. `metadata` with citations
3. token events via `message.content`
4. exceptional `error`

Current implementation evidence:

1. `useRagApi.js` emits only `start`, `metadata`, `token`, `error`, `cancelled`, and `done` updates.
2. `App.jsx` dispatches only the existing chat state transitions.
3. `chatStateMachine.js` stores citations as side metadata on the active assistant message.
4. `sse.contract.test.js` asserts the current wire format and event shapes.
5. `api.e2e.test.js` validates the current metadata-plus-token flow.

The current design exposes retrieved citations but does not expose machine-readable answer references bound to prompt-approved chunks.

## Standards Applied

This decision is constrained by repository standards and existing contracts.

1. SSE is a reference contract, not an informal backend detail.
2. Stream changes must remain parseable by the current JSON-per-line model.
3. Client breakage is unacceptable as an incidental side effect of provenance work.
4. Grounding additions must be additive-first unless a later explicit breaking contract revision is approved.
5. The system must not claim answer-level grounding that it cannot verify against approved prompt chunks.

## Goals

The grounding stream evolution must satisfy these goals.

1. Preserve the current streaming UX.
2. Preserve existing client compatibility during rollout.
3. Add machine-readable answer-reference support.
4. Allow explicit signaling when an answer is ungrounded or weakly grounded.
5. Keep the answer-reference contract testable and deterministic.

## Options Evaluated

## Option A: Model Emits Inline References Only

Definition:

The model is instructed to emit inline tags such as `[chunk:abc123]` inside token text, and the client or server parses them from the raw response content.

Advantages:

1. Minimal new stream surface.
2. References are visible inline.

Disadvantages:

1. Inline tokens are fragile and model-dependent.
2. Streaming parsers would need to handle partial tag boundaries.
3. Malformed references would be difficult to distinguish from ordinary text.
4. The contract would depend too heavily on prompt obedience.

Decision:

Rejected as the sole grounding contract.

## Option B: Server Emits Final Structured Answer-Reference Event Only

Definition:

The server streams the answer text normally, then emits a final event containing machine-readable references resolved to approved chunk IDs.

Advantages:

1. Strong machine-readable contract.
2. Minimal interference with token streaming.
3. Easy to test.

Disadvantages:

1. No inline visibility during the answer itself.
2. If the model text references sources informally, the UI still lacks an inline standardized form.

Decision:

Accepted as the minimum required grounding contract.

## Option C: Hybrid Contract With Final Structured Event and Optional Inline Tags

Definition:

1. The stream remains token-first.
2. The server emits a final structured `answer_references` event.
3. Inline chunk tags may be added later as an optional presentation enhancement, not as the authoritative contract.

Advantages:

1. Preserves the benefits of Option B.
2. Leaves room for richer inline UX later.
3. Keeps the authoritative reference model machine-readable and server-validated.

Disadvantages:

1. Slightly more complex documentation because one form is authoritative and the other is optional.

Decision:

Accepted.

## Final Decision

The stream contract will evolve additively.

### Decision 1: Keep Existing Events Intact During the First Grounding Rollout

The following current event shapes remain valid and unchanged in the initial grounding rollout:

1. `status`
2. `metadata`
3. token events via `message.content`
4. exceptional `error`

Reason:

The current client parser and tests are tightly coupled to these shapes. An additive evolution is lower-risk and standards-compliant.

### Decision 2: Add a Final `answer_references` Event as the Authoritative Grounding Contract

The first authoritative grounding extension will be a final machine-readable event:

```json
{
  "type": "answer_references",
  "references": [
    {
      "chunkId": "chunk_123",
      "sourceId": "src_456"
    }
  ]
}
```

Semantic rules:

1. `answer_references` is emitted after token streaming completes and before the stream ends.
2. Every referenced `chunkId` must belong to the approved prompt context for the request.
3. `answer_references` is the authoritative machine-readable grounding signal.
4. The event may include optional display fields later, but `chunkId` remains the canonical reference token.

### Decision 3: Add a `grounding_warning` Event for Explicit Non-Grounded Outcomes

The stream may emit a separate event when grounding cannot be claimed safely.

```json
{
  "type": "grounding_warning",
  "code": "NO_APPROVED_CONTEXT",
  "message": "No approved evidence was available for grounded references."
}
```

Semantic rules:

1. `grounding_warning` is additive and advisory.
2. It does not replace `error`.
3. It communicates lack of grounding confidence or lack of approved evidence without implying transport failure.

### Decision 4: Inline Reference Tags Are Deferred as a Non-Authoritative Enhancement

Inline reference tags may be explored later, but they are explicitly not part of the first authoritative contract.

Reason:

The current repository standards favor machine-readable, test-covered contracts over prompt-only conventions.

## Contract Evolution Strategy

### Additive-First Migration

The first implementation slice must be additive.

Required behavior:

1. Existing clients that only understand `metadata`, token, and error events must continue to function.
2. New clients may consume `answer_references` and `grounding_warning`.
3. Unknown event types must be safely ignorable by the client.

### Client Compatibility Implication

Current implementation evidence shows:

1. `useRagApi.js` ignores unknown event shapes unless they match explicit cases.
2. `App.jsx` only dispatches known event types.
3. The current chat state machine will therefore not break if the new events are additive and the parser is updated carefully.

Implication:

The first stream evolution should extend parsing and state handling rather than replacing any existing event.

## Event Ordering Decision

The authoritative event order for the first grounding rollout is:

1. `status`
2. `metadata`
3. zero or more token events
4. optional `answer_references`
5. optional `grounding_warning`
6. stream end

Ordering rules:

1. `metadata` continues to expose retrieved-and-approved citations for immediate UI rendering.
2. `answer_references` is emitted after token completion so it can reflect the final validated answer-reference set.
3. `grounding_warning` may appear if no valid answer references can be asserted.

## Authoritative Answer-Reference Semantics

The repository will use these semantics for answer references.

1. An answer reference is a claim that a chunk supported the generated answer.
2. The system must not emit an answer reference for any chunk outside the approved prompt context.
3. `answer_references` is not a replay of all citations; it is the smaller set of chunks that the grounding contract treats as supporting evidence for the answer.
4. If the system cannot verify that narrower set safely in the first implementation slice, it may initially define `answer_references` as the subset of approved chunks intentionally carried forward as final evidence, but the definition must stay explicit in docs and tests.

## Minimum Event Shapes

### `metadata`

Retained for immediate citation rendering.

Future-compatible extension is allowed, but the existing fields remain required.

### `answer_references`

Minimum required fields:

1. `type`
2. `references[]`
3. `references[].chunkId`

Recommended first rollout fields:

1. `references[].chunkId`
2. `references[].sourceId`
3. `references[].fileName` as convenience metadata if already available

### `grounding_warning`

Minimum required fields:

1. `type`
2. `code`
3. `message`

## Explicitly Rejected Designs

1. Breaking replacement of `metadata` with a different event shape.
2. Embedding answer-reference semantics only inside free-form token text.
3. Emitting answer references before the final answer text is complete.
4. Claiming answer references for chunks that were retrieved but dropped from approved context.

## Required Client and Test Consequences

### Client

Phase C must update:

1. `useRagApi.js` to parse `answer_references` and `grounding_warning`
2. `App.jsx` to dispatch new chat events
3. `chatStateMachine.js` to store answer references separately from citations

### Tests

Phase C must extend:

1. `sse.contract.test.js` for the new event shapes and ordering
2. `useRagApi` tests for new parser behavior
3. `chatStateMachine` tests for answer-reference state handling
4. e2e chat tests for presence of machine-readable grounding events

## Rollout Rules

1. First rollout is additive only.
2. Contract docs must be updated in the same change set as implementation.
3. The authoritative wire contract remains JSON-per-line SSE.
4. Unknown event types must remain safely ignorable.

## Decision Summary

The repository will not use prompt-only inline references as the authoritative grounding contract.

The accepted stream-evolution model is:

1. keep existing SSE events intact
2. add a final `answer_references` event as the authoritative machine-readable grounding signal
3. add `grounding_warning` as an explicit advisory signal for non-grounded outcomes
4. defer inline reference tags to a later non-authoritative enhancement

This decision is now locked for Phase C planning.