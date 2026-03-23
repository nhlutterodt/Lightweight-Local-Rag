---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md
last_reviewed: 2026-03-22
audience: engineering
---
# Concentrated Execution Plan: Phase B, Phase E, and Phase F

## Purpose

This plan translates the incomplete-phase analysis into an execution-ready closure track for:

1. Phase B: Extractor and Chunker Provenance
2. Phase E: Documentation and Validator Hardening
3. Phase F: Release and Migration

It is dependency-ordered and gate-driven. Work may run in parallel only where explicitly marked safe.

## Inputs and Governing Artifacts

1. `docs/active-drafts/RAG_Grounding_Provenance_Hardening_Plan.md`
2. `docs/active-drafts/RAG_Incomplete_Phase_Dependency_Analysis.md`
3. `docs/active-drafts/RAG_PhaseE_Documentation_And_Validator_Execution_Plan.md`
4. `docs/active-drafts/RAG_PhaseF_Migration_Closure_Evidence_Package.md`

## Non-Negotiable Dependency Order

1. Phase B evidence closure establishes the maximum truthful locator contract.
2. Phase E canonical + validator closure codifies and enforces that truth.
3. Phase F migration closure retires legacy compatibility only after B and E are stable.

Execution constraint:

1. Do not retire runtime fallbacks in Phase F before Phase E validator and canonical text are finalized against post-B reality.

## Concentrated Work Breakdown

## Track B: Phase B Completion (Locator Fidelity Closure)

### B1. Extractor Capability Matrix Finalization

Objective:

1. Complete extractor-by-extractor capability matrix with explicit support states for `lineStart`, `lineEnd`, `charStart`, `charEnd`, `sectionPath`, `symbolName`, `pageStart`, `pageEnd`.

In scope:

1. `gui/server/lib/smartChunker.js`
2. `gui/server/lib/documentParser.js`
3. `gui/server/IngestionQueue.js`
4. `docs/active-drafts/RAG_Locator_Support_Analysis.md`

Deliverables:

1. Updated matrix with one row per extractor and one column per locator field.
2. Explicit `supported`, `unsupported`, or `deferred` state for each field.
3. For each `unsupported` or `deferred` state, include deterministic reason and test expectation.

Proof required:

1. Matrix links each statement to code and/or test anchors.

### B2. Runtime Schema Alignment for Supported Fields

Objective:

1. Persist all currently supportable locator fields end-to-end without inventing unsupported fidelity.

In scope:

1. Chunk metadata emission
2. Ingestion persistence fields
3. Retrieval/citation projection fields

Deliverables:

1. Runtime writes supported fields when present.
2. Runtime emits explicit `locatorType = none` for unsupported fidelity paths.
3. No synthetic line/page claims are introduced.

Proof required:

1. Unit/integration tests proving supported fields survive ingest->retrieve->SSE.
2. Negative tests proving unsupported fields are not emitted.

### B3. Locator Regression Fixture Expansion

Objective:

1. Raise B from partially complete to complete with deterministic coverage.

In scope:

1. `gui/server/tests/pdfLocatorEvidence.test.js`
2. New/updated fixtures for markdown, PowerShell, XML, and plain text.

Deliverables:

1. Fixture corpus with expected locator outputs.
2. Tests that fail on over-claiming provenance.

Proof required:

1. Green test run across new locator suite.
2. Evidence summary added to phase status docs.

### B Exit Gate (Must Pass)

1. Every emitted chunk has either valid supported locator fields or explicit `locatorType = none` with justified extractor limitation.
2. No SSE citation emits unsupported locator fields.
3. Locator fixture suite passes in CI.

## Track E: Phase E Completion (Canonical + Validator Closure)

### E1. Canonical Drift Burn-Down (Code-Backed)

Objective:

1. Complete canonical docs realignment to current runtime ownership and contracts.

In scope:

1. `docs/Architecture_Design.md`
2. `docs/Technical_Component_Design.md`
3. `docs/DEVELOPER_ONBOARDING.md`
4. `docs/RAG_Copilot_Instructions.md`
5. Related reference-contract docs where impacted

Deliverables:

1. Drift inventory closed with per-file disposition: remove, rewrite, relocate-to-historical, retain-with-context.
2. Runtime ownership, SSE contract, and telemetry path language synchronized to live behavior.

Proof required:

1. File-level change log with anchor references to live code/tests.

### E2. Validator Hardening Expansion

Objective:

1. Increase stale-runtime rejection coverage without introducing high false-positive rates.

In scope:

1. `scripts/Validate-Docs.ps1`
2. Focused stale-runtime term rules and narrow phrase blockers

Deliverables:

1. Additional deterministic rules for known stale claims not yet blocked.
2. Validation behavior documented with examples of pass/fail cases.

Proof required:

1. Validator test evidence (script run outputs and targeted sample assertions).
2. Demonstration that canonical docs pass and known stale examples fail.

### E3. Documentation Governance Closure

Objective:

1. Ensure no governance drift remains after realignment.

In scope:

1. `docs/DOCS_INDEX.md`
2. Frontmatter compliance and state transitions

Deliverables:

1. All updated docs indexed and frontmatter-valid.
2. Historical relocations correctly classified.

Proof required:

1. `./scripts/Validate-Docs.ps1` pass output.

### E Exit Gate (Must Pass)

1. No canonical/reference-contract doc contains obsolete runtime ownership/storage claims.
2. Validator rejects known stale-runtime reintroduction set.
3. Documentation index and frontmatter checks pass.

## Track F: Phase F Completion (Migration Closure + Fallback Retirement Readiness)

### F1. Collection/Manifest Migration Inventory Freeze

Objective:

1. Produce a deterministic snapshot of all active collections and manifest schema posture.

In scope:

1. Live collection inventory
2. Manifest version distribution
3. Presence/absence of required identity fields

Deliverables:

1. Manifest inventory report with counts and exceptions.
2. Collection-by-collection closure status.

Proof required:

1. Reproducible inventory commands and captured outputs.

### F2. Re-Ingest and Integrity Closure

Objective:

1. Eliminate active dependence on legacy identity fallbacks.

In scope:

1. Re-ingest collections still requiring fallback paths.
2. Integrity verification by `SourceId` and chunk identity fields.

Deliverables:

1. Re-ingest completion log per collection.
2. Integrity check report confirming no basename-only operational paths remain.

Proof required:

1. Integrity scan outputs and retrieval sample checks.
2. No normal-path retrieval warning for missing `SourceId`.

### F3. Fallback Retirement Readiness Assessment

Objective:

1. Prove it is safe to retire legacy fallback branches.

In scope:

1. `deriveSourceId` fallback branch usage
2. `deriveChunkId` fallback branch usage
3. Legacy manifest migration branches
4. Legacy query-log opt-in surface

Deliverables:

1. Readiness decision table: keep, retire now, or retire later.
2. Explicit rollback strategy if retirement is executed.

Proof required:

1. Runtime telemetry/search evidence showing fallback branch hit rate is zero (or explained exceptions).

### F4. Migration Note and Closure Declaration

Objective:

1. Close Phase F with an auditable migration note and gate evidence.

In scope:

1. New migration note under docs active drafts or canonical target approved by governance.

Deliverables:

1. Migration note documenting schema transitions, compatibility decisions, and final status.
2. Updated phase status markers in governing plan docs.

Proof required:

1. Signed gate checklist with evidence links.

### F Exit Gate (Must Pass)

1. No active collection remains on basename-only operational identity.
2. Legacy fallback reliance is either eliminated or explicitly scoped with approved exception policy.
3. Migration note exists and is indexed.

## Inter-Phase Coordination Plan

## Safe Parallelism

1. B1 and E1 can run in parallel after capability/evidence anchors are agreed.
2. E2 can start in parallel with B2 once supported locator claims are frozen.

## Serialization Required

1. B2 -> E1/E2 final wording and rule enforcement.
2. E exit gate -> F3/F4 final closure declaration.

## Weekly Closure Cadence (Concentrated)

1. Week 1: B1, E1 inventory closure, F1 inventory freeze.
2. Week 2: B2 + B3 implementation/tests, E2 validator expansion.
3. Week 3: E3 governance closeout, F2 re-ingest/integrity closure.
4. Week 4: F3 fallback readiness decision, F4 migration note and final gates.

## Execution Dashboard Template

For each work package, track:

1. Owner
2. Start date
3. Target date
4. Dependency blockers
5. Evidence artifacts produced
6. Gate status (`not-started`, `in-progress`, `passed`, `blocked`)

## Final Program Closure Checklist (B/E/F)

1. Phase B status updated to complete with locator fidelity evidence package.
2. Phase E status updated to complete with validator and canonical doc pass evidence.
3. Phase F status updated to complete with migration note and fallback readiness decision.
4. Regression barriers remain green: server tests, SSE/API contracts, docs validation, eval schema assertions.
5. Governing docs updated consistently: grounding hardening plan, Phase E plan, Phase F evidence package, docs index.
