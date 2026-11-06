import { afterEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => vi.fn())
vi.mock('../auth.js', () => ({ requireUser: auth }))
const services = vi.hoisted(() => ({ createRecording: vi.fn(), listRecordings: vi.fn(), readRecording: vi.fn(), updateRecording: vi.fn(), attachRecording: vi.fn() }))
vi.mock('./lifecycle.js', () => services)
import { ownerEndpoint } from './http'
import { RecordError } from './core'
import collection from '../../v1/recordings/index'
import item from '../../v1/recordings/[id]/index'
import project from '../../v1/recordings/[id]/project'
const id = '9ad57271-6897-47f9-aeb4-acd19e1226f0'
function request(method?: string, query: any = { id }) { return { method, query, headers: {}, body: { title: 'Review' } } as any }
function response() { const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() }; res.status.mockReturnValue(res); return res }
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
it('protects HTTP operations, disables production by default and handles errors safely', async () => {
  const handler = ownerEndpoint({ GET: async () => ({ ok: true }) })
  let res = response(); await handler(request('OPTIONS'), res); expect(res.status).toHaveBeenCalledWith(204)
  res = response(); await handler(request('GET'), res); expect(res.status).toHaveBeenCalledWith(503)
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true')
  for (const method of ['PUT', undefined]) { res = response(); await handler(request(method), res); expect(res.status).toHaveBeenCalledWith(405) }
  auth.mockResolvedValue(null)
  res = response(); await handler(request('GET'), res); expect(res.json).not.toHaveBeenCalled()
  auth.mockResolvedValue({ userId: 'owner' })
  res = response(); await handler(request('GET', { id: 'bad' }), res); expect(res.status).toHaveBeenCalledWith(400)
  res = response(); await handler(request('GET'), res); expect(res.json).toHaveBeenCalledWith({ ok: true })
  res = response(); await handler({ ...request('GET'), body: undefined }, res); expect(res.status).toHaveBeenCalledWith(200)
  res = response(); await handler({ ...request('GET'), body: { text: 'x'.repeat(1_048_576) } }, res); expect(res.status).toHaveBeenCalledWith(413)
  for (const error of [new RecordError('record_conflict', 409), new Error('secret')]) {
    res = response(); await ownerEndpoint({ GET: async () => { throw error } })(request('GET'), res)
    expect(res.status).toHaveBeenCalledWith(error instanceof RecordError ? 409 : 503)
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret')
  }
})
it('wires collection, item and project endpoints to the stable service contract', async () => {
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true'); auth.mockResolvedValue({ userId: 'owner' })
  for (const [handler, methods] of [[collection, ['GET', 'POST']], [item, ['GET', 'PATCH']], [project, ['POST']]] as const) {
    for (const method of methods) { const res = response(); await handler(request(method), res); expect(res.status).toHaveBeenCalledWith(handler === collection && method === 'POST' ? 201 : 200) }
  }
  for (const service of Object.values(services)) expect(service).toHaveBeenCalled()
})
