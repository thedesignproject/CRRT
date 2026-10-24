# CRRT Record V1

**Date:** October 24, 2026
**Status:** Approved product architecture; Monday frontend demo slice ready for implementation
**Linear:** TDP-5958

## Summary

Add **Record** as a first-class CRRT product pillar beside Widget. Record feels like Loom to people: capture a browser tab, window, or entire screen with microphone and camera, annotate while talking, and get a shareable playback link. The same capture is structured for coding agents through synchronized transcript segments, event keyframes, marks, DOM targets when available, and project instructions.

The production V1 is asynchronous. Live mode is phase 2 of the same feature.

## Product boundaries

- The Chrome extension owns the recorder. Widget and dashboard are launchers into the same recorder.
- A recording is a separate aggregate, not a comment or a large carrot.
- A recording contains marks and keyframes but does not create carrots automatically.
- Recordings are personal by default and may later be linked to a project.
- Recording and human sharing are free within product limits.
- Agent payloads, project instruction/Brain enrichment, and Live mode are paid and enforced by the backend.
- Viewers do not need the extension. Authors do.
- Authorized tab capture includes DOM targets. Window and entire-screen capture fall back to pixels, coordinates, and crops.

## Production V1 experience

### Entry points

- Extension toolbar and configurable keyboard shortcut.
- **New recording** in the dashboard Recordings library.
- **Record** in the Widget composer.
- Dashboard and Widget show an extension installation CTA when the recorder is unavailable; they do not implement a second in-page recorder.

### Recorder

- Source selection: This tab, Window, or Entire screen.
- Microphone and camera selection with explicit permission state.
- Three-second countdown.
- The setup surface closes or moves out of the way when capture starts. It is not the surface where the author annotates.
- Visible recording state, timer, pause, resume, restart, and Done remain with the author on the recorded browser surface.
- Camera bubble and a best-effort live transcript chip remain visible while recording in Chrome.
- Draw, Arrow, Box, Text, Pin, Undo, and Clear.
- Marks stored as structured events on a shared monotonic timeline.
- Event keyframes on marks, clicks, and route changes.
- Tab-mode events include selector, route, viewport, scroll position, target bounds, normalized coordinates, and component metadata when available.
- Window/screen events include normalized coordinates and capture dimensions without claiming DOM context.

### Loom-style surface behavior

**This tab** is the complete CRRT experience. After the countdown, the extension injects an isolated recording surface into the captured tab. It contains the fixed bottom toolbar, movable camera bubble, transcript chip, and a full-viewport annotation layer. The user talks, navigates, and marks the real page rather than a duplicate video preview. Marks resolve DOM context at the time they are created.

The tab experience survives same-origin reloads, history changes, and SPA route changes. To preserve it across cross-origin navigation in the same tab, CRRT requests optional site access when the recording starts. The permission explanation is: **“CRRT needs access to the pages you record so controls and DOM context remain available while navigating.”** Denying the permission does not prevent recording the current authorized page, but CRRT warns that controls and DOM context will stop if the tab navigates to a different origin.

**Window** uses the same injected surface while the author remains in an authorized Chrome tab. If the selected window is another application, the extension records it but cannot inject controls, camera, or annotations into that application.

**Entire screen** records the selected monitor and keeps controls available while the author is working in an authorized Chrome tab. A Chrome extension does not claim to place an interactive transparent layer over arbitrary macOS or Windows applications. That capability requires a future desktop application.

Tab capture records the injected controls and marks because they are rendered inside the captured surface. Window and entire-screen capture record them whenever the authorized Chrome tab is visible within the selected surface. Marks are also persisted as structured events. The controls can collapse to a compact recording pill; V1 does not selectively remove them from raw capture or claim to display them over an external application.

### Completion and sharing

- Done creates and copies a link before background processing finishes.
- Upload and processing states remain visible at that link.
- The share page contains synchronized screen video, face camera, timeline markers, transcript, keyframes, marks, targets, and metadata.
- The dashboard contains a dedicated Recordings library.
- The paid **For agents** view creates a deterministic compact payload for Claude Code, Codex, and future consumers.

## Architecture

### Frontend ownership — Tomás

- WXT extension recorder and capture adapters.
- Offscreen media lifetime and MediaRecorder orchestration.
- Camera, microphone, screen/tab streams, and synchronization.
- Overlay, tools, event clock, selector capture, and keyframe requests.
- Local durable staging and direct resumable upload client.
- Dashboard and Widget launchers.
- Recordings library, share player, transcript, and For agents presentation.
- Mock backend adapter for the Monday demo.

### Extension recording surfaces

The frontend is divided into three isolated units:

1. **Setup and review page:** selects source and devices before capture and shows the local result afterward. It no longer hosts the annotation experience for tab recordings.
2. **Tab recording surface:** an extension-origin iframe inside a closed Shadow DOM, following the existing private comment-frame pattern. The host-side script owns page hit testing and DOM anchoring; the private frame owns recording UI and annotation state so host styles and scripts cannot inspect private content.
3. **Recorder controller:** a long-lived extension context that owns capture streams and `MediaRecorder`. The frontend demo keeps the existing recorder page as the controller, moves it behind the selected tab after startup, and returns to it for review after Done. Production replaces that page with an MV3 offscreen document without changing the controller protocol. Navigation must not terminate media capture.

The background service worker owns the session registry and routes typed messages between the controller and the currently mounted tab surface. Recording state uses a session ID and revision so a stale page or reinjected frame cannot pause or finish another recording.

The existing comment widget and the recording surface use separate hosts, frames, message namespaces, and teardown lifecycles. Starting Record must not activate comment mode, and closing the comment widget must not affect an active recording.

### Backend ownership — Pranav

- Recording schema and generated migrations.
- Recording lifecycle, authorization, and project attachment APIs.
- Signed resumable upload contracts and private artifact storage.
- Upload finalization, cleanup, and deletion lifecycle.
- Durable processing, thumbnails, speech-to-text adapter, and transcript alignment.
- Human share capability and signed playback URLs.
- Agent payload generation, project instruction/Brain enrichment, entitlements, and billing enforcement.

### Shared contract

Frontend and backend agree on these before production integration:

- Recording lifecycle states and retryable error codes.
- Capture manifest and artifact metadata.
- Mark, click, route, and keyframe event types.
- Monotonic timestamp semantics, pause/resume behavior, and media offsets.
- Create, authorize upload, finalize, fetch, share, attach-to-project, and agent-payload endpoints.
- Entitlement and capability responses.

## Capture decisions

- Use Chrome tab capture for **This tab** after an explicit extension action.
- Use display media for **Window** and **Entire screen**, accepting the browser picker on every start.
- Keep the long-lived recorder in an offscreen extension document.
- Emit bounded media chunks and stage them durably; never require the full recording to remain in memory.
- Prefer separately synchronized screen and camera tracks for V1 playback so the camera remains an independent bubble. Validate this choice in the capture spike against composition reliability and pause/resume behavior.
- Include microphone audio once on the main recording timeline.
- Preserve the existing isolated Shadow DOM/private-frame security boundary for recorder controls.
- Declare HTTP(S) site access as optional rather than persistent host access. Request it in the explicit recording gesture and only for the recording experience.
- Reinject the tab surface after authorized navigations and restore the latest controller state. If access is unavailable after navigation, continue media capture, surface a recoverable warning from the controller, and omit DOM context until an authorized page is active again.

## Storage and processing decisions

- Upload video directly to dedicated private object storage using signed resumable uploads; serverless API handlers do not proxy video bytes.
- Keep immutable artifact paths and idempotent finalization.
- Preserve uploaded media when transcription or derivation fails so individual stages can retry.
- Reuse the repo's durable workflow patterns for independent processing stages.
- Use hosted speech-to-text behind a provider adapter for the authoritative transcript.
- Browser SpeechRecognition may provide a best-effort local preview, but it is not the production source of truth.
- Auto-title remains deterministic and editable until CRRT deliberately approves a model-backed title service.

## Monday frontend demo slice

The Monday demo proves the product and integration shape without pretending the backend exists.

### Required

- A CRRT Record entry in the extension UI.
- Source chooser for This tab, Window, and Entire screen.
- Working browser capture with microphone and optional camera.
- Countdown and recorder controls.
- A polished overlay injected into the recorded tab, demonstrating Draw, Arrow, Box, Text, and Pin while the user navigates the actual page.
- Structured event timeline and DOM targets for tab mode.
- Done transitions into a local processing simulation.
- A local Recordings library populated by demo captures or deterministic fixtures.
- A share-page/player experience with timeline markers and transcript/keyframe fixtures.
- A For agents tab that renders the approved payload shape from local structured data.
- Dashboard and Widget launcher states, including the extension-missing CTA.

### Explicitly mocked or local-only

- User-scoped server persistence.
- Cross-device share URLs.
- Resumable cloud uploads.
- Hosted transcription and alignment.
- Private signed playback.
- Billing enforcement and entitlements.
- Project attachment persistence and Brain enrichment.

The demo must visibly label processing/demo states where necessary and must not imply that a local URL can be shared across devices.

## Demo acceptance seam

The highest-value demo flow is:

1. Launch Record from the extension.
2. Choose a capture source, microphone, and camera.
3. Return automatically to the selected tab and record a short checkout walkthrough without using a separate preview as the annotation surface.
4. Navigate the real page while the bottom toolbar remains present, then add at least one drawing, one pin, and one DOM-aware mark.
5. Finish the recording.
6. Open the local share experience.
7. Seek through transcript/keyframe markers.
8. Open **For agents** and copy a compact payload containing timestamps, frames, spoken context, and targets.
9. Return to the Recordings library and find the capture.

## Verification strategy

- Put browser media APIs behind a narrow adapter so unit tests use deterministic streams and browser validation uses the real APIs.
- Test the externally visible recorder state machine: permission, countdown, recording, pause, resume, finalizing, processing, ready, and failure.
- Test mark geometry and timestamps independently of rendering internals.
- Test controller-to-frame commands, session/revision rejection, reinjection after an authorized navigation, and cleanup after Done, cancellation, tab close, and permission loss.
- Verify that the recording surface remains isolated from hostile host CSS and that hit testing never blocks the page outside visible controls or an active drawing gesture.
- Reuse existing selector, native screenshot, hosted-auth, extension frame, prompt, and dashboard route seams.
- Add a single browser-level happy-path demo test where automation allows it, with a documented manual check for native capture pickers.
- Require diff line and branch coverage against the branch base before handoff.

## Risks and mitigations

- **Native picker automation:** keep capture behind an adapter and maintain a short manual demo checklist.
- **Widget-to-extension activation:** spike the Chrome user-gesture boundary before promising one-click start; fall back to a clear shortcut/toolbar instruction when the platform blocks direct invocation.
- **Large local media:** cap the Monday demo duration and use bounded chunks rather than a monolithic in-memory blob.
- **Camera synchronization:** use a shared monotonic start and exercise pause/resume with real devices.
- **Host-page interference:** keep controls isolated and pointer behavior explicit.
- **Cross-origin navigation:** request optional site access at recording start; continue capture with a visible degraded-state warning when access is denied or revoked.
- **MV3 lifecycle:** keep capture outside the service worker and make injected surfaces disposable clients of the durable recording session.
- **External applications:** label Window and Entire screen honestly; arbitrary desktop overlays remain a desktop-app capability rather than a hidden extension requirement.
- **Misleading backend readiness:** separate local demo adapters from production API contracts and label non-shareable local results.

## Phase 2: Live mode

Live mode reuses the same events and timestamps but streams partial transcript segments, keyframes, and marks to an active coding agent while capture continues. It adds transport choice, reconnection, ordering, agent session lifecycle, and partial transcription. It is intentionally excluded from the production V1 critical path.

## Production estimate

After the frontend demo and shared contract are validated, frontend and backend can proceed in parallel. The production-quality asynchronous V1 remains approximately six to nine calendar weeks, subject to the transcription, privacy, storage, and Chrome Web Store decisions recorded in TDP-5958.
