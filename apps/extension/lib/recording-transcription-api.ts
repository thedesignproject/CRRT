import type { RecordingTranscriptSegment } from './recording'
import { extensionSession } from './comments-api'

type TranscriptResponse = {
  transcript: {
    source: string
    language: string
    segments: RecordingTranscriptSegment[]
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
    throw new Error('CRRT returned an invalid transcript.')
  }
  return { ...transcript, segments: transcript.segments.map((segment) => ({ ...segment, text: segment.text.trim() })) }
}

export async function transcribeRecording(audio: Blob) {
  if (!audio.size) return { source: 'none', language: 'und', segments: [] }
  const session = await extensionSession()
  if (!session) throw new Error('Sign in to CRRT to transcribe this recording.')
  const response = await fetch(`${import.meta.env.WXT_API_BASE.replace(/\/$/, '')}/v1/extension/recordings/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: audio,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(payload.error || `Transcription failed (${response.status}).`)
  }
  return parseTranscript(await response.json())
}
