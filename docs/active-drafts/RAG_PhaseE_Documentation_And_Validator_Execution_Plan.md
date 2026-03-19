---
doc_state: active-draft
doc_owner: maintainers
canonical_ref: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md
last_reviewed: 2026-03-18
audience: engineering
---
# Phase E Execution Plan — Documentation Realignment, Validator Hardening, and Phase F Prework

## Status

In progress. Phase D is complete and frozen.

Initial Phase E canonical-doc corrections and validator hardening have already
started. This document remains the governing inventory for the remaining
documentation work and the Phase F prework handoff.

This document defines the evidence-backed Phase E plan and records the approved
Phase F prework inventory. It does not authorize opportunistic migration closure
outside the explicitly documented handoff requirements below.

---

## Purpose

Phase E closes the remaining documentation drift and validator gap between the live
runtime and the canonical documentation set. It also includes the Phase F prework needed
to identify migration-sensitive fallback paths and release-blocking legacy behavior before
any migration closure work begins.

This phase is intentionally evidence-first. The immediate goal is not to edit everything
quickly. The immediate goal is to produce a deterministic inventory of:

1. Canonical doc mismatches against the live runtime.
2. Missing validator rules that allow stale runtime claims to persist.
3. Documentation that is safe to remove outright versus documentation that must be rewritten or relocated.
4. Migration-sensitive legacy behavior that must be planned under Phase F rather than changed opportunistically.

---

## Scope

### In Scope

1. Audit the highest-priority canonical docs against live runtime behavior.
2. Build a file-anchored mismatch inventory.
3. Define deterministic removal criteria for obsolete documentation content.
4. Identify missing `Validate-Docs.ps1` stale-runtime rules.
5. Plan validator rule expansion for canonical and reference-contract docs.
6. Capture Phase F prework findings for migration-sensitive fallbacks and legacy provenance paths.
7. Define the execution gates for the eventual Phase E implementation work.

### Out of Scope

1. Editing canonical docs in bulk before the mismatch inventory is approved.
2. Removing runtime fallbacks from code.
3. Executing collection re-ingest or migration closure.
4. Implementing fine-grained locator fidelity.
5. Changing SSE or API behavior.

---

## Evidence Base

The following live runtime anchors were verified directly for this plan:

1. `gui/server/IngestionQueue.js`
2. `gui/server/server.js`
3. `gui/server/lib/vectorStore.js`
4. `gui/server/lib/documentParser.js`
5. `gui/server/lib/integrityCheck.js`
6. `gui/server/lib/evalLogSchema.js`
7. `scripts/Validate-Docs.ps1`

The following canonical docs were audited as the first-priority inventory set:

1. `docs/Architecture_Design.md`
2. `docs/Technical_Component_Design.md`
3. `docs/DEVELOPER_ONBOARDING.md`
4. `docs/RAG_Copilot_Instructions.md`

---

## Verified Runtime Facts Relevant to Phase E

1. Live ingestion is Node-native through `IngestionQueue.js`; `/api/ingest` is deprecated and queue-based flows use `/api/queue`.
2. Ingestion, re-ingest deletion, and orphan cleanup operate by `SourceId`, not `FileName`.
3. Stored `ChunkHash` is used as the canonical chunk identity token in retrieval and grounding.
4. `locatorType` is propagated end-to-end, but fine-grained locator fields are not universally implemented.
5. Prompt assembly uses structured `[CHUNK ...]` blocks.
6. SSE emits `metadata`, `message`, `answer_references`, and `grounding_warning`.
7. Query telemetry now writes to `logs/query_log.v1.jsonl` and includes score schema metadata.
8. Eval tooling rejects schema-invalid query logs by default.

---

## Mismatch Inventory — Priority Canonical Docs

### 1. `docs/Architecture_Design.md`

#### Verified mismatches

1. Still describes query telemetry as `logs/query_log.jsonl` in the server responsibilities section.
2. Still lists `logs/query_log.jsonl` in observability surfaces.
3. The read-path diagram still ends with `Async Write to query_log.jsonl`.
4. Storage architecture still states `logs/query_log.jsonl` as the active per-query telemetry artifact.
5. The read-path diagram does not reflect final `answer_references` or `grounding_warning` SSE behavior.
6. The read-path diagram does not reflect provenance-complete prompt assembly using structured chunk blocks.

#### Required action class

1. Rewrite active runtime statements to match the v1 query log path and current stream contract.
2. Update diagrams to reflect the actual grounding and telemetry flow.
3. Remove any wording that implies the pre-v1 query log path is still active.

### 2. `docs/Technical_Component_Design.md`

#### Verified mismatches

1. SSE section still documents only `status`, `metadata`, and `message` events in the narrative examples.
2. The `metadata` citation example is missing `chunkId`, `sourceId`, and `locatorType` shape expectations.
3. The document does not describe final `answer_references` emission or deterministic `grounding_warning` behavior even though both are live contract surfaces.
4. The chunking section explains metadata-rich chunks, but does not yet explain the delivered `locatorType` contract.
5. The document does not describe the delivered retrieval trace schema and score-schema versioning work from Phase D.

#### Required action class

1. Rewrite SSE and provenance sections to reflect the live contract.
2. Add the actual emitted provenance fields rather than preview-only examples.
3. Add a concise section for query telemetry v1 and retrieval trace accounting.

### 3. `docs/DEVELOPER_ONBOARDING.md`

#### Verified mismatches

1. The answer to "Why are we using PowerShell instead of Python?" still says the project uses PowerShell for ingestion, chunking, and file processing as if that is the live runtime path.
2. The logging/telemetry answer still points to `logs/query_log.jsonl` instead of `logs/query_log.v1.jsonl`.
3. The onboarding narrative still over-weights PowerShell in a way that can mislead contributors about the current Node-owned ingestion/runtime boundary.

#### Required action class

1. Rewrite onboarding explanations so PowerShell is described as utility/diagnostics plus legacy tooling, not the live ingestion owner.
2. Update telemetry path references to the v1 runtime contract.
3. Preserve project philosophy where still true, but remove role descriptions that are no longer operationally accurate.

### 4. `docs/RAG_Copilot_Instructions.md`

#### Verified mismatches

1. Project overview still describes the system as a PowerShell + Node.js RAG pipeline in a way that implies shared live ingestion ownership.
2. Tech stack still says `PowerShell 7+ (pwsh): ingestion pipeline only`, which is not the live runtime truth.
3. The PowerShell section still lists ingest-time ownership in a way that conflicts with the Node-native queue and chunking path.
4. Query logging section still uses `logs/query_log.jsonl` and a pre-Phase-D schema that lacks `scoreSchemaVersion`, `scoreType`, `retrievedCandidates`, `approvedContext`, `droppedCandidates`, and `answerReferences`.
5. The file descriptions for the hot/runtime boundary need to align with the actual Node-owned ingestion path and current provenance model.

#### Required action class

1. Rewrite the runtime ownership narrative to make Node the sole live ingestion and retrieval owner.
2. Narrow the PowerShell role to utility, diagnostics, and standalone tools.
3. Replace the query logging section with the v1 telemetry contract.
4. Assess whether any remaining PowerShell-centric instructions are safe to remove entirely rather than preserve.

---

## Deterministic Removal Constraints

When a stale documentation statement is found, removal is the default action unless one of the preservation conditions below applies.

### Remove outright when all conditions are true

1. The statement describes a runtime owner, storage path, endpoint, or contract that is no longer live.
2. No current code path or contract doc requires the statement for user or engineer correctness.
3. The statement is not required for migration guidance or historical audit.
4. A current authoritative document already covers the active replacement behavior, or the same change set will add it.

### Rewrite instead of remove when any condition is true

1. The underlying concept is still valid but the runtime ownership or implementation path changed.
2. The statement is directionally correct but uses stale file names, stale event shapes, or stale storage locations.
3. The statement still serves onboarding or architectural comprehension once corrected.

### Relocate to historical when any condition is true

1. The content is no longer operationally correct, but preserving it has audit or evolution value.
2. The content explains a deprecated design decision that should not remain in canonical docs.
3. The content is useful only as historical context and would be misleading if left in canonical form.

### Preserve only when proven by current runtime evidence

1. The behavior is still implemented and test-supported.
2. The statement’s wording does not imply outdated ownership or storage architecture.
3. The statement does not conflict with the Node-only hot-path and ingestion boundary.

---

## Missing Validator Rules

`Validate-Docs.ps1` currently blocks these stale runtime terms in canonical and reference-contract docs:

1. `/api/ingest`
2. `PowerShellRunner.js`
3. `.vectors.bin`
4. `.metadata.json`

That is necessary but not sufficient.

### Missing rule class 1 — stale active query-log path

#### Observed issue

Canonical docs still use `logs/query_log.jsonl` as if it were the active runtime path.

#### Required new rule

Flag `logs/query_log.jsonl` and `query_log.jsonl` as stale active-path claims in canonical/reference-contract docs unless the content is explicitly and narrowly describing legacy archive rotation or historical context.

### Missing rule class 2 — stale PowerShell ingestion ownership language

#### Observed issue

Canonical docs can still state or imply that PowerShell owns live ingestion, chunking, or file processing.

#### Required new rule

Add targeted stale-runtime detection for phrases that explicitly assign active ingestion ownership to PowerShell in canonical/reference-contract docs.

Rule design constraint:

1. Avoid broad regex that punishes legitimate historical or utility-layer references.
2. Prefer narrowly targeted phrases such as `PowerShell 7+.*ingestion pipeline only` and `PowerShell for ingestion, chunking, and file processing`.

### Missing rule class 3 — incomplete SSE contract narratives in canonical docs

#### Observed issue

Some canonical docs still describe the live stream as if it only consisted of `status`, `metadata`, and token `message` events.

#### Required new rule

Do not attempt a broad regex blocker initially. Instead:

1. Treat this as an inventory-driven manual correction set for Phase E.
2. After canonical docs are updated, decide whether a validator rule is practical without creating false positives.

### Missing rule class 4 — stale telemetry schema examples

#### Observed issue

Canonical docs can still present pre-Phase-D query log examples that omit v1 schema fields and retrieval trace sets.

#### Required new rule

Start with inventory and manual update rather than immediate regex enforcement. Once the docs converge, evaluate whether reference-contract docs should require mention of:

1. `scoreSchemaVersion`
2. `scoreType`
3. `answerReferences`

---

## Phase F Prework Included in Phase E

Phase E includes the planning prework required before Phase F can begin.

### Prework target 1 — identify live fallback paths

Inventory all remaining provenance and migration fallback paths still present in code, including:

1. `deriveSourceId` fallback warnings for rows missing `SourceId`.
2. `deriveChunkId` fallback behavior for rows missing `ChunkHash`.
3. Any manifest or retrieval compatibility behavior that assumes legacy row shapes.

### Prework target 2 — define re-ingest closure criteria

Phase F planning must define what evidence proves the repository has fully exited the basename-only operational identity model.

Minimum evidence targets:

1. No production collection relies on `FileName` as operational identity.
2. No normal retrieval path emits the legacy `SourceId absent` warning.
3. Legacy query-log dependence is eliminated for active tooling.

### Prework target 3 — separate documentation cleanup from migration closure

Phase E may document legacy behavior and plan its removal, but it must not silently collapse into Phase F execution.

---

## Phase F Prework Inventory — Verified Live Fallback and Migration-Sensitive Paths

The following paths were verified directly in live runtime code and are the
minimum required Phase F handoff inventory.

### 1. Retrieval-time `SourceId` fallback remains live

Evidence anchor: `gui/server/server.js`

Verified behavior:

1. `deriveSourceId(result)` still accepts rows with missing `SourceId`.
2. When `SourceId` is absent, the server logs a provenance warning and falls back to a deterministic hash derived from `FileName`.
3. This is explicitly marked as a legacy compatibility path for rows ingested before the v2 identity migration.

Phase F implication:

1. Retrieval can still serve basename-derived identity for legacy rows.
2. Phase F cannot claim provenance closure until this warning path stops appearing in normal retrieval for active collections.

### 2. Retrieval-time `ChunkHash` fallback remains live

Evidence anchors: `gui/server/server.js`, `gui/server/lib/vectorStore.js`

Verified behavior:

1. `deriveChunkId(result, sourceId)` still synthesizes a fallback chunk identifier when `ChunkHash` is missing.
2. Retrieval result mapping still tolerates missing canonical ordinal fields via `chunkOrdinal ?? ChunkIndex`.
3. Retrieval trace generation emits an empty `chunkId` when `ChunkHash` is absent.

Phase F implication:

1. Chunk identity closure is not complete while active rows can omit `ChunkHash`.
2. Trace completeness and citation stability still depend on compatibility behavior for legacy rows.

### 3. Manifest migration still relies on legacy-source reconstruction

Evidence anchor: `gui/server/lib/documentParser.js`

Verified behavior:

1. Manifest version `1.0` is still recognized as legacy input.
2. The `2.0` migration mints `SourceId` from `SourcePath` when available.
3. The same migration falls back to `FileName` when `SourcePath` is missing.

Phase F implication:

1. Manifest migration can still preserve basename-derived identity when older entries lack `SourcePath`.
2. Phase F needs explicit evidence about how many retained manifests still require this fallback before removing or tightening it.

### 4. Ingestion rename detection still carries legacy `SourcePath`-absent behavior

Evidence anchor: `gui/server/IngestionQueue.js`

Verified behavior:

1. Rename detection and hash-match handling still contain compatibility logic for manifest entries missing `SourcePath`.
2. The queue can still reason about same-content files with incomplete legacy path identity.
3. Existing manifest-entry lookup still influences `SourceId` continuity decisions for edited content.

Phase F implication:

1. Source-identity closure is not just a retrieval concern; it also affects re-ingest, rename, and duplicate-content handling.
2. Phase F must verify that active manifests no longer depend on `SourcePath`-absent compatibility before simplifying this logic.

### 5. `ChunkIndex` compatibility remains intentionally live

Evidence anchors: `gui/server/IngestionQueue.js`, `gui/server/lib/vectorStore.js`

Verified behavior:

1. Ingestion still writes `ChunkIndex` alongside canonical `chunkOrdinal` for migration compatibility.
2. Retrieval still reads `chunkOrdinal ?? ChunkIndex`.

Phase F implication:

1. Ordinal migration is not fully closed while `ChunkIndex` remains part of active compatibility reads.
2. Phase F needs an explicit decision on whether `ChunkIndex` remains a permanent compatibility field or becomes removable after re-ingest closure.

### 6. Queue-state migration support remains live

Evidence anchor: `gui/server/IngestionQueue.js`

Verified behavior:

1. Queue persistence still recognizes legacy plain-array state as schema version `0`.
2. `_migrateQueueState(raw)` applies migration functions up to the current queue schema version.
3. Forward-incompatible queue state is backed up and reset to empty.

Phase F implication:

1. Queue persistence behavior is migration-sensitive and cannot be changed casually during documentation cleanup.
2. Phase F must treat queue-state compatibility as a release concern and document rollback or reset expectations before any schema tightening.

### 7. Model migration remains a manifest-driven operational dependency

Evidence anchors: `gui/server/server.js`, `gui/server/lib/modelMigration.js`

Verified behavior:

1. Server startup compares the stored embedding model against the configured target model.
2. On mismatch, the runtime triggers `triggerModelMigration(...)` and sets `store.isReady = false`.
3. `triggerModelMigration(...)` gathers source directories from manifest `SourcePath`, clears the manifest, queues re-index jobs, and warns when valid `SourcePath` values are missing.

Phase F implication:

1. Model migration already depends on manifest quality and therefore inherits legacy `SourcePath` gaps.
2. Phase F handoff must preserve the rule that stale-model collections remain unavailable rather than silently querying mixed embeddings.

### 8. Legacy query-log handling is constrained but still intentionally available

Evidence anchors: `gui/server/lib/queryLogger.js`, `gui/server/lib/evalLogSchema.js`

Verified behavior:

1. The runtime writes active telemetry to `logs/query_log.v1.jsonl`.
2. On initialization, the logger rotates an older `logs/query_log.jsonl` file into `logs/archive` with a legacy timestamped name.
3. Eval tooling still allows explicit selection of `logs/query_log.jsonl` only when `allowLegacySchema` is opted in.

Phase F implication:

1. Legacy query-log handling is no longer the default, but it remains a supported compatibility path for historical analysis.
2. Phase F should not remove legacy eval access until historical consumers are either migrated or explicitly retired.

---

## Phase F Handoff Checklist

Phase F planning is not complete until the following checklist is fully answered
with code-backed evidence.

### A. Collection and manifest evidence

1. Identify every active collection whose retrieval path can still emit the `SourceId absent` warning.
2. Identify whether any active LanceDB rows still lack `ChunkHash`.
3. Identify whether any retained manifests are still version `1.0` or require `SourcePath`-absent migration fallback.
4. Identify whether any active workflows still rely on `ChunkIndex` rather than canonical `chunkOrdinal`.

### B. Operational closure criteria

1. No normal retrieval request against an approved collection emits the legacy `SourceId absent` warning.
2. No approved collection contains active rows without `ChunkHash`.
3. No approved manifest requires basename-only identity reconstruction to derive `SourceId`.
4. Any retained `ChunkIndex` usage is either removed after re-ingest closure or explicitly declared a permanent compatibility field.
5. Stale-model collections remain blocked from serving queries until re-embedding completes.

### C. Tooling and observability closure criteria

1. Active evaluation and reporting flows default to `logs/query_log.v1.jsonl`.
2. Any use of `logs/query_log.jsonl` is explicitly historical and opt-in only.
3. Documentation and validators continue to treat legacy log usage as historical context, not canonical runtime truth.

### D. Release handoff requirements

1. Record which fallbacks are temporary and targeted for removal versus which remain supported compatibility surfaces.
2. For each targeted removal, define the evidence source that proves removal is safe.
3. For each retained compatibility path, define the operational owner and the condition under which it can be revisited.
4. Do not remove retrieval, manifest, queue, or model-migration compatibility paths in the same change set as documentation cleanup unless the closure evidence is already collected and approved.

---

## Execution Sequence

1. Complete the mismatch inventory for the four priority canonical docs.
2. Complete the validator-rule inventory against `Validate-Docs.ps1`.
3. Expand the mismatch inventory to any additional canonical/reference-contract docs touched by the same stale patterns.
4. Classify each stale statement as remove, rewrite, relocate, or preserve.
5. Record Phase F prework findings for fallback and migration-sensitive behaviors.
6. Approve the inventory and rule set.
7. Only then begin the actual Phase E implementation change set.

---

## Planned Deliverables for the Implementation Change Set

The eventual Phase E implementation should produce the following outputs:

1. Canonical doc corrections for the approved mismatch inventory.
2. Historical relocation for content that fails the deterministic removal constraints.
3. `Validate-Docs.ps1` rule expansion for approved stale-runtime patterns.
4. A validation pass confirming no new canonical drift remains in the covered docs.
5. A documented handoff into Phase F for migration closure work.

---

## Acceptance Criteria

Phase E planning is complete when all of the following are true:

1. Every mismatch in the priority canonical docs is classified as remove, rewrite, relocate, or preserve.
2. Every proposed validator rule is tied to an observed stale pattern and bounded to avoid obvious false positives.
3. The plan distinguishes documentation cleanup from migration execution.
4. The plan includes Phase F prework findings and handoff requirements.
5. The eventual implementation gates are clear and testable.

Phase E implementation will be complete only when:

1. The covered canonical docs reflect the live runtime.
2. Approved stale-runtime terms are blocked by the validator.
3. Historical material is no longer represented as canonical truth.
4. Docs validation passes with the new rules in place.

---

## Validation Gates for the Future Implementation Phase

1. `pwsh ./scripts/Validate-Docs.ps1`
2. Targeted review of the edited canonical docs against current runtime anchors.
3. If validator rules are expanded, regression check that legitimate historical docs are not incorrectly blocked.
4. Update `docs/DOCS_INDEX.md` for any new planning or historical documents created during the work.

---

## Start Condition

Implementation work for Phase E begins only after:

1. This plan is present in-repo.
2. This plan is indexed in `docs/DOCS_INDEX.md`.
3. The mismatch inventory and validator-rule inventory are accepted as the working truth.
4. The team agrees that Phase E includes Phase F prework, but not Phase F execution.