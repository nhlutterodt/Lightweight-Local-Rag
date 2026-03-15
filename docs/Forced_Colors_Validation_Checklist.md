---
doc_state: reference-contract
doc_owner: maintainers
canonical_ref: docs/Forced_Colors_Validation_Checklist.md
last_reviewed: 2026-03-15
audience: engineering
---

# Forced Colors Validation Checklist

## Purpose
Use this checklist to manually verify that the React frontend remains usable in Windows High Contrast (`forced-colors: active`) mode after UI changes.

## Scope
- `gui/client/react-client/src/css/shared/utilities.css`
- `gui/client/react-client/src/css/shared/tokens.css`
- `gui/client/react-client/src/css/modules/chat.css`
- `gui/client/react-client/src/css/modules/messages.css`
- `gui/client/react-client/src/css/modules/sidebar.css`
- `gui/client/react-client/src/css/modules/queue-manager.css`
- `gui/client/react-client/src/css/modules/index-monitor.css`

## Environment
1. Windows 11 (or Windows 10) with High Contrast enabled.
2. Browser: latest Edge or Chrome.
3. Start frontend from `gui/client/react-client` using `npm run dev`.
4. Ensure backend is reachable if validating dynamic queue and chat states.

## Validation Steps
1. Open the app with High Contrast disabled and confirm baseline layout.
2. Enable High Contrast (`Settings > Accessibility > Contrast themes`) and refresh the page.
3. Confirm glass surfaces fall back to solid system colors and remain readable.
4. Tab through all interactive controls and verify focus ring visibility on each control.
5. Verify tooltip text remains legible and does not hide the focused control.
6. Send a message and verify chat content, thinking status, and recovery states are readable.
7. Trigger cancelled and interrupted chat states and confirm recovery cards remain understandable without color alone.
8. Open folder browser modal and verify:
- dialog background and text contrast are readable
- close button and action buttons are clearly visible
- focus trap remains visible while tabbing
9. Validate sidebar status text (`online`, `warning`, `offline`) remains distinguishable by wording and border treatment.
10. Validate analytics panel states (`loading`, `empty`, `error`, `populated`) remain understandable by text, not color alone.

## Pass Criteria
1. All text and controls remain legible with system colors.
2. Focus indication is always visible.
3. Status and error meaning remains understandable without relying only on color.
4. Modal and keyboard flow remain fully usable.
5. No blocked interactions or hidden controls in forced-colors mode.

## Failure Handling
1. Capture screenshot and affected control/region.
2. Record exact file and selector causing the issue.
3. Add or adjust `@media (forced-colors: active)` fallback styles.
4. Re-run this checklist before merging.
