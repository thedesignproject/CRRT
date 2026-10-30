# CRRT Record tab overlay implementation plan

**Spec:** `docs/superpowers/specs/2026-10-24-crrt-record-v1-design.md`
**Branch:** `tomas/tdp-5958-record-v1-demo`
**Scope:** Tomás frontend demo only; no backend persistence, upload, transcription, entitlement, or billing work.

## Outcome

Starting a **This tab** recording returns the author to the real captured tab. A CRRT recording surface remains fixed over that tab while the author navigates, speaks, draws, writes, pins, pauses, and finishes. The existing recorder page owns media capture in the demo and becomes the review surface after completion.

## Task 1 — Define the recording-session protocol

Files:

- `apps/extension/lib/recording-session.ts`
- `apps/extension/lib/recording-session.test.ts`

Add serializable controller state and typed messages for mount, ready, state synchronization, tool changes, marks, pause/resume, restart, finish, and teardown. Every message carries a session ID and revision. Validate messages before accepting them so stale frames cannot control a newer recording.

Keep media streams and blobs out of this protocol. The protocol carries only UI state, normalized geometry, DOM targets, commands, and recoverable errors.

## Task 2 — Add an isolated tab recording host

Files:

- `apps/extension/entrypoints/record-overlay.tsx`
- `apps/extension/lib/record-page-host.ts`
- `apps/extension/lib/record-page-host.test.ts`
- `apps/extension/entrypoints/record-controls/index.html`
- `apps/extension/entrypoints/record-controls/main.tsx`
- `apps/extension/entrypoints/record-controls/style.css`
- `apps/extension/entrypoints/record-controls/main.test.tsx`

Follow the existing comment host pattern:

- inject one marked host into the document;
- attach a closed Shadow DOM;
- mount an extension-origin iframe;
- keep the iframe pointer-transparent except over visible controls or while a drawing tool is active;
- resolve selectors and element metadata in the page host;
- clean up on Done, cancel, session replacement, and pagehide.

The private controls frame renders countdown, movable camera placeholder/bubble, transcript preview, marks, paused state, compact recording pill, and the complete bottom toolbar. Drawing uses normalized viewport coordinates and sends completed marks back to the controller.

## Task 3 — Route one durable demo session through background

Files:

- `apps/extension/entrypoints/background.ts`
- `apps/extension/entrypoints/background.test.ts`
- `apps/extension/wxt.config.ts`
- `apps/extension/wxt.config.test.ts`

The service worker stores the active session descriptor in `storage.session`, keeps the controller connection, validates sender tab/frame/session, injects the overlay, focuses the recorded tab, and reinjects after authorized navigation.

Add optional HTTP(S) host permissions. Request them only from the explicit Start action. When permission is denied, continue on the current `activeTab` grant and return a warning that cross-origin navigation will lose controls and DOM context.

For the demo, the existing recorder popup remains the media controller. Once capture and the countdown are ready, background focuses the captured tab and moves the controller popup behind it. It is focused again after Done so review is immediately visible.

## Task 4 — Convert the recorder page into setup/controller/review

Files:

- `apps/extension/entrypoints/record/main.tsx`
- `apps/extension/entrypoints/record/main.test.tsx`
- `apps/extension/entrypoints/record/style.css`

For **This tab**:

- acquire tab, microphone, and camera streams in the initiating gesture;
- create a recording session;
- synchronize reducer state to the injected controls;
- accept validated commands and marks from the tab surface;
- stop and save the same local `LocalRecording` shape;
- remove the injected surface and show review.

Retain the current preview-based controller for Window and Entire screen because a Chrome extension cannot inject over arbitrary external applications. Label that limitation in setup instead of implying DOM-aware annotations.

Remove target resolution from the duplicated preview path for tab mode; the page host now resolves the actual element under the completed mark.

## Task 5 — Permissions, privacy, and failure behavior

Files:

- `apps/extension/lib/disclosure.ts`
- affected disclosure tests and extension manifest tests

Update the disclosure copy to explain that site access is requested only for pages being recorded and is used for controls, marks, and DOM context. Do not add persistent broad host access.

Recover safely from:

- permission denial;
- unsupported/restricted pages;
- tab close or navigation without access;
- controller disconnect;
- capture track ending;
- stale overlay messages;
- duplicate Start/Done commands.

Capture continues where safe; unavailable DOM context is represented honestly rather than fabricated.

## Task 6 — Verify the complete demo seam

Automated:

- extension typecheck and build;
- focused reducer, protocol, host, controls, background, capture, manifest, and disclosure tests;
- full test suite;
- repo-local diff coverage against `origin/trunk`, with 100% changed line and branch coverage.

Manual Chrome checklist:

1. Load the unpacked extension.
2. Open a normal HTTP(S) prototype and start **This tab**.
3. Confirm the setup popup yields focus to the captured tab after countdown.
4. Confirm toolbar, transcript chip, and camera surface are visible in the real tab.
5. Navigate within the app and confirm the controls persist or reinject.
6. Draw, add an arrow, box, text, and pin; confirm the page remains interactive in pointer mode.
7. Pause, resume, undo, clear, and finish.
8. Confirm the overlay disappears, review opens, media plays, marks align, agent payload contains DOM targets, and the recording appears in the local library.
9. Deny optional site access and verify the current page still records with a clear cross-origin warning.
10. Smoke-test Window and Entire screen capture for regression.

## Explicitly deferred

- Desktop-wide transparent annotation windows.
- Production offscreen recorder migration.
- Hosted uploads, share URLs, transcription, thumbnails, and processing.
- Backend schema and APIs owned by Pranav.
- Live mode.
