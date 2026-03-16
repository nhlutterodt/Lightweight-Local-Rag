---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/Technical_Component_Design.md
last_reviewed: 2026-03-16
audience: engineering
---
# Phase 0 Decision Record: Source Identity Semantics

## Status

Phase 0 decision record.

Decision state: approved for Phase A planning and schema design.

This record resolves the first assumption in `docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md`: source identity semantics.

## Problem Statement

The current runtime uses `FileName` as the effective operational identity across the manifest, LanceDB row mutation, and orphan cleanup logic.

Current implementation evidence:

1. `DocumentParser` stores manifest entries keyed by lowercase `FileName`.
2. `IngestionQueue` derives `currentFileNames` from `path.basename()`.
3. Re-ingest deletes by `FileName` equality.
4. Orphan cleanup deletes by `FileName` equality.
5. Integrity scanning groups and compares rows by lowercase `FileName`.

This is insufficient for any corpus where two different files share the same basename.

## Standards Applied

This decision is constrained by existing project standards.

1. The live runtime remains Node-native and in-process.
2. File access remains bound to the current allowed-root and canonical-path policy.
3. New identity semantics must preserve existing rename detection goals where possible.
4. The solution must be migration-friendly with the existing manifest migration model and integrity tooling.
5. The solution must not require an external metadata service or database outside the current LanceDB plus manifest architecture.

## Options Evaluated

## Option A: Path-Derived Identity Only

Definition:

`sourceId = sha256(canonicalCurrentPath)`

Advantages:

1. Deterministic.
2. Easy to compute from existing path validation behavior.
3. Distinguishes duplicate basenames cleanly.

Disadvantages:

1. Renames create a new identity rather than preserving lineage.
2. Moving a corpus root or restoring from a different absolute path breaks continuity.
3. Conflicts with current rename-detection behavior, which uses content hash to detect continuity across name changes.

Decision:

Rejected as the primary source identity.

Reason:

It encodes current location, not stable source lineage.

## Option B: Content-Hash Identity Only

Definition:

`sourceId = sha256(fileContent)`

Advantages:

1. Stable across renames.
2. Deterministic.

Disadvantages:

1. Two distinct files with identical content collapse into one identity.
2. Any edit changes identity, even though the logical source is the same document.
3. Conflates source lineage with a single content revision.

Decision:

Rejected as the primary source identity.

Reason:

It identifies a content revision, not a logical source.

## Option C: Persistent Lineage Identity Plus Current Location

Definition:

1. `sourceId` is the stable logical-source lineage identifier.
2. `sourcePath` is the current canonical location.
3. `contentHash` remains the current revision identifier.
4. Rename detection preserves `sourceId` while updating `sourcePath`.
5. Duplicate basenames are disambiguated by `sourceId`, not by display name.

Advantages:

1. Preserves rename lineage.
2. Keeps current location explicit and queryable.
3. Separates source identity from revision identity.
4. Supports duplicate basenames safely.
5. Matches the current architecture, where manifest state already carries file-specific lineage information over time.

Disadvantages:

1. Requires an explicit minting rule for first ingestion.
2. Requires migration work across manifest, LanceDB, integrity tooling, and re-ingest paths.
3. Requires a clear rule for what happens after full re-index from scratch.

Decision:

Accepted.

## Final Decision

The system will use a two-layer source identity model.

### Decision 1: `sourceId` Represents Stable Logical Source Lineage

`sourceId` is the primary operational identifier for a source within a collection.

Semantic rules:

1. `sourceId` is unique per logical source within a collection.
2. `sourceId` does not change when the file is renamed within the managed corpus.
3. `sourceId` does not change when the file content changes through normal edits.
4. `sourceId` must be the key used for LanceDB row mutation, orphan cleanup, integrity scans, and future answer provenance joins.
5. `sourceId` is not a user-facing field.

### Decision 2: `sourcePath` Represents Current Canonical Location

`sourcePath` is the current canonical absolute path of the source at last successful ingest.

Semantic rules:

1. `sourcePath` is mutable.
2. `sourcePath` updates on rename or move events detected within the managed corpus.
3. `sourcePath` remains displayable and auditable but is not the primary operational key.

### Decision 3: `contentHash` Represents Current Revision Identity

`contentHash` remains the revision-level signal for change detection.

Semantic rules:

1. `contentHash` changes when file content changes.
2. `contentHash` may be used for rename detection and ingest skipping.
3. `contentHash` must not replace `sourceId` as the primary source key.

### Decision 4: `FileName` Remains Display Metadata Only

`FileName` remains a user-facing display field and coarse retrieval signal, but it must no longer be treated as source identity.

## Minting Rule

This record resolves source identity semantics first. It intentionally narrows, but does not fully finalize, the minting algorithm.

The Phase A implementation must satisfy all of these rules:

1. `sourceId` must be minted exactly once for a newly discovered source lineage.
2. The minting rule must not collapse two different files with identical content into one source.
3. The minting rule must not force a new identity on rename.
4. The minting rule must be collection-scoped.
5. The minting rule must be representable in the manifest migration and integrity-check model.

Permitted Phase A designs:

1. Persisted minted ID stored in the manifest and carried forward across rename detection.
2. Deterministic lineage ID derived from a first-seen seed that includes collection scope and first-ingest canonical path, then persisted thereafter.

Explicitly disallowed:

1. Recomputing `sourceId` from current path on every ingest.
2. Recomputing `sourceId` from current `contentHash` on every ingest.

## Operational Consequences

Phase A implementation must change these semantics across the codebase.

### Manifest

1. Manifest entries must be keyed by `sourceId`, not lowercase `FileName`.
2. Name-based lookup may remain as an auxiliary helper, not the primary map key.
3. Rename detection must update `sourcePath` and display metadata while preserving `sourceId`.

### LanceDB Rows

1. Every row must store `sourceId`.
2. Deletes and updates must operate by `sourceId`.
3. `FileName` may remain for retrieval filters and UI display.

### Integrity Tooling

1. Integrity scans must group by `sourceId`.
2. Orphan detection must compare manifest versus DB by `sourceId`.
3. `FileName`-only comparisons must be retired from the authoritative integrity logic.

### Query and Citation Paths

1. Retrieval results must expose `sourceId` so later chunk- and source-level provenance joins are possible.
2. `FileName` must remain supplemental attribution, not identity.

## Edge-Case Decisions

### Duplicate Basenames in Different Directories

Decision:

Supported.

Required behavior:

1. Both files must coexist in the same collection.
2. Re-ingesting one must not delete or mutate the other.

### Rename Within Managed Corpus

Decision:

Preserve source lineage.

Required behavior:

1. `sourceId` remains stable.
2. `sourcePath` and `FileName` update.

### Edit In Place

Decision:

Preserve source lineage.

Required behavior:

1. `sourceId` remains stable.
2. `contentHash` changes.
3. Existing rows for the same `sourceId` are replaced on re-ingest.

### Full Re-Index Without Prior Manifest

Decision:

Continuity is not guaranteed unless the prior manifest lineage is available.

Reason:

The current project architecture treats manifest state as the local lineage ledger. If that ledger is discarded, Phase A may treat the corpus as newly discovered sources.

## Required Regression Barriers

Phase A must introduce these blockers before rollout is considered complete.

1. Duplicate-basename ingest test.
2. Rename-preserves-sourceId test.
3. Edit-in-place preserves sourceId but changes contentHash test.
4. Orphan cleanup by `sourceId` test.
5. Integrity scan by `sourceId` test.

## Decision Summary

The repository will not use path-only identity and will not use content-only identity for sources.

The accepted semantic model is:

1. `sourceId` = stable logical source lineage
2. `sourcePath` = current canonical location
3. `contentHash` = current revision identity
4. `FileName` = display metadata only

This decision is now locked for Phase A design and implementation.