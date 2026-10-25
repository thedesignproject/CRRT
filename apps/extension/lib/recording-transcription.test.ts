import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('./recording-transcription-api', () => ({ transcribeRecording: vi.fn() }))
import { transcribeRecording } from './recording-transcription-api'
import { withRecordingTranscript } from './recording-transcription'
import type { LocalRecording } from './recording'

const recording = (audioBlob?: Blob): LocalRecording => ({
  id: 'r', title: 'Review', source: 'tab', status: 'processing', durationMs: 1_000,
  createdAt: 'now', authorName: 'Tomás', marks: [], transcript: [], transcriptionStatus: 'processing', audioBlob,
})

beforeEach(() => vi.mocked(transcribeRecording).mockReset())

it('marks audio-free recordings as a successful silent capture', async () => {
  await expect(withRecordingTranscript(recording())).resolves.toMatchObject({ status: 'ready', transcriptionStatus: 'ready', transcript: [] })
  expect(transcribeRecording).not.toHaveBeenCalled()
})

it('stores normalized provider segments on success', async () => {
  vi.mocked(transcribeRecording).mockResolvedValue({ source: 'deepgram:nova-3', language: 'es', segments: [{ id: 's', startMs: 0, endMs: 1, text: 'Hola' }] })
  await expect(withRecordingTranscript(recording(new Blob(['audio'])))).resolves.toMatchObject({
    status: 'ready', transcriptionStatus: 'ready', transcript: [{ text: 'Hola' }], transcriptionError: undefined,
  })
})

it('keeps the recording ready and exposes a retryable stable failure', async () => {
  vi.mocked(transcribeRecording).mockRejectedValueOnce(new Error('Provider unavailable'))
  await expect(withRecordingTranscript(recording(new Blob(['audio'])))).resolves.toMatchObject({ status: 'ready', transcriptionStatus: 'failed', transcriptionError: 'Provider unavailable', transcriptionErrorCode: 'request-failed' })
  vi.mocked(transcribeRecording).mockRejectedValueOnce('unknown')
  await expect(withRecordingTranscript(recording(new Blob(['audio'])))).resolves.toMatchObject({ transcriptionError: 'CRRT could not transcribe this recording.', transcriptionErrorCode: 'request-failed' })
})
