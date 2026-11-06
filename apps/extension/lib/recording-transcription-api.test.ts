import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RecordingTranscriptionClientError, transcribeRecording } from './recording-transcription-api'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubEnv('WXT_API_BASE', 'https://crrt.ai/api/')
})

describe('recording transcription API client', () => {
  it('skips empty audio and sends non-empty audio without requiring an account', async () => {
    await expect(transcribeRecording(new Blob())).resolves.toEqual({ source: 'none', language: 'und', segments: [] })
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ transcript: {
      source: 'deepgram:nova-3', language: 'es', segments: [{ id: 's', startMs: 1, endMs: 2, text: ' Hola ' }],
    } }), { status: 200 }))
    await expect(transcribeRecording(new Blob(['audio']))).resolves.toMatchObject({ segments: [{ text: 'Hola' }] })
    expect(fetch).toHaveBeenCalledWith('https://crrt.ai/api/v1/extension/recordings/transcribe', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: expect.any(Blob),
    }))
  })

  it('uses stable API and status errors', async () => {
    expect(new RecordingTranscriptionClientError('Failure').name).toBe('RecordingTranscriptionClientError')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Provider unavailable' }), { status: 503 }))
    await expect(transcribeRecording(new Blob(['audio']))).rejects.toThrow('Provider unavailable')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('not-json', { status: 502 }))
    await expect(transcribeRecording(new Blob(['audio']))).rejects.toThrow('Transcription failed (502)')
  })

  it.each([
    {},
    { transcript: { source: 1, language: 'es', segments: [] } },
    { transcript: { source: 'provider', language: 1, segments: [] } },
    { transcript: { source: 'provider', language: 'es', segments: {} } },
    { transcript: { source: 'provider', language: 'es', segments: [{ id: 1, startMs: 1, endMs: 2, text: 'bad' }] } },
    { transcript: { source: 'provider', language: 'es', segments: [{ id: 's', startMs: Number.NaN, endMs: 2, text: 'bad' }] } },
    { transcript: { source: 'provider', language: 'es', segments: [{ id: 's', startMs: 1, endMs: Number.NaN, text: 'bad' }] } },
    { transcript: { source: 'provider', language: 'es', segments: [{ id: 's', startMs: -1, endMs: 2, text: 'bad' }] } },
    { transcript: { source: 'provider', language: 'es', segments: [{ id: 's', startMs: 2, endMs: 1, text: 'bad' }] } },
    { transcript: { source: 'provider', language: 'es', segments: [{ id: 's', startMs: 1, endMs: 2, text: ' ' }] } },
    { transcript: { source: 'provider', language: 'es', segments: [null] } },
  ])('rejects malformed successful payloads (%j)', async (payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    await expect(transcribeRecording(new Blob(['audio']))).rejects.toThrow('invalid transcript')
  })
})
