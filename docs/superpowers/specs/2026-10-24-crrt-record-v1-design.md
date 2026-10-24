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
- Tab capture may include DOM targets. Window and entire-screen capture fall back to pixels, coordinates, and crops.

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
- Visible recording state, timer, pause, resume, restart, and Done.
- Camera bubble.
- Draw, Arrow, Box, Text, Pin, Undo, and Clear.
- Marks stored as structured events on a shared monotonic timeline.
- Event keyframes on marks, clicks, and route changes.
- Tab-mode events include selector, route, viewport, scroll position, target bounds, normalized coordinates, and component metadata when available.
- Window/screen events include normalized coordinates and capture dimensions without claiming DOM context.

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
- A polished overlay demonstrating Draw, Arrow, Box, Text, and Pin.
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
3. Record a short checkout walkthrough.
4. Add at least one drawing, one pin, and one DOM-aware mark.
5. Finish the recording.
6. Open the local share experience.
7. Seek through transcript/keyframe markers.
8. Open **For agents** and copy a compact payload containing timestamps, frames, spoken context, and targets.
9. Return to the Recordings library and find the capture.

## Verification strategy

- Put browser media APIs behind a narrow adapter so unit tests use deterministic streams and browser validation uses the real APIs.
- Test the externally visible recorder state machine: permission, countdown, recording, pause, resume, finalizing, processing, ready, and failure.
- Test mark geometry and timestamps independently of rendering internals.
- Reuse existing selector, native screenshot, hosted-auth, extension frame, prompt, and dashboard route seams.
- Add a single browser-level happy-path demo test where automation allows it, with a documented manual check for native capture pickers.
- Require diff line and branch coverage against the branch base before handoff.

## Risks and mitigations

- **Native picker automation:** keep capture behind an adapter and maintain a short manual demo checklist.
- **Widget-to-extension activation:** spike the Chrome user-gesture boundary before promising one-click start; fall back to a clear shortcut/toolbar instruction when the platform blocks direct invocation.
- **Large local media:** cap the Monday demo duration and use bounded chunks rather than a monolithic in-memory blob.
- **Camera synchronization:** use a shared monotonic start and exercise pause/resume with real devices.
- **Host-page interference:** keep controls isolated and pointer behavior explicit.
- **Misleading backend readiness:** separate local demo adapters from production API contracts and label non-shareable local results.

## Phase 2: Live mode

Live mode reuses the same events and timestamps but streams partial transcript segments, keyframes, and marks to an active coding agent while capture continues. It adds transport choice, reconnection, ordering, agent session lifecycle, and partial transcription. It is intentionally excluded from the production V1 critical path.

## Production estimate

After the frontend demo and shared contract are validated, frontend and backend can proceed in parallel. The production-quality asynchronous V1 remains approximately six to nine calendar weeks, subject to the transcription, privacy, storage, and Chrome Web Store decisions recorded in TDP-5958.
