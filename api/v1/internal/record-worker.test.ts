import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('../../_lib/record/worker-dispatch.js', () => ({ dispatchRecordWorker: vi.fn() }))
import { dispatchRecordWorker } from '../../_lib/record/worker-dispatch.js'
import handler from './record-worker.js'

function response() {
  return {
    statusCode: 200, body: null as unknown, headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value },
    status(value: number) { this.statusCode = value; return this },
    json(value: unknown) { this.body = value; return this }, end() { return this },
  }
}
const call = (method = 'GET', authorization: unknown = 'Bearer cron-secret') => {
  const res = response()
  return (handler as unknown as (a: unknown, b: unknown) => Promise<unknown>)({ method, headers: { authorization } }, res).then(() => res)
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true')
})
afterEach(() => vi.unstubAllEnvs())
it('requires GET and the configured cron credential', async () => {
  expect((await call('POST')).statusCode).toBe(405)
  vi.stubEnv('CRON_SECRET', '')
  expect((await call()).statusCode).toBe(503)
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  expect((await call('GET', ['Bearer wrong', 'Bearer cron-secret'])).statusCode).toBe(401)
  expect((await call('GET', null)).statusCode).toBe(401)
  expect(dispatchRecordWorker).not.toHaveBeenCalled()
})
it('returns no-store success after dispatching work', async () => {
  const res = await call()
  expect(dispatchRecordWorker).toHaveBeenCalledOnce()
  expect(res.statusCode).toBe(204)
  expect(res.headers['Cache-Control']).toBe('no-store')
})
it('does not dispatch when recordings are disabled', async () => {
  vi.stubEnv('CRRT_RECORD_ENABLED', 'false')
  expect((await call()).statusCode).toBe(204)
  expect(dispatchRecordWorker).not.toHaveBeenCalled()
})
it('returns a safe retryable error for dispatch failure', async () => {
  vi.mocked(dispatchRecordWorker).mockRejectedValueOnce(new Error('private-details'))
  expect(await call()).toMatchObject({ statusCode: 503, body: { error: 'Worker unavailable' } })
})
