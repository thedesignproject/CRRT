import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase.js', () => ({ getServiceSupabase: () => ({ rpc: m.rpc }) }))
import { reserveRecordingTranscription, reserveTranscription } from './recording-transcription-limit'
const request = (headers: object = {}, address: string | undefined = '192.0.2.1') => ({ headers, socket: { remoteAddress: address } }) as any
beforeEach(() => { vi.stubEnv('VERCEL', ''); vi.stubEnv('SHARE_TOKEN_SECRET', 'local-quota-test-secret-long-enough'); m.rpc.mockReset().mockResolvedValue({ data: true, error: null }) })
afterEach(() => vi.unstubAllEnvs())
it('reserves durable attempts against a stable owner identity and the shared global budget', async () => {
  await reserveRecordingTranscription('owner-one', 100)
  const first = m.rpc.mock.lastCall![1]
  await reserveRecordingTranscription('owner-one', 200)
  expect(m.rpc.mock.lastCall![1]).toMatchObject({ ...first, p_bytes: 200 })
  await reserveRecordingTranscription('owner-two', 100)
  expect(m.rpc.mock.lastCall![1].p_client).not.toBe(first.p_client)
  await expect(reserveRecordingTranscription('', 100)).rejects.toMatchObject({ status: 503 })
  m.rpc.mockResolvedValueOnce({ data: false, error: null })
  await expect(reserveRecordingTranscription('owner-one', 100)).rejects.toMatchObject({ status: 429 })
  m.rpc.mockRejectedValueOnce(new Error('storage unavailable'))
  await expect(reserveRecordingTranscription('owner-one', 100)).rejects.toMatchObject({ status: 503 })
})
it('reserves stable private socket identity, ignores spoofed identity headers, and canonicalizes mapped IPs', async () => {
  await reserveTranscription(request({ origin: 'chrome-extension://anything', 'x-forwarded-for': 'evil' }), 10)
  const initial = m.rpc.mock.calls[0][1]
  expect(initial).toMatchObject({ p_bytes: 10, p_client_requests: 6, p_client_bytes: 16_777_216, p_global_requests: 100, p_global_bytes: 134_217_728 })
  expect(initial.p_client).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(initial)).not.toContain('192.0.2.1')
  await reserveTranscription(request({}, '::ffff:192.0.2.1'), 10)
  expect(m.rpc.mock.lastCall![1].p_client).toBe(initial.p_client)
  await reserveTranscription(request({}, '192.0.2.2'), 10)
  expect(m.rpc.mock.lastCall![1].p_client).not.toBe(initial.p_client)
})
it('trusts forwarding headers only on Vercel and rejects missing, multiple or invalid peers', async () => {
  vi.stubEnv('VERCEL', '1')
  await reserveTranscription(request({ 'x-forwarded-for': ' 2001:db8::1 ' }), 1)
  const identity = m.rpc.mock.lastCall![1].p_client
  await reserveTranscription(request({ 'x-forwarded-for': '2001:0db8:0:0:0:0:0:1' }), 1)
  expect(m.rpc.mock.lastCall![1].p_client).toBe(identity)
  for (const value of [undefined, ['192.0.2.1'], '192.0.2.1,192.0.2.2', 'bad', 'fe80::1%en0']) {
    await expect(reserveTranscription(request({ 'x-forwarded-for': value }), 1)).rejects.toMatchObject({ status: 503 })
  }
  vi.stubEnv('VERCEL', '')
  await expect(reserveTranscription({ headers: {} } as any, 1)).rejects.toMatchObject({ status: 503 })
})
it('fails closed for missing secrets and bad configuration, and accepts explicit positive limits', async () => {
  vi.stubEnv('SHARE_TOKEN_SECRET', '')
  await expect(reserveTranscription(request(), 1)).rejects.toMatchObject({ status: 503 })
  vi.stubEnv('SHARE_TOKEN_SECRET', 'short')
  await expect(reserveTranscription(request(), 1)).rejects.toMatchObject({ status: 503 })
  vi.stubEnv('SHARE_TOKEN_SECRET', 'local-quota-test-secret-long-enough')
  for (const value of ['0', 'NaN', '1.5', '2147483648']) {
    vi.stubEnv('RECORD_TRANSCRIPTION_CLIENT_REQUESTS_PER_HOUR', value)
    await expect(reserveTranscription(request(), 1)).rejects.toMatchObject({ status: 503 })
  }
  expect(m.rpc).not.toHaveBeenCalled()
  vi.stubEnv('RECORD_TRANSCRIPTION_CLIENT_REQUESTS_PER_HOUR', '2')
  await reserveTranscription(request(), 1)
  expect(m.rpc.mock.lastCall![1].p_client_requests).toBe(2)
})
it('rejects depleted budgets, RPC errors, missing responses and transport failure without leaking details', async () => {
  m.rpc.mockResolvedValueOnce({ data: false, error: null })
  await expect(reserveTranscription(request(), 1)).rejects.toMatchObject({ status: 429 })
  for (const result of [{ data: true, error: { message: 'database secret' } }, { data: null, error: null }, { data: {}, error: null }]) {
    m.rpc.mockResolvedValueOnce(result)
    await expect(reserveTranscription(request(), 1)).rejects.toMatchObject({ status: 503, message: 'Recording transcription quota is unavailable.' })
  }
  m.rpc.mockRejectedValueOnce(new Error('database secret'))
  await expect(reserveTranscription(request(), 1)).rejects.toMatchObject({ status: 503, message: 'Recording transcription quota is unavailable.' })
})
