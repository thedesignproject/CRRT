# CRRT Record — minimal transcription backend

## Decision

CRRT Record will transcribe the microphone audio already captured by the extension. It will not use the browser `SpeechRecognition` API and will not acquire the microphone a second time.

The first implementation is intentionally synchronous and local-first: the finished recording remains in extension IndexedDB, while a small audio-only derivative is sent to an authenticated CRRT endpoint and returned as normalized timestamped segments. There are no recording tables, remote video storage, background jobs, or live transcription in this slice.

Deepgram Nova-3 multilingual is the initial provider because its pre-recorded endpoint accepts WebM, supports mixed Spanish/English speech, and returns word/utterance timestamps. The provider stays behind a small server adapter so Pranav can replace or extend it without changing the extension contract.

## Product behavior

1. The user starts Record and grants Chrome microphone/capture permission once.
2. The existing media pipeline records the screen video, mixed narration, and optional camera.
3. The same mixed audio track is also encoded as an audio-only WebM at 48 kbps. This is another encoder over the existing stream, not another microphone capture.
4. On **Done**, the toolbar enters `Processing` and prevents duplicate completion.
5. The offscreen controller stops all recorders and immediately saves the playable recording, audio derivative, and `processing` transcription state to IndexedDB. This protects the capture if the request or extension lifecycle is interrupted.
6. The controller requests the existing extension session through the background `auth:get` route and posts the audio-only WebM to CRRT.
7. CRRT authenticates the user, validates the extension origin and payload, sends the audio to the STT provider, and returns normalized transcript segments.
8. The extension updates the saved recording to `ready`, then opens the existing review page.
9. The review matches each transcript segment to only the nearest mark within the existing bounded threshold.

If transcription fails, CRRT updates and opens the already-saved recording. The review shows a specific failed state and a **Retry transcription** action. It never fabricates narration from marks or selectors. If the microphone was disabled or the captured audio track is empty, it skips the request and records a successful silent result.

## API contract

### Request

`POST /api/v1/extension/recordings/transcribe`

Headers:

```http
Authorization: Bearer <Supabase access token>
Content-Type: audio/webm
```

Body: raw audio-only WebM bytes.

Limits for this version:

- maximum recording length in the UI: 5 minutes;
- audio bitrate: 48 kbps;
- maximum request body: 4 MB;
- accepted media type: `audio/webm`;
- provider timeout: 45 seconds;
- no automatic provider retries inside the request.

The endpoint uses the existing extension-origin allowlist and `requireUser`. The shared CORS helper is extended to allow the `Authorization` header while retaining the exact-origin allowlist; it must not fall back to wildcard CORS. It never accepts a provider key from the client.

### Success response

```json
{
  "transcript": {
    "source": "deepgram:nova-3",
    "language": "multi",
    "segments": [
      {
        "id": "segment-1",
        "startMs": 4200,
        "endMs": 6800,
        "text": "Este botón no se lee bien."
      }
    ]
  }
}
```

Provider response shapes do not leave the server adapter. Times returned in seconds are converted to integer milliseconds and invalid/empty segments are dropped. Normalization prefers Deepgram utterances. If the provider returns transcript text without utterances, the adapter returns one segment spanning the reported audio duration; a genuinely empty transcript returns an empty segment list.

### Errors

- `400`: empty or malformed audio;
- `401`: missing or invalid user session;
- `403`: disallowed extension origin;
- `413`: audio exceeds 4 MB;
- `415`: unsupported content type;
- `502`: provider rejected or returned an invalid response;
- `503`: transcription is not configured;
- `504`: provider timeout.

Errors returned to the extension are stable product copy and do not expose provider response bodies, credentials, or internal request details.

## Server design

- `api/v1/extension/recordings/transcribe.ts`: HTTP boundary, CORS, authentication, size/type validation, status mapping. Vercel body parsing is disabled so the route reads raw bytes and aborts as soon as the 4 MB limit is crossed.
- `api/_lib/recording-transcription.ts`: provider-independent types, Deepgram request, response normalization, timeout.
- `api/_lib/extension-auth-http.ts`: allow authenticated extension requests to preflight `Authorization` without weakening the extension-origin check.
- `.env.example`: documents `DEEPGRAM_API_KEY` and optional `DEEPGRAM_API_BASE_URL` for tests/self-hosting.

Provider request:

```text
POST https://api.deepgram.com/v1/listen
  ?model=nova-3
  &language=multi
  &smart_format=true
  &utterances=true
```

The API key is sent as `Authorization: Token …` only from the server. The adapter uses native `fetch` and `AbortSignal.timeout`; no provider SDK is added.

No database or storage schema changes are required.

## Extension design

- `recording-capture.ts` returns `audioBlob` alongside `screenBlob` and `cameraBlob`.
- The audio recorder uses the existing mixed audio destination stream and pauses/resumes on the same commands as video.
- A focused `recording-transcription-api.ts` owns authentication lookup, request construction, response validation, and retry calls.
- `LocalRecording` gains `audioBlob`, `transcriptionStatus: 'processing' | 'ready' | 'failed'`, and optional `transcriptionError`. The small audio derivative remains in local IndexedDB to make an explicit retry possible; it is never synced independently.
- `recording-store.ts` keeps its single upsert operation: save once before the request, then save the same record ID again with the terminal transcription result.
- The offscreen controller removes all browser speech-recognition logic and performs one transcription request after capture stops.
- The review renders transcript rows only from server segments. A failed result renders Retry; a silent recording renders `No speech detected` without treating it as an error.

## Privacy and disclosure

The extension disclosure and store-listing documents must state that, after explicit recording consent, narration audio is sent to CRRT and its configured speech-to-text processor for transcription. They must remove the current claim that Chrome's speech service processes Record audio and the claim that recording media never uploads.

The video, camera, and retry copy of the audio blob remain local in this slice. Only the audio-only derivative is sent for transcription, and the endpoint does not persist it.

## Ownership

### Tomás / frontend

- capture the audio derivative from the existing stream;
- processing, failure, retry, and ready UI;
- local recording model and review rendering;
- extension API client;
- disclosure copy.

### Initial backend implementation, for Pranav to review

- authenticated raw-audio endpoint;
- provider adapter and normalization;
- request limits, timeout, and error mapping;
- server-side configuration.

Pranav can later replace the provider, add durable storage/jobs, or persist recording records while preserving the normalized endpoint response.

## Testing and acceptance

Unit tests cover:

- one microphone acquisition with parallel video/audio encoders;
- pause, resume, stop, and idempotent stop across every recorder;
- endpoint method, CORS, auth, media type, body limit, provider timeout, and error mapping;
- raw-body streaming stops at the payload limit and never attempts provider work for an oversized body;
- normalization of multilingual utterances and timestamp conversion;
- transcript-text fallback and silent-audio normalization;
- extension API success, session failure, malformed response, and retry;
- review states for ready, failed, silent, and retrying transcripts;
- removal of every generated/fake transcript path.

Acceptance test:

1. Record 20–30 seconds in Spanish and English.
2. Draw at least two marks while narrating.
3. Finish once and observe `Transcribing…`.
4. Confirm the saved video still contains the original voice.
5. Confirm the review contains the spoken narration in order with timestamps and no invented lines.
6. Confirm each transcript row shows only the nearest relevant mark.
7. Disable the provider key and confirm the recording remains playable with a retryable transcription error.

The repo must pass typecheck, the full test suite, extension production build, and 100% diff line and branch coverage against the PR base.

