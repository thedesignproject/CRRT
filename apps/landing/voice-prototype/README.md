# Voice comments — landing-page prototype

Run `bun run dev:landing` and open **http://localhost:5175/?stay=1&voice=1**.
This opt-in mode runs the actual feedback widget with a voice composer and in-memory
comments. It is a prototype for engineer review, not an npm release.

## Review the flow

1. Open the carrot menu and choose **Drop comment** (or press **C**).
2. Select any element on the landing page. The product's selector, anchored popover,
   screenshot capture, and selected-text quotes work as usual. There is no fixed
   composer location or screenshot fixture.
3. Click the microphone and grant browser permission. The inline recorder shows
   elapsed time and a live waveform; the toolbar microphone stays orange.
4. Check attaches the take to the draft; it does **not** post. X discards the take
   while preserving typed feedback. Recordings stop automatically after two minutes.
5. Review playback, optionally add text, and Send. Audio-only comments work too.
6. Click the resulting pin or open the sidebar to listen and expand the transcript.
   Select another element to leave another comment; existing comments stay in this tab.

## Transcription

`transcription.ts` uses SpeechRecognition / webkitSpeechRecognition alongside the
MediaRecorder session. The transcript contains the words recognized during that
recording, not sample copy. It waits briefly for final words after Check and retains
partial text if the speech service stops early. Unsupported, blocked, and failed
transcription are explicit states; audio remains playable.

**The browser may process speech through its vendor's remote recognition service.**
Support depends on the browser and network; Chrome with microphone permission is a
useful manual test target. This is live transcription, not a backend that retranscribes
saved audio files. Production should transcribe uploaded audio so results and retries
are independent of the recording browser.

## Implementation and boundaries

- `VoiceCommentPrototype.tsx`: voice composer/player and a local `PersonalComments`
  adapter. Reuses the actual `FeedbackWidget`, its selection and screenshot pipeline,
  anchored popovers, pins, editing/deletion, review list, and avatar/quote/font helpers.
- The widget's internal `prototype` rendering seam substitutes only the composer and
  comment body. Default widget rendering remains available without the opt-in prop.
- Uses the shared design-system `Button` and widget `--fw-*` semantic colors.
- `recording.ts`: real MediaRecorder capture and Web Audio levels. Uses the browser's
  default audio format and retains its MIME type.
- Source design: https://app.paper.design/file/01M6C78TCH1NGCMC704QGRQWWK/p-1-0

Comments, screenshots, and recorded audio are stored in memory. Refresh loses them.
The reviewer identity is mocked. There are no comment API writes or audio uploads by
this prototype. Recording streams are released on cancel/unmount; audio URLs survive
composer unmount after Send and are released when deleted or the prototype unmounts.

Before shipping: add authorized attachment storage/upload/retry, a comment audio data
model, retention rules, server transcription and retries, and cross-browser/device
validation. Changes to the published widget require the version/changelog/npm release
workflow in AGENTS.md; this prototype has not been published.

## Chromatic

The PR workflow captures the composer, active recording, attached audio (desktop
and mobile), expanded transcript, and blocked-microphone error. These six new
snapshots use deterministic browser-device fixtures and the real prototype UI.
Review new baselines manually in the Chromatic link posted on the PR.

## Verification

- `bunx vitest run apps/landing/voice-prototype apps/landing/App.audit-route.test.tsx`
- `bun run typecheck`
- `VITE_USE_MOCKS=0 bun run test:coverage` (overrides the workspace's dashboard demo flag)
- `bun run test:diff-coverage -- origin/trunk`
- `bun run build:landing`

Integration tests use the real widget to select multiple elements, capture screenshots,
create/reopen voice pins, review transcripts in the sidebar, edit text, and delete takes.
Adapter tests exercise real-shaped speech results and lifecycle/error paths. Automated
browser recording checks use a synthetic microphone; a physical-microphone smoke test
is needed to confirm the browser vendor's live speech service in your environment.
