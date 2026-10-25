import type { RecordingTranscriptSegment } from './recording'

type TranscriptResponse = {
  transcript: {
    source: string
    language: string
    segments: RecordingTranscriptSegment[]
  }
}

export class RecordingTranscriptionClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecordingTranscriptionClientError'
  }
}

function validSegment(value: unknown): value is RecordingTranscriptSegment {
  if (!value || typeof value !== 'object') return false
  const segment = value as Partial<RecordingTranscriptSegment>
  return typeof segment.id === 'string'
    && typeof segment.text === 'string'
    && segment.text.trim().length > 0
    && Number.isFinite(segment.startMs)
    && Number.isFinite(segment.endMs)
    && Number(segment.startMs) >= 0
    && Number(segment.endMs) >= Number(segment.startMs)
}

function parseTranscript(value: unknown): TranscriptResponse['transcript'] {
  const transcript = (value as Partial<TranscriptResponse> | null)?.transcript
  if (!transcript || typeof transcript.source !== 'string' || typeof transcript.language !== 'string'
    || !Array.isArray(transcript.segments) || !transcript.segments.every(validSegment)) {
    throw new RecordingTranscriptionClientError('CRRT returned an invalid transcript.')
  }
  return { ...transcript, segments: transcript.segments.map((segment) => ({ ...segment, text: segment.text.trim() })) }
}

export async function transcribeRecording(audio: Blob) {
  if (!audio.size) return { source: 'none', language: 'und', segments: [] }
  const response = await fetch(`${import.meta.env.WXT_API_BASE.replace(/\/$/, '')}/v1/extension/recordings/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: audio,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new RecordingTranscriptionClientError(payload.error || `Transcription failed (${response.status}).`)
  }
  return parseTranscript(await response.json())
}
