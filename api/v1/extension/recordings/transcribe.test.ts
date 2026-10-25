import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/recording-transcription.js', async () => {
  const actual = await vi.importActual<typeof import('../../../_lib/recording-transcription.js')>('../../../_lib/recording-transcription.js')
  return { ...actual, transcribeRecordingAudio: vi.fn() }
})

import handler from './transcribe.js'
import { RecordingTranscriptionError, transcribeRecordingAudio } from '../../../_lib/recording-transcription.js'

const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
const origin = `chrome-extension://${extensionId}`
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1])
const originalAllowed = process.env.EXTENSION_ALLOWED_IDS

function response() {
  return {
    statusCode: 200, body: null as unknown, headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value },
    status(value: number) { this.statusCode = value; return this },
    json(value: unknown) { this.body = value; return this },
    end() { return this },
  }
}
function request(overrides: Record<string, unknown> = {}) {
  return { method: 'POST', query: {}, headers: { origin, 'content-type': 'application/octet-stream', 'content-length': String(webm.length) }, body: webm, ...overrides }
}
const call = (req: unknown, res: unknown) => (handler as unknown as (a: unknown, b: unknown) => Promise<unknown>)(req, res)

beforeEach(() => {
  process.env.EXTENSION_ALLOWED_IDS = extensionId
  vi.mocked(transcribeRecordingAudio).mockReset().mockResolvedValue({ source: 'deepgram:nova-3', language: 'es', segments: [] })
})
afterEach(() => {
  if (originalAllowed === undefined) delete process.env.EXTENSION_ALLOWED_IDS
  else process.env.EXTENSION_ALLOWED_IDS = originalAllowed
})

describe('recording transcription endpoint', () => {
  it('allows exact-origin preflight and returns transcription without an account', async () => {
    let res = response()
    await call(request({ method: 'OPTIONS', body: undefined }), res)
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Headers']).toContain('Content-Type')
    res = response()
    await call(request(), res)
    expect(transcribeRecordingAudio).toHaveBeenCalledWith(webm)
    expect(res).toMatchObject({ statusCode: 200, body: { transcript: { language: 'es', segments: [] } } })
  })

  it('fails closed for origin, method, and media-type violations', async () => {
    let res = response()
    await call(request({ headers: { origin: 'https://example.com' } }), res)
    expect(res.statusCode).toBe(403)
    res = response(); await call(request({ method: 'GET' }), res); expect(res.statusCode).toBe(405)
    res = response(); await call(request({ headers: { origin, 'content-type': 'audio/webm' } }), res); expect(res.statusCode).toBe(415)
  })

  it('rejects empty, malformed, declared oversized, and actual oversized audio', async () => {
    for (const body of [Buffer.alloc(0), Buffer.from('not-webm'), {}]) {
      const res = response(); await call(request({ body, headers: { origin, 'content-type': 'application/octet-stream' } }), res); expect(res.statusCode).toBe(400)
    }
    let res = response()
    await call(request({ headers: { origin, 'content-type': 'application/octet-stream', 'content-length': String(4 * 1024 * 1024 + 1) } }), res)
    expect(res.statusCode).toBe(413)
    const oversized = Buffer.concat([webm, Buffer.alloc(4 * 1024 * 1024)])
    res = response(); await call(request({ body: oversized, headers: { origin, 'content-type': 'application/octet-stream' } }), res); expect(res.statusCode).toBe(413)
    res = response(); await call(request({ body: new Uint8Array(webm) }), res); expect(res.statusCode).toBe(200)
  })

  it('maps stable provider errors and hides unexpected failures', async () => {
    vi.mocked(transcribeRecordingAudio).mockRejectedValueOnce(new RecordingTranscriptionError(504, 'Recording transcription timed out.'))
    let res = response(); await call(request(), res); expect(res).toMatchObject({ statusCode: 504, body: { error: 'Recording transcription timed out.' } })
    vi.mocked(transcribeRecordingAudio).mockRejectedValueOnce(new Error('provider secret'))
    res = response(); await call(request(), res); expect(res).toMatchObject({ statusCode: 502, body: { error: 'Recording transcription failed.' } })
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })

  it('does not expose CORS when extension configuration is unavailable', async () => {
    process.env.EXTENSION_ALLOWED_IDS = 'invalid'
    const res = response()
    await call(request(), res)
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'Recording transcription is unavailable.' } })
    expect(res.headers).not.toHaveProperty('Access-Control-Allow-Origin')
  })

  it('fails closed when CORS validation throws an unexpected error', async () => {
    const brokenRequest = {
      method: 'POST', query: {}, body: webm,
      get headers() { throw new Error('unexpected request shape') },
    }
    const res = response()
    await call(brokenRequest, res)
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'Recording transcription is unavailable.' } })
  })
})
