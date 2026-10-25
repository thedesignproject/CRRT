# CRRT Record integrated launcher and compact controls

**Date:** 2026-10-25  
**Status:** Awaiting written-spec review  
**Owner:** Tomás (frontend)  
**Scope:** Local frontend demo; no backend upload, hosted transcription, billing, or share persistence.

## Outcome

CRRT Record should begin like Loom: opening Record mode renders the recording setup inside the current page. The user selects the capture source, camera, and microphone without leaving their work. Starting a **This tab** recording transforms that launcher into a compact bottom toolbar in the same tab. A separate extension page appears only after completion, for review and agent handoff.

This revision also removes the intermittent multi-click behavior. Controls must respond on the first click while the underlying page remains fully interactive whenever no drawing tool is active.

## Entry behavior

Clicking the CRRT extension mounts one unified in-page launcher in the active HTTP(S) page. It preserves the existing feedback product and adds Record as a peer mode; Record does not replace comments, project selection, or authentication. The launcher header exposes compact **Feedback** and **Record** modes and remembers the last mode used. The dedicated recording shortcut and the widget's Record action open the same launcher directly in Record mode.

Record mode contains:

- **This tab**, **Window**, and **Entire screen** capture choices.
- Camera and microphone toggles.
- A primary **Start recording** action.
- A close action that removes the surface without creating a recording.

The launcher is an in-page floating panel, not a separate configuration window. Browser-native capture and permission prompts may still appear when required by Chrome. Restricted pages such as `chrome://` cannot host the launcher and receive an explicit unsupported-page message from the extension popup.

For Window and Entire screen, the launcher remains in the initiating browser tab. CRRT can record the selected surface but cannot place controls above unrelated native applications. This limitation must be stated honestly; only This tab is DOM-aware and carries the integrated annotation surface.

## Recording toolbar

After the three-second countdown, the launcher collapses into one compact bottom toolbar:

`×  ● 0:05  pause  restart  |  Draw  Arrow  Box  Text  |  undo  clear  |  Done`

Visual hierarchy:

- **Draw**, **Arrow**, **Box**, and **Text** use an icon plus a text label.
- Cancel, Pause/Resume, Restart, Undo, and Clear use icons only, each with an accessible label and tooltip.
- **Done** keeps its label and remains the primary action.
- Undo and Clear stay directly beside the annotation tools because they modify those marks.
- Pin and Point are removed from the visible toolbar.

Interaction rules:

- No annotation tool is active by default; the page behaves normally.
- Selecting Draw, Arrow, Box, or Text activates annotation mode.
- Clicking the active tool again, pressing `Escape`, or completing a Text mark returns to navigation mode.
- Restart remains visible. It asks for confirmation, clears the current media and marks, and starts a fresh countdown using the current source/camera/microphone settings.
- Cancel uses an `×` icon and asks for confirmation before discarding the entire recording.
- Clear removes every visual mark but does not affect the captured media or transcript.
- Undo removes only the newest mark.
- Done stops capture once, removes the in-page surface, and opens review.

## Component architecture

### Page host

Replace the full-viewport extension iframe used for interaction with a content-script-owned Shadow DOM host. React renders the launcher, annotation layer, camera bubble, transcript preview, and toolbar directly into this closed shadow root.

The host root uses `pointer-events: none`. Individual interactive controls use `pointer-events: auto`. The full-viewport annotation layer uses `pointer-events: auto` only while Draw, Arrow, Box, or Text is active. This removes coordinate hit-testing and asynchronous pointer routing through the service worker.

The page host owns:

- launcher and toolbar rendering;
- pointer capture and draft mark rendering;
- keyboard handling, including Escape;
- DOM target resolution under a completed mark;
- immediate visual state for tool selection and toolbar actions.

### Offscreen recording controller

Move media ownership out of the visible recorder window and into one MV3 offscreen document. The manifest adds the `offscreen` permission. The document is created on demand with the `USER_MEDIA`, `DISPLAY_MEDIA`, and `BLOBS` reasons and closes after the session is saved or discarded.

For This tab, the service worker obtains a `tabCapture.getMediaStreamId()` after the user invokes Record and sends it to the offscreen document. Chrome 116+ explicitly supports consuming that service-worker stream ID in an offscreen document. For Window and Entire screen, the offscreen document uses `getDisplayMedia()`, allowing Chrome's native picker while keeping the recorder alive across navigation.

The offscreen controller owns media streams, MediaRecorder instances, elapsed time, finalized blobs, local persistence, and the review transition. The background service worker remains the transport between controller and page host, but it no longer decides whether a click should reach an iframe.

Commands remain session-scoped and idempotent:

- start;
- pause/resume;
- restart;
- annotation tool changed;
- mark added;
- undo;
- clear;
- finish;
- cancel.

Every session has one active host and one controller. Stale messages from a previous session are ignored.

### Shared UI

The setup panel must be implemented as a shared React component so the extension popup fallback and in-page launcher do not drift. The primary path is always the integrated page launcher. The separate recorder page retains only controller/review responsibilities and restricted-page fallback copy.

## State and data flow

1. User invokes Record from the extension, shortcut, or widget.
2. Background verifies that the active page supports injection and creates a setup session.
3. Background injects the Shadow DOM host and synchronizes initial setup state.
4. User chooses source, camera, and microphone in the floating launcher.
5. Start asks background to ensure the offscreen controller exists and requests the required browser permissions from that user gesture.
6. Background obtains the tab stream ID or opens Chrome's display picker; the offscreen controller acquires streams and begins the three-second countdown.
7. For This tab, the launcher collapses into the recording toolbar and the page remains focused.
8. Marks are rendered immediately in the page host, resolved to DOM context, and synchronized to the controller.
9. Done finalizes media once, tears down the host, persists the local recording, and opens review.
10. Cancel tears down streams and host without creating a recording.

## Reliability and error behavior

- Toolbar actions acknowledge visually on pointer down/click and cannot be submitted twice while pending.
- Failed background commands restore the previous UI state and show a compact inline warning.
- Losing the controller keeps the page usable and presents a reconnect/discard message.
- Navigation reinjects the host when site access permits it. Otherwise capture continues with a warning that controls and DOM context are unavailable.
- If capture ends from Chrome's native sharing indicator, CRRT finalizes safely when recording or returns to setup when still counting down.
- Restart and Cancel always require confirmation; Done does not.
- Camera or microphone denial disables only that source when possible instead of failing the entire recording.

## Accessibility

- Every icon-only action has `aria-label`, tooltip text, focus styles, and a minimum 40px hit target.
- Keyboard order follows the visual order.
- Escape exits annotation mode before it can trigger recording cancellation.
- Confirmation dialogs trap focus and return it to their initiating control.
- Recording, paused, error, and countdown states are announced through an appropriate live region.

## Verification

Automated coverage includes:

- setup launcher mounting and teardown;
- first-click behavior for every toolbar action;
- page click-through in navigation mode;
- annotation interception only in active tool mode;
- active-tool toggle and Escape behavior;
- Restart, Cancel, Clear, Undo, and Done semantics;
- duplicate command suppression and stale-session rejection;
- restricted page and permission failure behavior;
- extension build, typecheck, full test suite, and 100% changed line/branch coverage.

Manual Chrome acceptance:

1. Click the extension while viewing a normal HTTP(S) page.
2. Confirm the launcher appears inside that page without opening a setup window.
3. Start This tab and confirm the launcher collapses into the toolbar after countdown.
4. Verify each control responds on its first click.
5. Navigate the page with no tool active.
6. Draw, Arrow, Box, and Text; verify Escape returns to navigation.
7. Verify Undo and Clear affect only marks.
8. Verify Restart begins a clean countdown after confirmation.
9. Verify Cancel discards after confirmation.
10. Verify Done opens review with playable local media and structured marks.

## Deferred

- Desktop-wide annotation overlays for Window and Entire screen.
- Hosted upload, real transcription, share URLs, entitlements, and billing.
- Pin, Zoom, live mode, and collaborative timestamp comments.

## Technical references

- [Chrome tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Chrome audio recording and screen capture guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)
- [Chrome offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
