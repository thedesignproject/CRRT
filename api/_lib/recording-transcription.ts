export type RecordingTranscriptSegment = {
  id: string
  startMs: number
  endMs: number
  text: string
}

export type RecordingTranscript = {
  source: 'deepgram:nova-3'
  language: string
  segments: RecordingTranscriptSegment[]
}

export class RecordingTranscriptionError extends Error {
  constructor(public readonly status: 502 | 503 | 504, message: string) {
    super(message)
    this.name = 'RecordingTranscriptionError'
  }
}

type DeepgramUtterance = { start?: unknown; end?: unknown; transcript?: unknown }
type DeepgramResponse = {
  metadata?: { duration?: unknown }
  results?: {
    utterances?: unknown
    channels?: Array<{
      detected_language?: unknown
      alternatives?: Array<{ transcript?: unknown }>
    }>
  }
}

function finiteSeconds(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function normalizeDeepgramTranscript(value: unknown): RecordingTranscript {
  const payload = value as DeepgramResponse | null
  const results = payload?.results
  const channel = results?.channels?.[0]
  const language = typeof channel?.detected_language === 'string' && channel.detected_language.trim()
    ? channel.detected_language.trim()
    : 'multi'
  const utterances = Array.isArray(results?.utterances) ? results.utterances as DeepgramUtterance[] : []
  const segments = utterances.flatMap((utterance, index) => {
    const start = finiteSeconds(utterance.start)
    const end = finiteSeconds(utterance.end)
    const text = typeof utterance.transcript === 'string' ? utterance.transcript.trim() : ''
    return start !== null && end !== null && end >= start && text
      ? [{ id: `segment-${index + 1}`, startMs: Math.round(start * 1_000), endMs: Math.round(end * 1_000), text }]
      : []
  })
  if (segments.length) return { source: 'deepgram:nova-3', language, segments }

  const text = channel?.alternatives?.[0]?.transcript
  const transcript = typeof text === 'string' ? text.trim() : ''
  if (!transcript) return { source: 'deepgram:nova-3', language, segments: [] }
  const duration = finiteSeconds(payload?.metadata?.duration) ?? 0
  return {
    source: 'deepgram:nova-3',
    language,
    segments: [{ id: 'segment-1', startMs: 0, endMs: Math.round(duration * 1_000), text: transcript }],
  }
}

export async function transcribeRecordingAudio(
  audio: Uint8Array,
  options: { apiKey?: string; baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch } = {},
): Promise<RecordingTranscript> {
  const apiKey = options.apiKey ?? process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new RecordingTranscriptionError(503, 'Recording transcription is not configured.')
  const endpoint = new URL('/v1/listen', options.baseUrl ?? process.env.DEEPGRAM_API_BASE_URL ?? 'https://api.deepgram.com')
  endpoint.search = new URLSearchParams({ model: 'nova-3', language: 'multi', smart_format: 'true', utterances: 'true' }).toString()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000)
  try {
    const response = await (options.fetch ?? fetch)(endpoint, {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/webm' },
      body: Buffer.from(audio),
      signal: controller.signal,
    })
    if (!response.ok) throw new RecordingTranscriptionError(502, 'Recording transcription failed.')
    let payload: unknown
    try { payload = await response.json() } catch { throw new RecordingTranscriptionError(502, 'Recording transcription failed.') }
    return normalizeDeepgramTranscript(payload)
  } catch (error) {
    if (error instanceof RecordingTranscriptionError) throw error
    if (controller.signal.aborted) throw new RecordingTranscriptionError(504, 'Recording transcription timed out.')
    throw new RecordingTranscriptionError(502, 'Recording transcription failed.')
  } finally {
    clearTimeout(timeout)
  }
}
