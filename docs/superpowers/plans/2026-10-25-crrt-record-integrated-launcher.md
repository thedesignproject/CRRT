# CRRT Record integrated launcher implementation plan

**Spec:** `docs/superpowers/specs/2026-10-25-crrt-record-integrated-launcher-design.md`  
**Branch:** `tomas/tdp-5958-record-v1-demo`

## 1. Make the recording surface a direct Shadow DOM app

- Extract the reusable React surface from the iframe entrypoint.
- Mount it directly from `record-overlay.js` into a closed Shadow DOM with inline extension-owned styles.
- Remove pointer hit-testing/layout messages; use CSS `pointer-events` on controls and the annotation canvas.
- Add setup, recording, confirmation, warning, and countdown states to the same surface.

## 2. Extend the session protocol

- Add setup commands for source, camera, microphone, Start, Cancel, and dismiss.
- Remove Pin from the active tool contract while retaining compatibility for saved recordings.
- Make session ownership support an offscreen controller instead of a visible controller tab/window.
- Keep every message session-scoped and reject stale commands.

## 3. Add the MV3 offscreen media controller

- Add an offscreen HTML/TS entrypoint and the manifest permission.
- Move MediaRecorder lifecycle, countdown, pause/resume, restart, finish, blobs, and local save into it.
- Consume tab stream IDs from the service worker; use display media for Window/Entire screen.
- Emit snapshots and completion/error events back through background.

## 4. Route launch and completion through background

- Change Record launch to create and inject a setup session in the active page rather than opening a setup window.
- Forward surface commands to the offscreen controller and broadcast state back to the surface.
- Resolve DOM targets for completed marks in background.
- Tear down on Cancel and open the existing review page only after Done.
- Keep the existing comments/auth popup and widget entry points working.

## 5. Simplify and harden the toolbar

- Use icon-only Cancel, Pause, Restart, Undo, and Clear controls with tooltips and accessible labels.
- Keep Draw, Arrow, Box, and Text labeled; remove visible Point and Pin.
- Toggle the active tool off on second click and Escape; Text returns to navigation after completion.
- Place Undo/Clear next to tools and require confirmation for Restart/Cancel.
- Guard pending commands so one click produces one action.

## 6. Verify

- Add focused protocol, host, surface, offscreen, background, popup, manifest, and release tests.
- Run typecheck, extension build, full suite, manual unpacked-extension smoke test, and repo diff coverage against `origin/trunk` until changed line and branch coverage are both 100%.
