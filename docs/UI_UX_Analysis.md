---
doc_state: canonical
doc_owner: maintainers
canonical_ref: docs/UI_UX_Analysis.md
last_reviewed: 2026-03-15
audience: engineering
---

# UI/UX Architecture Analysis

> **Scope**: `gui/client/react-client/` — React 19 + Vite frontend.
> **Purpose**: Identify concrete gaps against best practices and WCAG 2.1 AA accessibility standards, and establish a prioritized remediation roadmap.

## 0. Phase C Context Refresh (2026-03-15)

This document captures the original gap analysis and is still the source-of-truth for historical findings. Before starting Phase C, the implementation status was re-checked against the current frontend code and tests.

Resolved before Phase C start:

- XSS sanitization is in place for AI-rendered HTML via DOMPurify.
- Modal dialog semantics, focus trap, and focus restoration are implemented.
- Chat log and status live-region semantics are implemented.
- Collection selection is app-owned and passed to chat requests (no hardcoded collection path).
- Async stream lifecycle now includes explicit interruption and cancellation handling.
- Error boundaries, skip link, reduced motion, forced-colors fallbacks, textarea auto-resize, and analytics state modeling are implemented.
- Accessibility regression checks (`axe`) and frontend CI test workflow are present.

Still open for Phase C and beyond:

- Sidebar decomposition and local preference state isolation.
- JS-driven responsive branching (`useWindowDimensions`) replacement with CSS-owned layout behavior.
- Regex-first AI rendering replacement with structured Markdown rendering pipeline.
- Stable message and queue IDs replacing index keys.
- Explicit async state machine consolidation (single reducer/transition model).
- Broad inline-style removal and design-system token maturity (tracked for late Phase C into Phase D).

---

## 1. Executive Summary

The frontend is a clean React 19 / Vite application with a coherent "Dark Nebula" glassmorphism aesthetic. The component structure is small and readable. However, it carries **one critical security vulnerability**, **pervasive accessibility failures**, and several architectural decisions that will limit maintainability as the surface area grows. None of the issues are architectural dead ends; they are all correctable in place. The highest-priority items are the XSS vector, the missing ARIA and semantic HTML foundations, and the absence of modeled async interaction states.

**Severity legend used throughout this document:**

| Marker          | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| 🔴 **CRITICAL** | Security risk or complete inaccessibility                   |
| 🟠 **HIGH**     | Material UX degradation or WCAG AA failure                  |
| 🟡 **MEDIUM**   | Developer experience, maintainability, or WCAG AA edge case |
| 🟢 **LOW**      | Polish or best-practice alignment                           |

---

## 2. Security

### 2.1 🔴 CRITICAL — XSS via `dangerouslySetInnerHTML`

**File**: `src/components/ChatWindow.jsx`
**Lines**: `formatContent()` function and the render call

```jsx
dangerouslySetInnerHTML={{ __html: formatContent(msg.htmlContent || msg.content) }}
```

`formatContent` transforms raw AI output, which is an untrusted external source, by injecting it directly into the DOM with regex substitutions. While the current substitutions only wrap `<think>` tags, there is **no HTML sanitization**. A prompt-injected response containing `<script>`, `<img onerror=...>`, or `<a href="javascript:...">` would execute in the user's browser context.

**Remediation**: install `dompurify` and sanitize before injection.

```js
import DOMPurify from "dompurify";

return DOMPurify.sanitize(formatted, {
  ADD_TAGS: ["details", "summary"],
  ADD_ATTR: ["class", "style"],
});
```

This is a small, high-leverage fix and should be the first change merged.

---

## 3. Accessibility (WCAG 2.1 AA)

### 3.1 🔴 CRITICAL — Modal Has No Focus Trap, ARIA Role, or Focus Restoration

**File**: `src/components/FolderBrowserModal.jsx`

Failures:

- `role="dialog"` and `aria-modal="true"` are absent, so screen readers cannot identify this as a modal dialog.
- `aria-labelledby` is absent, so the modal title is visually present but not associated.
- Focus is not moved into the modal when it opens.
- Focus is not restored to the trigger button when the modal closes.
- The close button `✕` has no `aria-label`.
- The modal container lacks `tabIndex="-1"` for programmatic focus.

**Remediation**:

```jsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="folder-browser-title"
  tabIndex={-1}
  ref={dialogRef}
>
  <h2 id="folder-browser-title">Select Folder</h2>
  <button aria-label="Close folder browser" onClick={onClose}>
    ✕
  </button>
</div>
```

A proper focus trap can be implemented with a small `useFocusTrap` hook that loops focusable elements on `Tab` and `Shift+Tab`.

---

### 3.2 🔴 CRITICAL — Chat Window Is Not Announced to Screen Readers

**File**: `src/components/ChatWindow.jsx`

The chat window has no `role="log"` or `aria-live` region. New AI response tokens stream in, but assistive technologies receive no notification of new content. Users relying on screen readers cannot follow the conversation.

**Remediation**:

```jsx
<div
  id="chatWindow"
  className="chat-window"
  role="log"
  aria-label="Conversation history"
  aria-live="polite"
  aria-relevant="additions"
>
```

---

### 3.3 🟠 HIGH — Send Button Has No Accessible Label

**File**: `src/components/InputArea.jsx`

The send button renders only an SVG icon. There is no `aria-label`. Screen readers will announce only “button” with no context.

```jsx
<button aria-label="Send message">
  <svg aria-hidden="true" />
</button>
```

---

### 3.4 🟠 HIGH — Form Input Labels Have No `htmlFor` Association

**File**: `src/components/Sidebar.jsx`

All `<label>` elements rely on visual proximity rather than programmatic association. This breaks click-to-focus behavior and weakens screen-reader interpretation.

Example:

```jsx
<label htmlFor="modelSelect">AI Model</label>
<select id="modelSelect" />
```

Affected controls:

- `AI Model` → `modelSelect`
- `Collection` → `collectionName`
- `Vectorize New Data` → `ingestPath`
- `Status` → should use text semantics or `aria-labelledby` instead of a plain form label

---

### 3.5 🟠 HIGH — Textarea Has No Accessible Label

**File**: `src/components/InputArea.jsx`

The `<textarea>` has only a `placeholder`. Placeholder text is not a substitute for a label.

```jsx
<label htmlFor="userInput" className="sr-only">Query message</label>
<textarea id="userInput" placeholder="Ask anything about your documents..." />
```

Add the `.sr-only` utility in `utilities.css`:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

---

### 3.6 🟠 HIGH — Status Indicator Has No Live Region

**File**: `src/components/Sidebar.jsx`

Connection status changes dynamically, but there is no `aria-live` region. Users with visual impairments receive no notification of state changes.

```jsx
<div
  id="connectionStatus"
  role="status"
  aria-live="polite"
  className={`status-indicator ${...}`}
>
```

---

### 3.7 🟠 HIGH — No `prefers-reduced-motion` Support

**Files**: `messages.css`, `utilities.css`, `chat.css`

Animations such as `slideIn`, `spin`, `pulse`, and hover transforms run unconditionally. Users who have enabled reduced motion receive the same animations.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### 3.8 🟠 HIGH — Color Contrast: Muted Text Below WCAG AA

**File**: `src/css/shared/tokens.css`

`--text-muted: #9ca3af` on `--bg-color: #0d0d0f` yields a contrast ratio of approximately `3.8:1`, which fails WCAG AA for body text.

Raise it to `#b0b7c3` to pass AA without materially changing the aesthetic.

---

### 3.9 🟡 MEDIUM — Tooltip Implementation Is Not Accessible

**File**: `src/css/shared/utilities.css`

Tooltips use `::before` pseudo-elements triggered on `:hover` only.

Problems:

- They are invisible to screen readers.
- They do not appear on keyboard focus.
- They do not work well on touch devices.

At minimum:

```css
[data-tooltip]:hover::before,
[data-tooltip]:focus-visible::before {
  opacity: 1;
  visibility: visible;
}
```

Longer term, replace this with a real tooltip implementation using `aria-describedby`.

---

### 3.10 🟡 MEDIUM — Semantic HTML Violations

Findings:

| Element | Location                        | Problem                                                         |
| ------- | ------------------------------- | --------------------------------------------------------------- |
| `<nav>` | `Sidebar.jsx`                   | Wraps form controls and analytics, not navigation links         |
| `<nav>` | `App.jsx` right analytics aside | Wraps `<AnalyticsPanel>`, which is data, not navigation         |
| `<h3>`  | `ChatWindow.jsx`                | Creates heading hierarchy inside a chat log                     |
| `<ul>`  | `FolderBrowserModal.jsx`        | Missing `listbox` and `option` semantics for keyboard selection |

---

### 3.11 🟡 MEDIUM — No Skip Navigation Link

The layout offers no way for keyboard users to bypass the sidebar and go directly to the chat input.

```jsx
<a href="#userInput" className="skip-link">
  Skip to chat input
</a>
```

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 1rem;
  background: var(--accent-primary);
  color: white;
  padding: 0.5rem 1rem;
  z-index: 9999;
  border-radius: 0 0 8px 8px;
  text-decoration: none;
}

.skip-link:focus {
  top: 0;
}
```

---

### 3.12 🟡 MEDIUM — Folder Browser Uses Index-Based Keyboard Selection Without `aria-activedescendant`

**File**: `src/components/FolderBrowserModal.jsx`

The `activeIndex` state drives visual highlight, but there is no `aria-activedescendant` on the list container and no `aria-selected` on list items. Screen readers cannot follow the keyboard cursor through the directory listing.

---

## 4. Focus Visibility and Keyboard Journey

### 4.1 🟠 HIGH — Visible Focus Is Not Reliably Present Across Interactive Controls

**Files**: `src/css/modules/chat.css`, `src/css/modules/sidebar.css`, `src/css/shared/utilities.css`

The earlier analysis focused on semantics, but not whether keyboard users can actually **see** focus. Several controls remove default outlines and replace them only with subtle border changes. Buttons do not share a strong `:focus-visible` treatment.

This affects:

- send button
- browse button
- queue button
- clear-session button
- modal breadcrumb buttons
- analytics controls shown in narrow layouts

**Remediation**:

```css
:where(button, [href], input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
}
```

---

### 4.2 🟠 HIGH — Keyboard Journey Has Not Been Evaluated End-to-End

The current document identifies isolated accessibility defects, but not the full keyboard-only journey required to complete core tasks.

That journey should verify that a user can:

1. land on the page and identify the first meaningful focus target
2. reach model selection and collection input
3. open the folder browser using only the keyboard
4. traverse breadcrumb buttons and directory options
5. queue an ingestion job and perceive success or failure
6. return to the chat input and submit a query
7. follow streamed response updates without losing context
8. clear or recover the session safely

Weak points today:

- modal list rows are clickable but not natively focusable
- tooltip-only affordances do not help keyboard users
- focus return from modal close is missing
- analytics content embedded in the sidebar changes the tab path on narrow layouts
- destructive actions remain available during generation without interruption design

---

## 5. Windows High Contrast and Forced Colors

### 5.1 🟠 HIGH — Glassmorphism Styling Has Not Been Audited in `forced-colors` Mode

**Files**: `src/css/shared/tokens.css`, `src/css/shared/utilities.css`

The current contrast review checks only the default dark theme. That is incomplete on Windows, where users may enable High Contrast or `forced-colors` mode. This frontend depends heavily on translucent surfaces, subtle borders, and blur.

Examples:

- `--glass-bg: rgba(255, 255, 255, 0.05)`
- `--glass-border: rgba(255, 255, 255, 0.1)`
- `.glass` uses `backdrop-filter`

In `forced-colors` mode those cues may collapse entirely.

**Remediation**:

```css
@media (forced-colors: active) {
  .glass {
    background: Canvas;
    color: CanvasText;
    border: 1px solid ButtonText;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  :where(button, input, select, textarea) {
    border: 1px solid ButtonText;
    background: Canvas;
    color: CanvasText;
  }

  :focus-visible {
    outline: 2px solid Highlight;
  }
}
```

Testing should be performed in at least one Windows High Contrast theme, not inferred from standard contrast tools.

---

### 5.2 🟡 MEDIUM — State Communication Relies Heavily on Visual Styling That May Collapse Under System Color Overrides

Status pills, badges, queue-state accents, and thinking-state visuals lean on accent colors and translucent backgrounds. Even when text remains visible, state hierarchy may become less legible when colors are overridden.

This is especially relevant for:

- connection status in `Sidebar.jsx`
- queue status text in `AnalyticsPanel.jsx`
- thinking-state borders and spinner colors in `messages.css`

Each state should remain understandable through text, border treatment, and layout alone.

---

## 6. Component Architecture

### 6.1 🔴 CRITICAL — `collectionName` Disconnected from Chat

**File**: `src/App.jsx`

```jsx
await streamChat(newChat, activeModel, "TestIngest", (data) => {
```

The `collectionName` state lives in `Sidebar.jsx`, but `App.jsx` hardcodes `"TestIngest"` in the chat call. The user's collection selection is silently ignored for all chat queries.

**Fix**: lift `collectionName` state up to `App.jsx` or a shared context and pass it through both `Sidebar` and `streamChat`.

---

### 6.2 🟠 HIGH — `Sidebar.jsx` Is a Monolith

`Sidebar.jsx` currently manages:

1. model selection state
2. collection name state and recent history
3. ingest path state and recent history
4. folder browser open and close state
5. enqueue error state
6. analytics panel rendering
7. localStorage persistence for all of the above

Recommended decomposition:

```text
Sidebar.jsx             <- layout shell only, receives all props and callbacks
  ModelSelector.jsx     <- select and label for AI model
  CollectionInput.jsx   <- collection text input and datalist
  IngestControls.jsx    <- path input, browse button, queue button, checkbox
  ConnectionStatus.jsx  <- connected, offline, warning status pill
```

The localStorage logic belongs in a dedicated `useSidebarPreferences` hook.

---

### 6.3 🟠 HIGH — No Auto-Scroll to Latest Message

**File**: `src/components/ChatWindow.jsx`

New messages and streaming content are appended to the DOM, but the scroll position is never programmatically moved.

```jsx
const bottomRef = useRef(null);

useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [history]);
```

---

### 6.4 🟠 HIGH — `dangerouslySetInnerHTML` With No Markdown Renderer

The current regex-based `formatContent` handles `<think>` tags but does not render Markdown. AI responses commonly include emphasis, code fences, and lists. `react-markdown` plus `rehype-sanitize` would improve readability while also moving the rendering path toward structural safety.

---

### 6.5 🟡 MEDIUM — `key={idx}` on Chat History and Queue Items

**Files**: `ChatWindow.jsx`, `AnalyticsPanel.jsx`

Using array index as a React key causes incorrect reconciliation when items are inserted or removed. Messages and queue items should use stable IDs.

---

### 6.6 🟡 MEDIUM — No React Error Boundary

A JavaScript error in any component will unmount the entire application with a blank screen. A top-level error boundary would contain failures to their origin zone.

---

### 6.7 🟡 MEDIUM — Responsive Layout Managed in JavaScript Instead of CSS

**File**: `App.jsx` and `hooks/useWindowDimensions.js`

The three-column layout switch at `1200px` is implemented by conditional rendering based on JavaScript window width.

Problems:

- layout flash on load
- full React re-renders on resize
- weaker print and accessibility adaptability than CSS media queries

Preferred pattern:

```css
@media (max-width: 1200px) {
  .analytics-aside {
    display: none;
  }
}
```

---

### 6.8 🟢 LOW — Textarea Does Not Auto-Resize

**File**: `src/components/InputArea.jsx`

`rows="1"` is fixed, so long messages overflow the single row before the user finishes their query.

```js
const handleChange = (event) => {
  setText(event.target.value);
  event.target.style.height = "auto";
  event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
};
```

---

## 7. CSS and Design System

### 7.1 🟠 HIGH — Pervasive Inline Styles Undermine the Design System

**Files**: `App.jsx`, `FolderBrowserModal.jsx`, `Sidebar.jsx`

The modal and analytics aside are styled almost entirely with inline `style={{}}` objects.

Problems:

- they cannot be overridden by the cascade
- they cannot respond cleanly to media queries
- they cannot share hover or focus-state semantics through CSS alone
- they create drift from the class-based design system

Inline styles should be reserved for dynamic runtime-computed values only.

---

### 7.2 🟡 MEDIUM — Design Token Set Is Incomplete

**File**: `src/css/shared/tokens.css`

The token file defines color values only. A production design system should also define spacing, typography, radius, z-index, semantic colors, and transition scales.

```css
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  --z-modal: 1000;
  --z-tooltip: 100;
  --z-above: 10;

  --color-success: #10b981;
  --color-error: #ef4444;
  --color-warning: #f59e0b;
  --color-info: var(--accent-primary);

  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
}
```

---

### 7.3 🟡 MEDIUM — No Dark or Light Mode Support

The design is exclusively dark-mode and hardcodes all colors to dark values. At minimum, a `data-theme` architecture should be established so a light mode can be added without refactoring all components.

---

### 7.4 🟡 MEDIUM — No Mobile Layout

Below `1200px` the sidebar remains fixed at `320px`. On smaller screens, that consumes too much horizontal space. A minimum `768px` breakpoint should collapse the sidebar to a drawer or sheet pattern.

---

### 7.5 🟢 LOW — Favicon Still References Vite Branding

**File**: `gui/client/react-client/index.html`

```html
<link rel="icon" type="image/svg+xml" href="/vite.svg" />
```

The browser tab still shows the Vite logo instead of a project-specific icon.

---

### 7.6 🟢 LOW — `body { overflow: hidden }` Prevents Emergency Scrolling

**File**: `src/css/shared/reset.css`

Internal scrolling is intentional, but `overflow: hidden` on the `body` makes expanded fallback content inaccessible if any component exceeds its intended bounds.

---

## 8. UX Patterns and Interaction Design

### 8.1 🟠 HIGH — No Message Timestamps

Chat messages have no timestamps. Users cannot determine when a conversation occurred after returning to the app.

---

### 8.2 🟠 HIGH — Stream Interruption Has No Recovery Path

If the fetch stream fails mid-response, the current implementation appends an error string into the message content itself:

```js
incomingResponse += `\n\n⚠️ **Error:** ${data.message}`;
```

This presents a degraded partial message with no retry option and no distinct interruption state.

---

### 8.3 🟡 MEDIUM — Welcome Message Badges Have No Semantic Meaning

**File**: `src/components/ChatWindow.jsx`

The badges `Local AI`, `No Internet`, and `Privacy First` are decorative. They could instead surface dynamic, meaningful state such as active model, current collection, or actual connectivity.

---

### 8.4 🟡 MEDIUM — Enqueue Feedback Is Absent on Success

When a user clicks `➕ Queue`, errors are shown, but there is no success confirmation. The queue updates in the analytics panel, but only if the user notices it.

---

### 8.5 🟡 MEDIUM — Input Character or Token Budget Has No Indicator

The query textarea provides no feedback on message length. For RAG systems, overly long queries should be gently discouraged.

---

### 8.6 🟢 LOW — Source Citations Are Designed but Not Implemented

Source citations were a primary feature goal, but the frontend has no UI surface to display them.

---

### 8.7 🟢 LOW — Clear Session Is Immediately Destructive

The `Clear Session` button executes `setChatHistory([])` without confirmation or undo.

---

## 9. Async Interaction States

### 9.1 🟠 HIGH — Connection Loss Before Send Has No Deterministic User-Facing Handling

**Files**: `src/App.jsx`, `src/hooks/useRagApi.js`

The send path is gated by `isConnected`, but connectivity is refreshed on a polling interval. The UI can therefore present a stale connected state while the backend is already unreachable.

The analysis should explicitly cover:

- user composes a message while connectivity is stale
- send is allowed
- request fails immediately
- there is no distinct preflight failure state

The UI should expose a separate “failed before stream start” state with inline feedback and retry affordance.

---

### 9.2 🟠 HIGH — Non-200 Responses and Stream Errors Are Not Normalized Consistently

**Files**: `src/App.jsx`, `src/hooks/useRagApi.js`

`App.jsx` checks callback payloads with `data.type === "error"`, while `useRagApi.js` emits transport failures as `onUpdate({ error: err.message })`. That contract mismatch means non-200 responses can fail without hitting the intended UI path. Malformed SSE chunks are only logged to the console.

The UI should model explicit callback events such as:

- `start`
- `token`
- `error`
- `done`

---

### 9.3 🟠 HIGH — Mid-Stream Disconnects Produce Partial Content Without a Stable Recovery State

When the stream fails after partial tokens have already rendered, the UI appends an error string into the same response surface. That conflates partial answer, transport failure, and recovery guidance.

The analysis should explicitly model:

- `streaming`
- `interrupted`
- `failed-before-start`
- `cancelled`
- `completed`

---

### 9.4 🟡 MEDIUM — Clear Session During Generation Is Undefined Behavior

**File**: `src/App.jsx`

`onClearSession={() => setChatHistory([])}` remains available while generation is active. The document should assess whether the request continues, whether later tokens repopulate cleared history, and whether the user should be warned.

---

### 9.5 🟡 MEDIUM — Cancellation Behavior Is Not Designed or Implemented

There is no user control to stop an in-flight generation, and the data layer has no `AbortController`-based cancellation path. For a streaming chat interface, cancellation is a first-class interaction state.

---

## 10. Analytics and Operational UX

### 10.1 🟡 MEDIUM — Queue and Health Surfaces Are Dynamic But Not Announced as Operational Status

**Files**: `src/components/AnalyticsPanel.jsx`, `src/components/Sidebar.jsx`

The application exposes operational data in two places:

- connection and model readiness in the sidebar
- vector index health and ingestion queue in the analytics panel

Queue contents and index health can change asynchronously through polling and SSE, yet there is no structured announcement strategy for those updates.

---

### 10.2 🟡 MEDIUM — Empty and Error States Are Operationally Ambiguous

**Files**: `src/components/AnalyticsPanel.jsx`, `src/hooks/useRagApi.js`

`No indices found` and `Queue is empty` are presented as simple empty states, but those regions can also represent:

- initial loading before data arrives
- backend request failure
- SSE interruption
- legitimately empty operational state

Users cannot distinguish healthy emptiness from failed loading.

---

### 10.3 🟡 MEDIUM — Operational Changes Lack Temporal and Causal Context

Queue entries show filename and status only. Index monitor entries show name and health only. Users cannot answer basic questions such as what changed, when it changed, and whether the change was caused by their last action.

---

## 11. Performance

### 11.1 🟡 MEDIUM — Streaming Causes Excessive Re-Renders in `App.jsx`

Every incoming token triggers `setChatHistory([...newChat, { role: "ai", content: incomingResponse }])` in `App.jsx`. This re-renders `App`, `Sidebar`, `ChatWindow`, and `InputArea` on every token.

At minimum, `Sidebar` and `InputArea` should be wrapped in `React.memo`. A better fix is to move streaming state into `ChatWindow` or a dedicated `useStreamState` hook.

---

### 11.2 🟢 LOW — No Virtualization for Long Conversations

Long chat sessions accumulate all message DOM nodes. This is acceptable for small sessions, but extended sessions would benefit from windowing.

---

## 12. Verification Gates

### 12.1 🟠 HIGH — No Automated Accessibility and Interaction Regression Gates Are Defined

The document recommends multiple fixes, but it does not define how they will stay enforced.

Required verification matrix:

| Gate                               | Minimum Coverage                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `axe` accessibility checks         | app initial state, populated chat state, modal-open state, disconnected or error state                         |
| keyboard-only modal tests          | initial focus placement, tab trap, shift-tab wrap, escape close, focus restoration, enter and space activation |
| live-region assertions             | chat log announcements, sidebar connection-status announcements, queue and index summaries                     |
| streaming error and recovery tests | non-200 response, malformed SSE, mid-stream disconnect, clear during generation, user cancellation             |
| forced-colors validation           | manual or screenshot verification in Windows High Contrast for chat, sidebar, modal, analytics panel           |

---

### 12.2 🟡 MEDIUM — Scenario-Based Testing Is Needed in Addition to Unit Tests

Unit tests alone are not enough because several defects only appear when asynchronous state, keyboard movement, and dynamic rendering intersect.

Minimum scenarios:

- queue a folder, then observe analytics confirmation
- send a query, then disconnect mid-stream
- open the modal, navigate directories by keyboard, close it, and resume form interaction
- clear a session while generation is active

---

## 13. Prioritized Remediation Roadmap

### Phase A: Must-Fix

| #   | File(s)                   | Change                                                                                             | Severity |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| A-1 | `ChatWindow.jsx`          | Add `dompurify` sanitization to `formatContent`                                                    | 🔴       |
| A-2 | `FolderBrowserModal.jsx`  | Add `role="dialog"`, `aria-modal`, focus trap, and focus restore                                   | 🔴       |
| A-3 | `ChatWindow.jsx`          | Add `role="log"` and `aria-live="polite"` to the chat window                                       | 🔴       |
| A-4 | `App.jsx`                 | Fix hardcoded `"TestIngest"` and pass live `collectionName` from state                             | 🔴       |
| A-5 | `InputArea.jsx`           | Add `aria-label="Send message"` and a visually hidden `<label>` for the textarea                   | 🟠       |
| A-6 | `Sidebar.jsx`             | Add `htmlFor` to labels and `role="status"` plus `aria-live` to the status region                  | 🟠       |
| A-7 | `App.jsx`, `useRagApi.js` | Normalize async chat event states for non-200 responses, malformed streams, and transport failures | 🟠       |

### Phase B: High-Impact UX and Accessibility

| #    | File(s)                                    | Change                                                                                 | Severity |
| ---- | ------------------------------------------ | -------------------------------------------------------------------------------------- | -------- |
| B-1  | `utilities.css`                            | Add `.sr-only` and `prefers-reduced-motion` support                                    | 🟠       |
| B-2  | `tokens.css`                               | Raise `--text-muted` and expand the token set                                          | 🟠       |
| B-3  | `ChatWindow.jsx`                           | Add `scrollIntoView` auto-scroll behavior                                              | 🟠       |
| B-4  | `App.jsx`                                  | Add error boundaries                                                                   | 🟡       |
| B-5  | `InputArea.jsx`                            | Add textarea auto-resize logic                                                         | 🟢       |
| B-6  | `App.jsx`, `index.html`                    | Add a skip-navigation link to `#userInput`                                             | 🟡       |
| B-7  | `utilities.css`                            | Add `:focus-visible` tooltip trigger support                                           | 🟡       |
| B-8  | `utilities.css`, `chat.css`, `sidebar.css` | Establish shared visible-focus styling for all interactive controls                    | 🟠       |
| B-9  | `tokens.css`, `utilities.css`              | Add Windows `forced-colors` fallbacks for glass surfaces, controls, and focus rings    | 🟠       |
| B-10 | `AnalyticsPanel.jsx`                       | Add operational live-region semantics and distinct loading, empty, and error states    | 🟡       |
| B-11 | `src/test`, component tests                | Add `axe`, keyboard-journey, live-region, and stream failure tests as regression gates | 🟠       |

### Phase C: Architecture Refactor

| #   | Areas                                     | Change                                                                                           | Severity |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| C-1 | `Sidebar.jsx`                             | Decompose into smaller components and a `useSidebarPreferences` hook                             | 🟡       |
| C-2 | `App.jsx`, `hooks/useWindowDimensions.js` | Replace JS layout branching with CSS media-query behavior                                        | 🟡       |
| C-3 | `ChatWindow.jsx`                          | Replace regex-based rendering with `react-markdown` and `rehype-sanitize`                        | 🟡       |
| C-4 | `App.jsx`                                 | Lift `collectionName` into shared state                                                          | 🟡       |
| C-5 | `App.jsx`, `Sidebar.jsx`                  | Prevent streaming-triggered re-renders with memoization and state isolation                      | 🟡       |
| C-6 | `ChatWindow.jsx`, `AnalyticsPanel.jsx`    | Replace `key={idx}` with stable IDs                                                              | 🟡       |
| C-7 | `App.jsx`, `useRagApi.js`                 | Introduce an explicit async state machine with interruption, cancellation, and recovery behavior | 🟠       |

### Phase D: Design System Completion

| #   | Areas                    | Change                                                                                    |
| --- | ------------------------ | ----------------------------------------------------------------------------------------- |
| D-1 | all CSS modules          | Replace inline styles in `App.jsx` and `FolderBrowserModal.jsx` with classes              |
| D-2 | `tokens.css`             | Add full spacing, typography, radius, and z-index scales                                  |
| D-3 | `tokens.css`             | Establish a `data-theme="dark"` architecture and light-mode stub                          |
| D-4 | `ChatWindow.jsx`         | Add timestamps to message objects and render with `<time>`                                |
| D-5 | `ChatWindow.jsx`         | Implement source citation cards in the response footer                                    |
| D-6 | `FolderBrowserModal.jsx` | Add `listbox` and `option` semantics plus `aria-activedescendant`                         |
| D-7 | `Sidebar.jsx`            | Add confirmation before clearing a session                                                |
| D-8 | `index.html`             | Replace `vite.svg` favicon with a project-specific icon                                   |
| D-9 | `AnalyticsPanel.jsx`     | Add timestamps, change summaries, and action-linked confirmations for operational updates |

---

## 14. Effort Estimates

| Phase | Items    | Estimated Effort |
| ----- | -------- | ---------------- |
| A     | 7 items  | 3 to 5 hours     |
| B     | 11 items | 6 to 9 hours     |
| C     | 7 items  | 8 to 12 hours    |
| D     | 9 items  | 10 to 14 hours   |

Phase A should be treated as a blocking prerequisite before new frontend feature development. Phases B through D can be sequenced across sprints.

---

_Analysis performed: 2026-03-15_
_Codebase snapshot: `gui/client/react-client/` — React 19.2, Vite 7.3, no external UI library_
