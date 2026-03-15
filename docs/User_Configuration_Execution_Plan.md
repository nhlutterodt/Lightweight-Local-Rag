---
doc_state: canonical
doc_owner: architecture
canonical_ref: docs/User_Configuration_Execution_Plan.md
last_reviewed: 2026-03-15
audience: engineering
---
# User Configuration Execution Plan

## Purpose

This document converts the analysis in `docs/User_Configuration_Architecture_Analysis.md` into a phased execution plan for implementing user-accessible configuration through both API and UI.

The plan is intentionally guarded.

Each phase must declare:

- scope
- allowed changes
- explicit non-goals
- observability added
- tests required
- rollback condition
- promotion gate

The goal is to make the rollout practical, observable, testable, and reversible at every step.

## Companion Document

This plan depends on the reasoning captured in:

- `docs/User_Configuration_Architecture_Analysis.md`

That analysis establishes the core distinction that drives this plan:

- chat model selection is a safe runtime preference
- embedding model selection is a collection-level contract and must not be treated as a simple toggle

## Current Ground Truth In The Repo

The execution plan is anchored to the following current implementation seams.

## Current Configuration Sources

- `config/project-config.psd1`
- `gui/server/lib/configLoader.js`
- environment variables consumed by `configLoader.js` and `server.js`
- request-level overrides in `POST /api/chat`
- browser `localStorage` in `gui/client/react-client/src/components/Sidebar.jsx`

## Current Backend Surfaces

- `gui/server/server.js`
- `GET /api/models`
- `GET /api/health`
- `GET /api/index/metrics`
- `POST /api/chat`
- queue and browse endpoints

## Current Frontend Surfaces

- `gui/client/react-client/src/App.jsx`
- `gui/client/react-client/src/hooks/useRagApi.js`
- `gui/client/react-client/src/components/Sidebar.jsx`

## Current Test And Validation Seams

### Server

- `gui/server/tests/configLoader.test.js`
- `gui/server/tests/api.routes.test.js`
- `gui/server/tests/models.test.js`
- `gui/server/tests/retrieval.behavior.test.js`
- `gui/server/tests/sse.contract.test.js`

### Client

- `gui/client/react-client/src/hooks/__tests__/useRagApi.test.jsx`
- `gui/client/react-client/src/components/__tests__/Sidebar.test.jsx`

### Contracts And Docs

- `docs/API_REFERENCE.md`
- `docs/SSE_CONTRACT.md`
- `scripts/Validate-Docs.ps1`

## Execution Rules

The following rules apply across all phases.

1. No phase may introduce writable settings before the effective settings are observable through API.
2. No phase may expose embedding-model mutation as a simple runtime setting.
3. No phase may create a second hidden settings system in the UI.
4. Every newly exposed setting must declare its scope and mutability.
5. Every phase must preserve the `/api/chat` SSE contract unless that contract is deliberately updated with tests and documentation in the same change.
6. Every phase must have a rollback path that returns the app to known-good behavior without requiring manual repair of indexed collections.

## Delivery Strategy Overview

The rollout should proceed through six phases.

1. Phase 0: Baseline Alignment And Safety Rails
2. Phase 1: Read-Only Effective Settings API
3. Phase 2: UI Adoption Of Server-Backed Settings
4. Phase 3: Safe Runtime Settings Mutation
5. Phase 4: Collection Metadata And Compatibility Exposure
6. Phase 5: Workflow-Driven Advanced Configuration

Each phase is intentionally narrow.

## Phase 0: Baseline Alignment And Safety Rails

## Scope

Create a clean starting point by removing obvious state drift, naming the effective settings model, and establishing a thin shared settings vocabulary without introducing writable settings.

## Primary Files

- `gui/server/server.js`
- `gui/server/lib/configLoader.js`
- `gui/server/lib/healthCheck.js`
- `gui/client/react-client/src/App.jsx`
- `gui/client/react-client/src/components/Sidebar.jsx`
- `docs/API_REFERENCE.md`

## Allowed Changes

- add internal helper functions for resolving effective settings
- fix config namespace drift in `healthCheck.js`
- remove hardcoded collection mismatch between chat and sidebar state
- standardize naming for settings fields that already exist
- add temporary internal-only response metadata if needed for verification
- update docs for existing behavior if changed

## Explicit Non-Goals

- no new writable settings API
- no persistent settings store
- no embedding model controls in UI
- no collection migration workflow
- no admin or auth model

## Concrete Repo Work

1. Introduce a single internal concept of "effective settings" in the server layer.
2. Repair `healthCheck.js` so it reads the active config schema rather than the stale `AI_Models.Ollama_Endpoint` path.
3. Remove the chat collection hardcode in `App.jsx` so the active collection used for chat is not disconnected from the value shown in the UI.
4. Identify which current browser-local values are merely UI convenience versus candidates for future server-backed configuration.

## Observability Added

- startup log of the resolved effective config source layers
- request-time debug logging for selected chat collection and model
- explicit detection and logging when a UI-supplied collection differs from a server default

These logs can remain low-volume and should not expose prompt content beyond existing logging behavior.

## Tests Required

### Update Existing Server Tests

- extend `gui/server/tests/api.routes.test.js` if endpoint behavior changes indirectly
- extend `gui/server/tests/configLoader.test.js` if config resolution logic changes

### Update Existing Client Tests

- update `gui/client/react-client/src/components/__tests__/Sidebar.test.jsx` if collection ownership changes
- add or update tests around `App.jsx` collection flow if chat collection becomes shared state

## Validation Commands

- `cd gui/server && npm test`
- `cd gui/client/react-client && npm test`

## Rollback Condition

Rollback Phase 0 if any of the following occur:

- chat requests stop targeting the expected collection
- health endpoint regressions appear
- UI can no longer reproduce current chat behavior with default settings

## Promotion Gate

Phase 0 is complete only when:

- there is no remaining hardcoded chat collection drift
- `healthCheck.js` uses the active config schema
- test suites remain green in server and client packages
- API and docs still describe current behavior accurately

## Phase 1: Read-Only Effective Settings API

## Scope

Expose a read-only settings contract so the UI and future clients can understand the current effective configuration, where values come from, and which settings are safe candidates for later editing.

## Primary Files

- `gui/server/server.js`
- `gui/server/lib/configLoader.js`
- new server helper module if needed, such as `gui/server/lib/settingsResolver.js`
- `docs/API_REFERENCE.md`
- new or updated server tests

## Allowed Changes

- add `GET /api/settings`
- optionally add `GET /api/settings/schema` if needed
- include effective values, source metadata, and editability metadata
- include active defaults for chat model, collection, retrieval mode, and token-related settings
- include machine-state-derived metadata where safe, such as installed chat models from the existing `/api/models` data

## Explicit Non-Goals

- no write endpoint yet
- no UI persistence changes yet
- no collection metadata write path
- no embedding model mutation

## Proposed Response Shape

The response does not need to be final, but it should include at least:

- effective settings values
- source of each value
- scope of each value
- mutability classification
- compatibility notes where already known

At minimum, the first version should cover:

- active collection
- default chat model
- retrieval mode
- `TopK`
- `MinScore`
- `MaxContextTokens`

## Observability Added

- structured log when `/api/settings` is requested
- structured log of resolved source layers for each exposed setting
- explicit marker when environment variables override project config

This observability matters because a user must be able to understand why a visible value may not be editable or may not match the file default.

## Tests Required

### New Or Expanded Server Tests

- add endpoint coverage for `GET /api/settings` in `gui/server/tests/api.routes.test.js` or a dedicated settings test file
- extend `gui/server/tests/configLoader.test.js` for source precedence assertions
- extend `gui/server/tests/models.test.js` only if `/api/settings` reuses model readiness logic

### Contract Documentation

- update `docs/API_REFERENCE.md` to document the new endpoint

## Validation Commands

- `cd gui/server && npm test`
- `pwsh ./scripts/Validate-Docs.ps1`

## Rollback Condition

Rollback Phase 1 if:

- the new endpoint exposes misleading values
- settings source precedence cannot be explained deterministically
- the UI would need to interpret ambiguous server metadata

## Promotion Gate

Phase 1 is complete only when:

- `GET /api/settings` exists and is documented
- every exposed field has declared source and mutability metadata
- env-driven overrides are visibly represented in the response
- server tests pass

## Phase 2: UI Adoption Of Server-Backed Settings

## Scope

Move the UI from local approximation toward server-backed settings consumption while preserving current user workflows.

## Primary Files

- `gui/client/react-client/src/hooks/useRagApi.js`
- `gui/client/react-client/src/App.jsx`
- `gui/client/react-client/src/components/Sidebar.jsx`
- `gui/client/react-client/src/hooks/__tests__/useRagApi.test.jsx`
- `gui/client/react-client/src/components/__tests__/Sidebar.test.jsx`

## Allowed Changes

- fetch and hold settings from `GET /api/settings`
- replace hardcoded chat defaults with server-provided values
- align active collection and active model usage with the shared settings state
- keep localStorage only for values that are explicitly browser-local and not yet server-owned
- visually distinguish default value versus current effective value where practical

## Explicit Non-Goals

- no writable settings persistence yet
- no advanced settings panel
- no embedding model UI controls
- no hidden client-only fallback that silently overrides server truth

## Concrete Repo Work

1. Extend `useRagApi.js` to fetch effective settings alongside models and metrics.
2. Make `App.jsx` derive chat model and active collection from that shared API-backed state.
3. Update `Sidebar.jsx` so it reflects server-backed current values rather than inventing parallel ownership for them.
4. Keep recent ingest paths and similar purely local conveniences in localStorage only if they are clearly labeled as local convenience and not application configuration.

## Observability Added

- client-visible loading and stale-state indicators for settings fetch
- explicit UI status when a setting is inherited from project config versus changed in-session
- client console warnings only for genuine settings sync failures

## Tests Required

### Client Tests

- extend `gui/client/react-client/src/hooks/__tests__/useRagApi.test.jsx` to cover settings fetch and consumption
- extend `gui/client/react-client/src/components/__tests__/Sidebar.test.jsx` for server-backed collection and model rendering
- add tests for fallback behavior when `/api/settings` is unavailable

### Server Tests

- ensure the existing `/api/settings` endpoint remains stable

## Validation Commands

- `cd gui/client/react-client && npm test`
- `cd gui/server && npm test`

## Rollback Condition

Rollback Phase 2 if:

- the UI becomes dependent on settings fetch in a way that blocks chat when defaults should still allow operation
- model or collection selection becomes inconsistent between what is displayed and what is sent to the backend

## Promotion Gate

Phase 2 is complete only when:

- the UI consumes server-backed settings for chat-critical values
- chat requests use the same collection and model values shown in the UI
- browser-local convenience state is clearly separated from application settings
- client and server tests pass

## Phase 3: Safe Runtime Settings Mutation

## Scope

Add the first writable settings path, but only for settings that are safe to modify at runtime without invalidating indexed data.

## Primary Files

- `gui/server/server.js`
- new settings persistence helper if needed
- `gui/client/react-client/src/hooks/useRagApi.js`
- `gui/client/react-client/src/App.jsx`
- `gui/client/react-client/src/components/Sidebar.jsx`
- `docs/API_REFERENCE.md`
- relevant tests

## Allowed Changes

- add `PATCH /api/settings` for safe runtime settings
- allow updating:
  - preferred chat model
  - active collection
  - retrieval mode
  - bounded `TopK`
  - bounded `MinScore`
  - bounded `MaxContextTokens`
- define validation rules and rejection behavior
- persist these settings in a clearly defined location if persistence is part of this phase

## Explicit Non-Goals

- no embedding model mutation
- no chunking or ingestion-shaping mutation
- no filesystem security setting mutation
- no operator-only environment setting mutation

## Persistence Decision Required

Before or during this phase, the team must choose where mutable safe settings live.

Candidate options:

- a small JSON settings file at project scope
- a separate user-preferences file
- in-memory only for initial rollout

This plan does not require the persistence location to be decided earlier than this phase, but it must be explicit before writable settings ship.

## Observability Added

- audit log on settings change attempts
- audit log on rejected settings changes with validation reason
- response metadata showing whether the new value is effective immediately

These changes should be observable without needing to inspect browser internals.

## Tests Required

### New Or Expanded Server Tests

- request validation tests for `PATCH /api/settings`
- source-precedence tests when mutable settings interact with env overrides
- regression tests proving `POST /api/chat` still honors explicitly supplied request overrides

### Existing Contract And Behavior Tests

- run `gui/server/tests/sse.contract.test.js`
- run `gui/server/tests/retrieval.behavior.test.js`

### Client Tests

- mutation flow tests in `useRagApi.test.jsx`
- sidebar or settings-panel tests for successful save, rejected save, and inherited values

## Validation Commands

- `cd gui/server && npm test`
- `cd gui/client/react-client && npm test`

## Rollback Condition

Rollback Phase 3 if:

- settings writes create ambiguous precedence behavior
- users can save values that the backend later ignores silently
- chat behavior regresses under unchanged defaults

## Promotion Gate

Phase 3 is complete only when:

- writable settings are limited to safe runtime fields
- validation rules are enforced server-side
- change audit logs exist
- SSE contract and retrieval behavior tests remain green

## Phase 4: Collection Metadata And Compatibility Exposure

## Scope

Expose collection-level metadata so the app can explain compatibility instead of pretending all installed models are interchangeable.

## Primary Files

- `gui/server/IngestionQueue.js`
- `gui/server/lib/vectorStore.js`
- `gui/server/server.js`
- existing collection or metrics endpoints, or a new `GET /api/collections`
- `docs/API_REFERENCE.md`
- relevant tests

## Allowed Changes

- expose collection metadata through API
- include:
  - collection name
  - embedding model used by that collection
  - vector dimensions if available
  - collection readiness
  - compatibility notes for active runtime settings
- add warnings when current runtime selections are incompatible with collection contracts

## Explicit Non-Goals

- no collection migration
- no automatic reindex
- no embedding model write API
- no silent compatibility fallback

## Concrete Repo Work

1. Surface collection metadata already implicit in stored LanceDB records and ingestion manifest behavior.
2. Teach the server to report compatibility between a collection and any proposed advanced settings.
3. Reuse existing `/api/models` classification logic where useful, but do not overload it with collection responsibilities.

## Observability Added

- compatibility warnings in API responses
- warning log when a requested setting conflicts with collection metadata
- metrics or counters for rejected incompatible operations if introduced

## Tests Required

### Server Tests

- add collection metadata endpoint tests
- add compatibility response tests
- add regression tests around model mismatch handling in `vectorStore.js`

### Existing Tests To Re-Run

- `gui/server/tests/models.test.js`
- `gui/server/tests/retrieval.behavior.test.js`

## Validation Commands

- `cd gui/server && npm test`

## Rollback Condition

Rollback Phase 4 if:

- compatibility metadata is incomplete or misleading
- the UI cannot distinguish safe chat-model changes from incompatible embedding-model changes

## Promotion Gate

Phase 4 is complete only when:

- the app can explain collection embedding contracts through API
- compatibility warnings are present and accurate
- no embedding-model mutation is exposed as a regular setting

## Phase 5: Workflow-Driven Advanced Configuration

## Scope

Add guided workflows for advanced configuration that affects indexed data, with embedding-model changes as the primary example.

## Primary Files

- `gui/server/IngestionQueue.js`
- `gui/server/server.js`
- `gui/client/react-client/src/App.jsx`
- `gui/client/react-client/src/components/Sidebar.jsx` or a dedicated advanced settings component
- `docs/API_REFERENCE.md`
- ingestion and compatibility tests

## Allowed Changes

- add guided actions such as:
  - create new collection with selected embedding model
  - reindex collection with a selected embedding model
  - duplicate collection under a new contract
- add server-side validation and explicit warnings
- require user confirmation for destructive or expensive operations

## Explicit Non-Goals

- no hidden auto-migration of collections
- no global flip of embedding model across all collections
- no partial reindex that leaves collection contract ambiguous

## Observability Added

- workflow event logging
- queue visibility for reindex operations
- explicit status reporting for advanced configuration jobs
- surfaced compatibility outcome before execution begins

## Tests Required

### Server Tests

- ingestion queue tests for advanced workflow enqueueing if endpoints are added
- compatibility and validation tests for advanced workflow entry points

### Client Tests

- UI confirmation and warning-state tests
- workflow progress-state tests if advanced settings reuse queue UX

### Existing Regression Coverage

- re-run server tests
- re-run client tests
- re-run any retrieval evaluation scripts affected by index-shaping changes

## Validation Commands

- `cd gui/server && npm test`
- `cd gui/client/react-client && npm test`
- `cd gui/server && npm run eval:retrieval:modes`
- `cd gui/server && npm run eval:golden:baseline`

## Rollback Condition

Rollback Phase 5 if:

- advanced workflow actions can leave collections in ambiguous compatibility state
- reindex workflows are not observable through queue or status surfaces
- retrieval quality regresses materially on the golden or retrieval-mode evaluations

## Promotion Gate

Phase 5 is complete only when:

- advanced configuration is workflow-driven rather than toggle-driven
- embedding-model changes are guarded by compatibility checks
- retrieval evaluation and tests remain acceptable

## Cross-Phase Observability Requirements

The following signals should exist by the end of the rollout.

- effective settings response from API
- source metadata for visible settings
- audit logs for settings changes and rejected changes
- compatibility warnings for collection-bound constraints
- user-visible distinction between inherited defaults and active overrides
- queue visibility for long-running advanced configuration tasks

## Cross-Phase Validation Matrix

Each phase should preserve the following core behaviors.

## Config Integrity

- `gui/server/tests/configLoader.test.js`

## Route Stability

- `gui/server/tests/api.routes.test.js`

## Model Classification

- `gui/server/tests/models.test.js`

## Retrieval Behavior

- `gui/server/tests/retrieval.behavior.test.js`

## SSE Contract

- `gui/server/tests/sse.contract.test.js`
- `docs/SSE_CONTRACT.md`

## Client State And Streaming

- `gui/client/react-client/src/hooks/__tests__/useRagApi.test.jsx`

## Sidebar Behavior

- `gui/client/react-client/src/components/__tests__/Sidebar.test.jsx`

## Docs Integrity

- `pwsh ./scripts/Validate-Docs.ps1`

## Suggested Branching And Merge Discipline

To reduce risk, each phase should be implemented in a separate branch and merged only after its promotion gate is satisfied.

Recommended pattern:

1. one branch per phase
2. one primary API contract change per phase
3. docs updated in the same phase as the code change
4. no bundling of Phase 4 or Phase 5 work into earlier safe-runtime phases

## Practical Stop Points

The most useful stop points are:

- after Phase 1 if the team wants only visibility and no mutation yet
- after Phase 3 if the team wants safe runtime configuration but not advanced collection workflows
- after Phase 4 if the team wants compatibility clarity before any advanced reindex workflow

These are all valid product outcomes.

## Final Recommendation

The most important discipline in this rollout is to avoid collapsing all configuration into a single settings concept.

This plan works only if the implementation keeps four categories separate:

- project defaults
- user or session preferences
- request overrides
- collection contracts

If that separation is preserved, the app can safely become much more configurable.

If that separation is blurred, configuration will feel flexible while making the system harder to reason about, test, and trust.
