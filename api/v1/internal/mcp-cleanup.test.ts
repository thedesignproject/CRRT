import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../../_lib/supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from '../../_lib/supabase.js'
import handler from './mcp-cleanup.js'
afterEach(() => vi.unstubAllEnvs())
it('requires the cron secret and fails closed when cleanup fails', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
  vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never)
  const response = () => ({ code: 0, status(n: number) { this.code = n; return this }, setHeader: vi.fn(), json: vi.fn(), end: vi.fn() })
  for (const [method, secret, auth, code] of [['POST', 'cron', 'Bearer cron', 405], ['GET', '', '', 503], ['GET', 'cron', 'Bearer wrong', 401], ['GET', 'cron', 'Bearer cron', 204]] as const) {
    vi.stubEnv('CRON_SECRET', secret); const res = response()
    await handler({ method, headers: { authorization: auth } } as never, res as never); expect(res.code).toBe(code)
  }
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'private' } }); const res = response()
  await handler({ method: 'GET', headers: { authorization: 'Bearer cron' } } as never, res as never); expect(res.code).toBe(503)
})
