---
doc_state: canonical
doc_owner: maintainers
canonical_ref: docs/Efficiency_Pass_Plan.md
last_reviewed: 2026-03-15
audience: engineering
---
# Efficiency Pass Plan

## Purpose
This document defines the next efficiency-focused implementation pass after security and correctness hardening. The goal is to reduce update noise, write amplification, and UI rerender overhead without changing established security controls or error contracts.

## Scope Guardrails
1. Do not weaken path validation, symlink or junction policy, CORS, or localhost binding.
2. Do not change browse and queue security error codes.
3. Keep shutdown flush guarantees for queue persistence.
4. Treat behavior regressions as blockers even if performance improves.

## Priority Order
1. SSE emission efficiency and deduplication.
2. Queue persistence coalescing metrics and tuning.
3. Client queue render efficiency.
4. Contract and operations documentation alignment.

## Verified Tooling and Failure Playbook

### Tool Selection Rules
1. Use `read_file` to inspect exact implementation before changing logic.
2. Use `grep_search` to locate symbols, contracts, and test references quickly.
3. Use `apply_patch` for all targeted source edits and doc updates.
4. Use `run_in_terminal` for execution-based validation (`npm test`, `npm run build`, `pwsh ./scripts/Validate-Docs.ps1`).
5. Use `multi_tool_use.parallel` only for read-only context gathering that can run safely in parallel.
6. Use `get_changed_files` before handoff to confirm changed scope matches milestone intent.

### Verified Tools for This Plan
1. `apply_patch`: verified for queue, server, client, and docs edits.
2. `run_in_terminal`: verified for backend tests, client tests, client build, and docs validation.
3. `read_file`: verified for code and document contract verification.
4. `grep_search`: verified for endpoint, symbol, and policy discovery.

### Failure Handling by Tool
1. `apply_patch` failure:
	- Re-read the target file and reduce patch scope.
	- Reapply as smaller hunks with tighter context.
	- If repeated mismatch occurs, patch one function or block at a time.
2. `run_in_terminal` failure:
	- Confirm working directory with explicit `Set-Location`.
	- Re-run command with narrowed test target to isolate fault.
	- If output is truncated, open emitted log path using `read_file` and continue diagnosis.
3. `read_file` insufficient context:
	- Re-run with a wider line range and include adjacent helper functions.
4. `grep_search` misses expected hits:
	- Widen include pattern and switch to regex alternation.
	- Verify filename path assumptions using `list_dir` or `file_search`.
5. Docs validation fails:
	- Fix frontmatter and index entries first.
	- Re-run `pwsh ./scripts/Validate-Docs.ps1` until clean.

## Milestone E1: SSE Emission Debounce and Dedup
### Objective
Reduce high-frequency queue stream updates while preserving eventual and final state delivery.

### Tools
1. `read_file` for queue emit pathways and SSE stream handlers.
2. `apply_patch` for queue emission debounce and dedup implementation.
3. `run_in_terminal` for backend regression and SSE behavior tests.

### Tool Failure Contingency
1. If `apply_patch` fails due to drift, split change into emission scheduler first, then dedup.
2. If `run_in_terminal` test run fails broadly, execute milestone-specific tests only, then expand.

### Implementation
1. Decouple update emission from every state-save call.
2. Add short trailing debounce for queue update events.
3. Add payload signature deduplication to avoid re-emitting unchanged snapshots.
4. Preserve immediate emission for critical terminal transitions if needed.

### Testing
1. Burst enqueue scenario verifies event count is bounded.
2. Final queue state is always emitted.
3. SSE consumer still receives initial snapshot immediately.

### Validation Gate
1. Queue stream remains functionally correct.
2. Emission count under burst is reduced versus baseline.
3. No stale queue state in client UI.

## Milestone E2: Persistence Coalescing Metrics and Tunables
### Objective
Measure write coalescing quality and provide deterministic tuning knobs.

### Tools
1. `read_file` for persistence loop and flush lifecycle.
2. `apply_patch` for counters, tunables, and debug exposure.
3. `run_in_terminal` for burst and persistence integrity tests.

### Tool Failure Contingency
1. If terminal output truncates, read the generated output artifact with `read_file`.
2. If flaky timing appears, narrow tests and add deterministic waits before broad rerun.

### Implementation
1. Add counters for save requests, persisted writes, and coalesced saves.
2. Add optional debug exposure via logs or guarded endpoint.
3. Validate and tune debounce defaults for persistence and stream emissions.

### Testing
1. Synthetic burst tests assert write count stays bounded.
2. In-flight write plus trailing update test remains deterministic.
3. Shutdown flush path persists final state reliably.

### Validation Gate
1. Coalescing ratio is measurable and improved.
2. No persistence data loss in stress scenarios.
3. Existing queue durability tests remain green.

## Milestone E3: Client Queue Render Efficiency
### Objective
Reduce unnecessary rerenders and state churn in queue consumers.

### Tools
1. `read_file` for queue state consumers and derived render paths.
2. `apply_patch` for equality guards, memoization, and render-path cleanup.
3. `run_in_terminal` for `npm test` and `npm run build` in the client package.

### Tool Failure Contingency
1. If tests fail from selector instability, refine component tests to role or regex-based queries.
2. If build fails after optimization changes, revert only the latest render-path hunk and re-test incrementally.

### Implementation
1. Prevent state updates when incoming SSE payload equals current queue snapshot.
2. Memoize queue-derived projections used by sidebar and analytics panel.
3. Avoid high-frequency inline object recreation in queue display pathways.

### Testing
1. Component tests verify unchanged payloads do not trigger queue state updates.
2. Existing modal keyboard and sidebar persistence tests remain green.
3. Manual burst run confirms responsive UI with stable status updates.

### Validation Gate
1. Rerender count under burst is reduced.
2. UI behavior is unchanged from user perspective.
3. Client build remains successful.

## Milestone E4: Documentation and Drift Prevention
### Objective
Keep runtime behavior and docs synchronized after efficiency tuning.

### Tools
1. `apply_patch` for doc updates and contract synchronization.
2. `run_in_terminal` for docs validation script.
3. `get_changed_files` for final scope verification before handoff.

### Tool Failure Contingency
1. If docs validator fails, prioritize frontmatter and index corrections before narrative edits.
2. If index mismatch persists, run a full docs file discovery pass with `grep_search` and reconcile entries.

### Implementation
1. Update API notes for debounced event behavior while preserving contract semantics.
2. Document new environment knobs and recommended defaults.
3. Reconfirm security and onboarding docs still reflect enforced guarantees.

### Testing
1. Run documentation validation script.
2. Verify docs index includes this plan and all updated files.

### Validation Gate
1. No contract drift between docs and implementation.
2. Documentation validation passes with zero blockers.

## Execution Checklist
1. Implement one milestone per pull request.
2. Run milestone-specific tests plus full regression after each merge-ready patch.
3. Record measured before and after metrics for event count, write count, and client rerenders.
4. Do not proceed to next milestone until current validation gate passes.

## Done Criteria
1. Queue update emissions are bounded under burst conditions.
2. Persistence writes are coalesced with no correctness regression.
3. Client queue rendering performs better without user-visible behavior drift.
4. Documentation and index remain synchronized with implementation.

## Measured Metrics Snapshot
Baseline and optimized values below are captured by automated tests using a 100-update synthetic burst.

1. Server stream messages (100 queue save requests):
- Baseline: 100
- Optimized: 1
- Source: `gui/server/tests/IngestionQueue.test.js` (`captures before/after metrics for 100 queue updates`)
2. Queue persistence writes (100 queue save requests):
- Baseline: 100
- Optimized: 2
- Source: `gui/server/tests/IngestionQueue.test.js` (`captures before/after metrics for 100 queue updates`)
3. Client queue state updates/rerenders (100 identical SSE payloads):
- Baseline: 100
- Optimized: 1
- Source: `gui/client/react-client/src/hooks/__tests__/useRagApi.test.jsx` (`captures before/after render metrics for 100 identical queue messages`)