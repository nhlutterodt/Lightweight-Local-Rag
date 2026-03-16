---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/Technical_Component_Design.md
last_reviewed: 2026-03-16
audience: engineering
---
# Phase 0 Decision Record: Chunk Identity Lifetime and Semantics

## Status

Phase 0 decision record.

Decision state: approved for Phase A planning and schema design.

This record resolves the chunk-identity assumption in `docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md`.

## Problem Statement

The current runtime has no explicit chunk identity contract.

Current implementation evidence:

1. LanceDB rows are identified operationally by `FileName` plus `ChunkIndex` in practice, not by a dedicated `chunkId`.
2. Ingestion writes `ChunkIndex`, `Text`, `HeaderContext`, `FileType`, `ChunkType`, and `StructuralPath`, but no dedicated chunk identity fields.
3. Retrieval, SSE citations, query logs, and the client chat state all operate without a chunk-level identifier.
4. Large sections can be split with overlap in `processSection()`, so positional continuity cannot be reconstructed safely after the fact.

The repository therefore needs an explicit chunk identity model before implementing grounded answer references or durable provenance joins.

## Standards Applied

This decision is constrained by existing project standards and contracts.

1. The hot path remains Node-native and contract-sensitive.
2. SSE changes must be synchronized with client parsing, docs, and tests.
3. Query results and citations are already explicit contract surfaces.
4. The chosen chunk identity must work with the current in-process LanceDB plus manifest architecture and must not require an external identity service.

## Semantic Requirements

Any accepted chunk identity model must satisfy these requirements.

1. Support durable joins between retrieved chunks, approved prompt chunks, logged evidence, and future answer references.
2. Distinguish multiple chunks from the same source reliably.
3. Avoid over-claiming continuity across re-chunking or schema changes.
4. Support integrity and provenance debugging without implying more stability than the runtime can actually guarantee.
5. Be representable in LanceDB rows and telemetry payloads without ambiguity.

## Options Evaluated

## Option A: `chunkId = sourceId + chunkIndex`

Advantages:

1. Simple.
2. Easy to compute.
3. Unique within a source version if chunk ordering is stable.

Disadvantages:

1. Small edits early in a file can renumber every later chunk.
2. Chunk overlap and splitter changes can cause large downstream churn.
3. It overstates continuity across re-ingests.

Decision:

Rejected as the sole chunk identity.

## Option B: `chunkId = hash(sourceId + chunkText)`

Advantages:

1. Stable when the exact chunk text remains unchanged.
2. Less sensitive to chunk ordering than index-only identity.

Disadvantages:

1. Two repeated identical chunks within one source could collide unless extra context is added.
2. Small whitespace or formatting edits change identity even if the logical section is the same.
3. Still does not represent sequence position or rendering order.

Decision:

Rejected as the sole chunk identity.

## Option C: Multi-Field Chunk Identity Model

Definition:

1. `chunkId` is the stable row-level identity for one chunk instance within one indexed source revision.
2. `chunkHash` is the normalized-content fingerprint for the chunk payload.
3. `chunkOrdinal` is the sequence position of the chunk within the source revision.
4. `sourceId` links the chunk to stable source lineage.

Advantages:

1. Separates identity, content fingerprint, and ordering concerns.
2. Supports durable references within one indexed revision without pretending that re-chunking is continuity-preserving.
3. Allows downstream systems to reason separately about “same source”, “same chunk content”, and “same ordinal slot”.
4. Fits the repository’s need for explicit, testable semantics.

Disadvantages:

1. Requires more fields and clearer documentation.
2. Requires a clear lifetime statement so consumers do not over-assume chunk permanence.

Decision:

Accepted.

## Final Decision

The runtime will use a three-part chunk identity model.

### Decision 1: `chunkId` Is the Canonical Chunk Reference Token

`chunkId` is the identifier used by retrieval outputs, prompt assembly, telemetry, SSE grounding events, and answer references.

Semantic rules:

1. `chunkId` is unique within a collection.
2. `chunkId` identifies a chunk instance from a specific indexed source revision.
3. `chunkId` continuity is guaranteed only within the currently indexed representation of a source.
4. `chunkId` is not guaranteed to survive any re-chunking event, chunker algorithm change, overlap policy change, or source edit that causes re-segmentation.
5. `chunkId` is therefore a durable audit key for one indexed state, not a permanent semantic document anchor across all future re-indexes.

### Decision 2: `chunkHash` Is the Chunk Content Fingerprint

`chunkHash` fingerprints the normalized chunk payload.

Semantic rules:

1. `chunkHash` may be used to detect whether chunk content remained textually identical across re-ingests.
2. `chunkHash` must not replace `chunkId` in SSE, citations, or answer references.
3. `chunkHash` may be used for debugging, migration analysis, and future continuity heuristics.

### Decision 3: `chunkOrdinal` Is Sequence Metadata, Not Identity

`chunkOrdinal` represents the chunk order within one source revision.

Semantic rules:

1. `chunkOrdinal` is the successor field to the current `ChunkIndex` concept.
2. `chunkOrdinal` may change after source edits or chunker changes.
3. `chunkOrdinal` must not be treated as the canonical reference token.

## Lifetime Statement

This record explicitly defines chunk-identity lifetime.

### Guaranteed Stable

For one indexed source revision, the tuple below is stable and authoritative:

1. `sourceId`
2. `chunkId`
3. `chunkHash`
4. `chunkOrdinal`

### Not Guaranteed Stable Across Re-Ingest

The system does not guarantee that `chunkId` survives any of the following:

1. source edits
2. chunk-size or overlap changes
3. chunker bug fixes
4. parser or extractor changes
5. chunk-boundary algorithm redesign

This is intentional. The repository must not pretend that chunk segmentation is semantically immutable when the runtime does not support that claim.

## Minting Rule Constraints

This record resolves semantics first and narrows the acceptable minting rule.

Phase A implementation must satisfy all of these constraints:

1. `chunkId` must be generated deterministically from the indexed chunk representation.
2. Two different chunk instances from the same source revision must not share a `chunkId`.
3. The minting rule must incorporate `sourceId` and enough per-chunk information to distinguish repeated identical text blocks.
4. The minting rule must not rely on mutable display metadata alone.

Permitted implementation shape:

1. `chunkId = hash(sourceId + chunkOrdinal + normalizedChunkText)`

Equivalent deterministic designs are allowed if they preserve the accepted semantics above.

## Operational Consequences

### LanceDB Rows

Phase A must add:

1. `chunkId`
2. `chunkHash`
3. `chunkOrdinal`

`ChunkIndex` may be retained temporarily for migration compatibility, but `chunkOrdinal` becomes the authoritative sequencing field.

### Retrieval Results

`findNearest()` results must eventually expose:

1. `chunkId`
2. `sourceId`
3. `chunkHash` only if needed for debugging or telemetry
4. `chunkOrdinal` where ordering context matters

### Prompt Assembly and SSE

`chunkId` must become the only supported chunk reference token for grounding contracts.

### Telemetry

Query logs and trace artifacts must record `chunkId` for:

1. retrieved candidates
2. approved context
3. dropped candidates
4. answer references

## Edge-Case Decisions

### Identical Repeated Text in One Source Revision

Decision:

Supported.

Required behavior:

1. `chunkId` values must still be unique.
2. `chunkHash` may be identical, but `chunkId` must differ.

### Same Chunk Text Across Different Sources

Decision:

Supported.

Required behavior:

1. `chunkHash` may match.
2. `chunkId` must differ because `sourceId` differs.

### Source Re-Index After Small Edit

Decision:

Continuity of `chunkId` is not guaranteed.

Required behavior:

1. The runtime may mint new `chunkId` values.
2. `chunkHash` may still support debugging of partial continuity.

## Required Regression Barriers

Phase A and Phase C must introduce these blockers.

1. Unique `chunkId` test for repeated identical chunk text within one file.
2. Different-source same-content test proving `chunkId` divergence.
3. Re-ingest test proving that `chunkId` is treated as revision-scoped, not lineage-scoped.
4. Retrieval-result schema tests covering `chunkId` presence once implemented.
5. SSE grounding tests using `chunkId` as the only answer-reference token.

## Decision Summary

The repository will not use `chunkIndex` alone and will not use text hash alone as chunk identity.

The accepted semantic model is:

1. `chunkId` = canonical chunk reference token for one indexed chunk instance
2. `chunkHash` = normalized-content fingerprint
3. `chunkOrdinal` = sequence metadata only
4. `chunkId` stability is revision-scoped, not lineage-scoped

This decision is now locked for Phase A and Phase C design.