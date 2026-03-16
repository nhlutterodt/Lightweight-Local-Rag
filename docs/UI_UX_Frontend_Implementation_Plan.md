---
doc_state: canonical
doc_owner: maintainers
canonical_ref: docs/UI_UX_Frontend_Implementation_Plan.md
last_reviewed: 2026-03-16
audience: engineering
---

# UI/UX Frontend Implementation Plan

> **Scope**: `gui/client/react-client/`
> **Purpose**: Convert the UI/UX analysis roadmap into a concrete implementation sequence with deliverables, dependencies, acceptance criteria, and verification gates.

---

## 1. Objectives

This plan applies the roadmap items from the UI/UX analysis to the frontend workstream. The immediate objectives are:

- remove blocking security and accessibility defects before new feature work continues
- normalize async chat behavior so failure, interruption, and cancellation are first-class UI states
- make keyboard and screen-reader usage reliable across the core ingestion and chat journeys
- establish operational UX for queue and index health states
- add verification gates so the fixes remain enforced

### 1.1 Phase C Progress Snapshot (2026-03-15)

Context was re-validated against the current frontend implementation before beginning Phase C.

Completed (A/B baseline now in place):

- sanitization, modal accessibility, chat/status live regions, and collection wiring fixes
- explicit stream error/cancellation UI states and cancellation path
- error boundaries, skip link, auto-scroll, textarea auto-resize, and focus-visible hardening
- reduced-motion and forced-colors fallback styles
- analytics loading/ready/error semantics with update summaries and timestamps
- automated accessibility tests and frontend CI workflow

Phase C execution status:

- C-1 complete: sidebar split + preferences hook extraction.
- C-2 complete: layout responsiveness moved to CSS media behavior.
- C-3 complete: Markdown + sanitize response rendering pipeline implemented.
- C-4 complete: reducer-backed async state machine with guarded transitions.
- C-5 complete: streaming rerender scope reduced through state isolation and memoization.
- C-6 complete: stable IDs now used for chat and queue entities.
- C-7 complete: architecture-critical inline presentational styles moved to class-based CSS.

Current phase state:

- Phase C is complete.
- Next execution target is Phase D (design-system completion and UX context depth).

Verification baseline after C-7:

- Frontend test suite passing (`37/37`).
- Async cancellation/retry flows green in integration tests.
- Queue identity normalization verified in hook tests.
- Targeted regression suites for sidebar, app shell, and modal surfaces are green.

Phase D continuation order (recommended):

1. Maintain Phase D baseline and shift to performance hardening and observability polish.

Post-Phase-D hardening kickoff (current):

- Long-history render threshold instrumentation is now wired into chat rendering and surfaced through analytics operational actions.
- Thresholded advisory/warning events are deduplicated and bounded to avoid analytics noise.
- Operational action entries now include clickable deep links that jump to related queue entities or the chat region.
- Light-theme polish now includes refined contrast for less-common states (error banners, loading/empty variants, and high-density analytics state rows).
- Regression coverage now includes long-history threshold signaling in `ChatWindow` tests.
- Frontend test baseline is currently `47/47`.

### 1.2 Phase D Kickoff Snapshot (2026-03-15, Fresh)

This snapshot is based on direct source inspection plus a fresh frontend test run (`44/44` passing), to avoid stale planning assumptions.

| Item | Current Status | Notes |
| ---- | -------------- | ----- |
| D-1 | Complete | Inline-style migration on `App.jsx` and `FolderBrowserModal.jsx` is already in place from Phase C carry-forward work. |
| D-2 | Complete | Token file now includes spacing, typography, radius, z-index, and transition scales. |
| D-3 | Complete | `data-theme` wiring is present with dark default and light-mode token stub. |
| D-4 | Complete | Chat message timestamps are modeled and rendered with semantic `<time>` elements. |
| D-5 | Complete | Citation UI is wired in chat rendering using SSE metadata citations. |
| D-6 | Complete | Folder browser now exposes `listbox`/`option`, `aria-selected`, and active descendant semantics. |
| D-7 | Complete | Session clear now includes an undo path with a timed restore window. |
| D-8 | Complete | `index.html` now uses project favicon + browser metadata updates. |
| D-9 | Complete | Analytics now includes action-linked confirmations with timestamped recent user actions. |

Phase D execution baseline is complete; continue with post-Phase-D hardening work.

---

## 2. Delivery Principles

- Fix root causes before adding polish.
- Keep the React surface stable while moving state boundaries to the right places.
- Prefer explicit UI states over implicit string concatenation and console-only failure handling.
- Land verification gates alongside implementation, not after the fact.
- Do not begin design-system completion work until Phase A and the verification foundation are in place.

---

## 3. Phase Overview

| Phase | Goal                  | Primary Outcome                                                                                             |
| ----- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| A     | Remove blockers       | Security fix, accessibility criticals, and normalized async error contract                                  |
| B     | Stabilize UX          | Visible focus, operational status semantics, reduced motion, forced-colors support, and regression coverage |
| C     | Refactor architecture | Cleaner state ownership, better rendering boundaries, and explicit async state machine                      |
| D     | Complete system       | Design-system maturity, timestamps, citations, and operational context improvements                         |

---

## 4. Phase A: Blocking Fixes

### 4.1 Scope

Phase A covers the must-fix items that should block new frontend feature development:

- sanitize AI-rendered content in `ChatWindow.jsx`
- add modal dialog semantics, focus entry, focus trap, and focus restoration in `FolderBrowserModal.jsx`
- add chat log live-region semantics in `ChatWindow.jsx`
- pass live `collectionName` into chat requests from `App.jsx`
- add accessible labels in `InputArea.jsx`
- add proper label associations and live status semantics in `Sidebar.jsx`
- normalize chat event handling between `App.jsx` and `useRagApi.js`

### 4.2 Implementation Tasks

| ID  | Work                                                                                     | Files                                                          |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| A-1 | Replace unsanitized `dangerouslySetInnerHTML` flow with sanitized rendering              | `src/components/ChatWindow.jsx`                                |
| A-2 | Add `role="dialog"`, `aria-modal`, labeled title, initial focus, trap, and focus restore | `src/components/FolderBrowserModal.jsx`                        |
| A-3 | Add `role="log"`, `aria-live`, and `aria-relevant` to conversation history               | `src/components/ChatWindow.jsx`                                |
| A-4 | Lift collection state and remove hardcoded `"TestIngest"` from chat submission           | `src/App.jsx`, `src/components/Sidebar.jsx`                    |
| A-5 | Add textarea label and send-button `aria-label`                                          | `src/components/InputArea.jsx`, `src/css/shared/utilities.css` |
| A-6 | Add `htmlFor` wiring and status-region semantics                                         | `src/components/Sidebar.jsx`                                   |
| A-7 | Define explicit `start`, `token`, `error`, and `done` callback events                    | `src/hooks/useRagApi.js`, `src/App.jsx`                        |

### 4.3 Acceptance Criteria

- Untrusted AI content is sanitized before DOM insertion.
- The folder browser is usable with keyboard only and restores focus on close.
- Screen readers are notified when new chat content arrives.
- Chat requests always use the user-selected collection.
- Every form control in sidebar and input area has an accessible label.
- Transport failures and non-200 responses surface through a consistent UI path.

---

## 5. Phase B: UX Stabilization

### 5.1 Scope

Phase B hardens the interface after blockers are removed. It focuses on interaction clarity, accessibility breadth, and regression prevention.

Primary items:

- add `.sr-only` and `prefers-reduced-motion`
- improve color contrast in `tokens.css`
- add auto-scroll in chat
- add top-level error boundaries
- add textarea auto-resize
- add skip link
- add strong visible-focus styling across all interactive controls
- add Windows `forced-colors` fallbacks
- make analytics and queue states explicit and accessible
- add regression gates for accessibility and async behavior

### 5.2 Implementation Tasks

| ID   | Work                                                                                  | Files                                                                                     |
| ---- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| B-1  | Add `.sr-only` and reduced-motion override utilities                                  | `src/css/shared/utilities.css`                                                            |
| B-2  | Raise `--text-muted` and begin expanding token coverage                               | `src/css/shared/tokens.css`                                                               |
| B-3  | Add bottom-anchor auto-scroll behavior                                                | `src/components/ChatWindow.jsx`                                                           |
| B-4  | Add error boundary wrappers around major UI regions                                   | `src/App.jsx`                                                                             |
| B-5  | Auto-resize textarea on input                                                         | `src/components/InputArea.jsx`                                                            |
| B-6  | Add skip-navigation link                                                              | `index.html`, `src/App.jsx`, `src/css/shared/utilities.css`                               |
| B-7  | Add keyboard-visible tooltip trigger behavior                                         | `src/css/shared/utilities.css`                                                            |
| B-8  | Establish shared `:focus-visible` treatment across controls                           | `src/css/shared/utilities.css`, `src/css/modules/chat.css`, `src/css/modules/sidebar.css` |
| B-9  | Add `forced-colors` fallbacks for glass and form controls                             | `src/css/shared/tokens.css`, `src/css/shared/utilities.css`                               |
| B-10 | Distinguish analytics `loading`, `ready-empty`, `ready-populated`, and `error` states | `src/components/AnalyticsPanel.jsx`, `src/hooks/useRagApi.js`                             |
| B-11 | Add automated accessibility and async regression coverage                             | `src/test`, `src/components/__tests__`, `src/hooks/__tests__`                             |

### 5.3 Acceptance Criteria

- Every keyboard-focusable control has a clearly visible focus indicator.
- Reduced-motion users do not receive unnecessary animation.
- Windows High Contrast users can distinguish panels, controls, and focus states.
- Queue and index panels distinguish empty, loading, and error states.
- The repo has automated checks for accessibility, keyboard flows, and stream failures.

---

## 6. Phase C: Architecture Refactor

### 6.1 Scope

Phase C reorganizes the frontend so the Phase A and B fixes remain maintainable. This is where state ownership and render boundaries should be corrected.

Primary items:

- decompose `Sidebar.jsx`
- remove JS-driven layout branching where CSS should own responsiveness
- replace regex-only content formatting with structured markdown rendering
- isolate streaming state to prevent broad re-renders
- replace unstable keys
- introduce an explicit async state machine for chat

### 6.2 Implementation Tasks

1. C-1: Split sidebar into focused subcomponents and a preferences hook.
Files: `src/components/Sidebar.jsx`, new component files, new hook file.
2. C-2: Move layout responsiveness to CSS media queries.
Files: `src/App.jsx`, `src/hooks/useWindowDimensions.js`, CSS modules.
3. C-3: Replace regex-only response formatting with markdown renderer plus sanitization.
Files: `src/components/ChatWindow.jsx`.
4. C-4: Consolidate async state into a reducer-backed state machine with explicit transitions and illegal-transition guards.
Files: `src/App.jsx`, `src/hooks/useRagApi.js`, optional new state-machine module.
5. C-5: Reduce streaming re-renders through state isolation and targeted memoization.
Files: `src/App.jsx`, `src/components/ChatWindow.jsx`, `src/components/Sidebar.jsx`, `src/components/InputArea.jsx`.
6. C-6: Replace index-based keys with stable IDs across chat and queue entities.
Files: `src/components/ChatWindow.jsx`, `src/components/AnalyticsPanel.jsx`, `src/hooks/useRagApi.js`.
7. C-7: Shift remaining inline presentational styles used by architecture-critical surfaces into CSS classes.
Files: `src/App.jsx`, `src/components/Sidebar.jsx`, `src/components/FolderBrowserModal.jsx`, CSS modules.

### 6.3 Acceptance Criteria

- Sidebar responsibilities are separated into readable units with isolated state.
- Layout changes do not require JavaScript width branching.
- Streaming updates do not re-render unrelated UI on every token.
- Chat rendering uses a structured content pipeline rather than regex-only HTML mutation.
- Async chat states are explicit, reducer-driven, and testable.
- Architecture-critical layout and surface styling no longer depend on inline style objects.

---

## 7. Phase D: Design-System Completion

### 7.1 Scope

Phase D completes the interface after critical behavior and architecture have stabilized.

Primary items:

- replace inline styles with CSS classes
- complete the design token system
- establish theme architecture
- add timestamps and citations
- improve folder-browser semantics
- add confirmation for destructive actions
- add operational context to analytics updates

### 7.2 Implementation Tasks

| ID  | Work                                                                            | Files                                                               |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| D-1 | Replace inline modal and analytics styling with class-based CSS                 | `src/App.jsx`, `src/components/FolderBrowserModal.jsx`, CSS modules |
| D-2 | Complete spacing, typography, radius, and z-index token scales                  | `src/css/shared/tokens.css`                                         |
| D-3 | Add theme architecture with a future light-mode stub                            | `src/css/shared/tokens.css`, theme wiring if introduced             |
| D-4 | Add message timestamps and render with `<time>`                                 | `src/components/ChatWindow.jsx`                                     |
| D-5 | Implement source citation UI                                                    | `src/components/ChatWindow.jsx`                                     |
| D-6 | Add `listbox`, `option`, `aria-selected`, and `aria-activedescendant` semantics | `src/components/FolderBrowserModal.jsx`                             |
| D-7 | Add clear-session confirmation or undo path                                     | `src/components/Sidebar.jsx`, `src/App.jsx`                         |
| D-8 | Replace Vite favicon and correct browser metadata                               | `index.html`, static asset path                                     |
| D-9 | Add timestamps and summaries to operational updates                             | `src/components/AnalyticsPanel.jsx`                                 |

### 7.3 Acceptance Criteria

- Inline styling is no longer the dominant mechanism for layout and presentation.
- Theme and token architecture can support future expansion without refactor churn.
- Users can see when messages and operational changes occurred.
- Source citations are visible when backend data is present.
- Destructive actions have confirmation or recovery behavior.

---

## 8. Cross-Cutting Workstreams

### 8.1 Async Chat State Workstream

This workstream begins in Phase A and finishes in Phase C.

Required outcomes:

- normalized request lifecycle events
- clear separation of preflight failure, stream interruption, cancellation, and completion
- UI actions for retry and stop generating
- tests for non-200, malformed SSE, disconnect mid-stream, and clear during generation

### 8.2 Accessibility Workstream

This workstream begins in Phase A and continues through Phase D.

Required outcomes:

- semantic structure
- focus visibility
- keyboard journey completeness
- live-region behavior
- reduced motion and forced-colors support

### 8.3 Operational UX Workstream

This workstream begins in Phase B.

Required outcomes:

- queue and index states are understandable without inspecting console logs
- users can distinguish loading, empty, healthy, and broken states
- operational changes have summary text and temporal context

---

## 9. Verification Gates

Every phase must land with verification matched to the type of change.

| Gate                              | Required By   | Enforcement                                                                  |
| --------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| Sanitization and rendering tests  | Phase A       | component-level tests for safe rendering behavior                            |
| Keyboard-only modal tests         | Phase A       | component tests covering focus trap and restoration                          |
| Live-region assertions            | Phase A and B | component tests validating status and chat announcements                     |
| `axe` checks on key screens       | Phase B       | automated accessibility tests in CI                                          |
| Async stream failure tests        | Phase A and C | hook and integration tests covering failure and cancellation                 |
| Forced-colors validation          | Phase B       | manual verification or screenshot-based checks on Windows                    |
| Render-boundary regression checks | Phase C       | tests or instrumentation ensuring unrelated UI does not rerender excessively |

No phase should be considered complete if its matching verification gate is missing.

---

## 10. Suggested Delivery Sequence

1. Complete Phase A in a short-lived stabilization branch.
2. Land Phase B changes in small reviewable slices, with verification added in the same pull request as each feature.
3. Start Phase C only after async-state behavior and accessibility regressions are under test.
4. Start Phase C now with C-1 and C-2, then stage C-4 and C-5 together to avoid conflicting state boundary churn.
5. Use Phase D to finish system-level coherence rather than to patch unresolved blockers.

---

## 11. Milestone Exit Criteria

### Milestone 1: Blockers Cleared

- XSS path is closed.
- Modal and chat live-region accessibility criticals are fixed.
- Chat requests use the selected collection.
- Async error contract is normalized.

### Milestone 2: Core UX Stable

- Keyboard users can complete ingestion and chat flows.
- Focus is consistently visible.
- Operational panels distinguish loading, empty, and error states.
- Accessibility and stream regression tests are active.

### Milestone 3: Architecture Sustainable

- Sidebar and chat state boundaries are clear.
- Streaming does not re-render the entire app on every token.
- Async state machine is explicit and covered by tests.

### Milestone 4: System Complete

- Design tokens and themes are extensible.
- Timestamps, citations, and operational summaries are present.
- The frontend no longer relies on inline styling for major layout structures.

---

## 12. Estimated Effort

| Phase | Estimated Effort |
| ----- | ---------------- |
| A     | 3 to 5 hours     |
| B     | 6 to 9 hours     |
| C     | 8 to 12 hours    |
| D     | 10 to 14 hours   |

Total estimated effort is approximately 27 to 40 hours, depending on how much test coverage and refactor depth are included in each milestone.

---

_Plan prepared: 2026-03-15_
_Source of record: `docs/UI_UX_Analysis.md`_
