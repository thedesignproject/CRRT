import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeDeepgramTranscript, RecordingTranscriptionError, transcribeRecordingAudio } from './recording-transcription.js'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete process.env.DEEPGRAM_API_KEY; delete process.env.DEEPGRAM_API_BASE_URL })

describe('recording transcription provider adapter', () => {
  it('normalizes timestamped utterances and drops malformed provider rows', () => {
    expect(normalizeDeepgramTranscript({ results: {
      channels: [{ detected_language: 'es', alternatives: [{ transcript: 'fallback' }] }],
      utterances: [
        { start: 1.234, end: 2.5, transcript: '  Hola mundo. ' },
        { start: -1, end: 2, transcript: 'bad start' },
        { start: 3, end: 2, transcript: 'bad range' },
        { start: 3, end: 4, transcript: ' ' },
        { start: 4, end: 5, transcript: 42 },
      ],
    } })).toEqual({
      source: 'deepgram:nova-3', language: 'es',
      segments: [{ id: 'segment-1', startMs: 1234, endMs: 2500, text: 'Hola mundo.' }],
    })
  })

  it('falls back to one bounded segment or a valid silent transcript', () => {
    expect(normalizeDeepgramTranscript({ metadata: { duration: 4.25 }, results: { channels: [{ alternatives: [{ transcript: '  Hello. ' }] }] } })).toEqual({
      source: 'deepgram:nova-3', language: 'multi',
      segments: [{ id: 'segment-1', startMs: 0, endMs: 4250, text: 'Hello.' }],
    })
    expect(normalizeDeepgramTranscript({ metadata: { duration: 'bad' }, results: { channels: [{ alternatives: [{ transcript: 'Fallback' }] }] } }).segments[0]?.endMs).toBe(0)
    expect(normalizeDeepgramTranscript(null)).toEqual({ source: 'deepgram:nova-3', language: 'multi', segments: [] })
  })

  it('sends WebM to the configured provider without exposing its response shape', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: { utterances: [{ start: 0, end: 1, transcript: 'Hola' }], channels: [{}] } }), { status: 200 }))
    await expect(transcribeRecordingAudio(new Uint8Array([1, 2]), {
      apiKey: 'secret', baseUrl: 'https://speech.example/base', fetch: request,
    })).resolves.toMatchObject({ segments: [{ text: 'Hola' }] })
    const [url, init] = request.mock.calls[0]!
    expect(String(url)).toContain('https://speech.example/v1/listen?')
    expect(String(url)).toContain('model=nova-3')
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Token secret', 'Content-Type': 'audio/webm' } })
    expect(Buffer.isBuffer(init.body)).toBe(true)

    process.env.DEEPGRAM_API_KEY = 'environment-key'
    process.env.DEEPGRAM_API_BASE_URL = 'https://environment.example'
    request.mockResolvedValueOnce(new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: '' }] }] } }), { status: 200 }))
    await transcribeRecordingAudio(new Uint8Array([3]), { fetch: request })
    expect(String(request.mock.calls[1]?.[0])).toContain('environment.example/v1/listen')

    const globalRequest = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ results: { channels: [{}] } }), { status: 200 }))
    await transcribeRecordingAudio(new Uint8Array([4]))
    expect(globalRequest).toHaveBeenCalledOnce()
  })

  it('maps missing configuration, provider rejection, invalid JSON, and network failure', async () => {
    await expect(transcribeRecordingAudio(new Uint8Array([1]))).rejects.toMatchObject({ status: 503 })
    await expect(transcribeRecordingAudio(new Uint8Array([1]), { apiKey: 'key', fetch: vi.fn().mockResolvedValue(new Response('', { status: 429 })) })).rejects.toMatchObject({ status: 502 })
    await expect(transcribeRecordingAudio(new Uint8Array([1]), { apiKey: 'key', fetch: vi.fn().mockResolvedValue(new Response('bad', { status: 200 })) })).rejects.toMatchObject({ status: 502 })
    await expect(transcribeRecordingAudio(new Uint8Array([1]), { apiKey: 'key', fetch: vi.fn().mockRejectedValue(new Error('private')) })).rejects.toEqual(new RecordingTranscriptionError(502, 'Recording transcription failed.'))
  })

  it('aborts provider work at the configured timeout', async () => {
    vi.useFakeTimers()
    const request = vi.fn((_url: URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = transcribeRecordingAudio(new Uint8Array([1]), { apiKey: 'key', timeoutMs: 10, fetch: request as typeof fetch })
    const rejection = expect(pending).rejects.toMatchObject({ status: 504 })
    await vi.advanceTimersByTimeAsync(11)
    await rejection
  })
})
