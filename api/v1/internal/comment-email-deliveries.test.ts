import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../_lib/comment-email-outbox.js', () => ({ processCommentEmailQueue: vi.fn() }))
import { processCommentEmailQueue } from '../../_lib/comment-email-outbox.js'
import handler from './comment-email-deliveries.js'

function response() {
  return {
    code: 0, body: null as unknown, setHeader: vi.fn(),
    status(code: number) { this.code = code; return this },
    json(body: unknown) { this.body = body; return this }, end: vi.fn(),
  }
}
async function call(method: string, authorization?: string | string[]) {
  const res = response()
  await handler({ method, headers: { authorization } } as never, res as never)
  return res
}
beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'cron-key')
  vi.mocked(processCommentEmailQueue).mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

it('requires the scheduler secret and GET, with no cached response', async () => {
  expect((await call('POST')).code).toBe(405)
  expect((await call('GET')).code).toBe(401)
  expect((await call('GET', ['Bearer wrong', 'Bearer cron-key'])).code).toBe(401)
  vi.stubEnv('CRON_SECRET', '')
  expect((await call('GET')).code).toBe(503)
  expect(processCommentEmailQueue).not.toHaveBeenCalled()
})
it('processes queued deliveries and returns no content', async () => {
  const res = await call('GET', 'Bearer cron-key')
  expect(res.code).toBe(204)
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  expect(processCommentEmailQueue).toHaveBeenCalledOnce()
})
it('does not expose provider or database details on failure', async () => {
  vi.mocked(processCommentEmailQueue).mockRejectedValueOnce(new Error('private details'))
  const res = await call('GET', 'Bearer cron-key')
  expect(res.code).toBe(503)
  expect(res.body).toEqual({ error: 'Email worker failed' })
})
