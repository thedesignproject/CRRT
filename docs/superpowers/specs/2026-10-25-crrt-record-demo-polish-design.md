# CRRT Record demo polish: temporal marks, camera controls, and agent preview

**Date:** 2026-10-25

**Status:** Approved

**Owner:** Tomás (frontend)

**Scope:** Frontend demo behavior for CRRT Record. Production entitlements and billing remain backend work owned by Pranav.

## Outcome

The CRRT Record demo must be presentable as a coherent Loom-like flow:

- annotations help explain one moment without remaining stuck over the page;
- the camera bubble can be resized or hidden during recording without stopping the camera track;
- the local review always exposes the structured agent payload and can copy it without authentication;
- production can later enforce the paid agent capability at the backend boundary without changing the demo interaction.

The recording, marks, transcript, and agent payload remain honest. No placeholder transcript or invented agent context is introduced.

## Considered approaches

### A. Temporal presentation over permanent capture (selected)

Store every completed annotation in the recording model, but show it on the live page only for three seconds. Reconstruct the same temporal visibility during playback. Camera presentation state is local UI state. The local demo opens the agent preview directly.

This matches Loom's lightweight recording experience while preserving CRRT's structured capture advantage.

### B. Clear annotations whenever the page scrolls

This would remove the immediate obstruction, but marks could disappear unexpectedly during small layout shifts and the recording/playback rules would be inconsistent. Rejected.

### C. Keep annotations until the user manually clears them

This is the current behavior. It overloads the screen, makes scrolling confusing, and forces the user to manage cleanup while speaking. Rejected.

## Temporal annotation behavior

Draw, Arrow, Box, and Text share one presentation rule:

1. The draft is visible immediately while the pointer gesture is active.
2. On completion, the mark is stored immediately with its existing timestamp and DOM target.
3. The completed mark remains visible for `3,000ms` from its recording timestamp.
4. It fades out over `250ms` and no longer intercepts or obscures the page.
5. It remains in session state, local persistence, timeline markers, transcript alignment, and the agent payload.

The live surface renders only marks inside the active visibility window; it must not render the entire stored mark array indefinitely. Playback applies the same time rule from the video playhead, so seeking to a mark makes it visible and moving beyond its window hides it.

Undo removes the newest stored mark even if it has already faded visually. Clear removes all stored marks, timeline markers, and agent-payload references. Fading never deletes data.

All temporal logic lives in a shared pure helper so live capture and playback cannot drift. Tests use a deterministic clock rather than real timeouts.

## Camera bubble

The camera bubble remains draggable only if the current implementation already supports drag; dragging is not required for this polish. It gains direct, discoverable controls:

- clicking or hovering the bubble reveals a compact adjacent menu;
- three size choices: Small (`72px`), Medium (`112px`, default), and Large (`160px`);
- a Hide camera action;
- hiding removes only the preview from the recording surface and does not stop or discard the camera track;
- after hiding, a camera icon appears in the recording toolbar so the preview can be restored in one click;
- the chosen size persists for the current recording and is used by the local review camera overlay.

The menu must not be captured as a mark, must not activate drawing, and must have keyboard-accessible controls, labels, focus styles, and tooltips.

## Local agent preview

The **For agents** tab always opens in the local demo. It does not call `extensionSession()` and does not open the authentication popup.

The panel includes:

- the generated payload from the actual local recording;
- actual transcript segments when transcription succeeded;
- a clear transcript-unavailable state when transcription failed;
- actual marks, timestamps, and DOM targets;
- **Copy for Claude Code**, which copies the visible payload;
- a small `Demo preview` note explaining that production use is a paid capability.

Authentication and billing are applied later when the production client requests a hosted/shareable agent payload. The frontend may display entitlement status, but it must not be the security boundary. Pranav's backend will own that enforcement.

The transcript tab stays available without login. Failed transcription never disables the agent tab: the payload can still include the recording metadata and marks while stating that no transcript is available.

## State boundaries

- Stored recording state owns marks and media.
- Presentation state owns mark visibility, camera bubble size, and camera preview visibility.
- Authentication state does not gate local transcript or local agent-preview rendering.
- Production entitlement state will gate the server-backed agent/share operation, not access to locally generated demo data.

No fake transcript, fake account, or client-only production billing gate is added.

## Error behavior

- If camera preview permission fails, recording controls remain usable and the camera bubble stays hidden.
- If the camera preview is hidden, the recorded camera stream continues unless the user explicitly disables camera before recording.
- If transcription fails, review explains the real error and still permits viewing/copying the mark-only agent payload.
- If clipboard permission fails, the copy button reports failure and remains retryable.
- A navigation or scroll does not reset stored marks; only their three-second visual presentation expires.

## Verification

Automated coverage must prove:

- all four annotation types are visible at creation time and hidden after `3,000ms` plus fade;
- faded marks remain in recording state and generated payload;
- playback uses the same visibility helper as live capture;
- Undo and Clear operate on stored marks, not only visible marks;
- camera size changes among Small, Medium, and Large;
- Hide removes the bubble and the toolbar action restores it;
- hiding the preview does not toggle or stop the camera capture state;
- For agents opens without an extension session in local demo;
- Copy for Claude Code copies the actual generated payload;
- failed or missing transcripts do not block the agent panel;
- extension typecheck, tests, and production build pass.

Manual acceptance:

1. Start a This tab recording with camera and microphone.
2. Draw, scroll, and confirm the drawing fades after three seconds instead of following the viewport indefinitely.
3. Repeat with Arrow, Box, and Text.
4. Resize the camera to all three sizes, hide it, and restore it from the toolbar.
5. Finish the recording and seek to each timeline marker; confirm the matching annotation appears briefly.
6. Open For agents while signed out and copy the payload.
7. Confirm the copied payload contains only actual recording data and remains usable when transcription is unavailable.

## Deferred

- Hosted/shareable recording persistence.
- Production agent entitlements and billing enforcement.
- Backend transcription reliability and provider configuration.
- Cross-application controls for native Window and Entire screen capture.
- More camera positions, freeform resizing, and camera effects.
