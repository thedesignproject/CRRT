import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireSuperAdmin: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ getAdminStats: vi.fn() }))

import handler from './stats.js'
import { requireSuperAdmin } from '../../_lib/auth.js'
import { getAdminStats } from '../../_lib/store.js'

function mockRes() {
  return {
    statusCode: 200, body: null as unknown, headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader(key: string, value: string) { this.headers[key] = value },
  }
}
const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

beforeEach(() => {
  vi.mocked(requireSuperAdmin).mockReset()
  vi.mocked(getAdminStats).mockReset()
})

describe('api/v1/admin/stats', () => {
  it('handles OPTIONS, unsupported methods, and forbidden users', async () => {
    let res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)
    res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)
    vi.mocked(requireSuperAdmin).mockResolvedValue(null)
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(getAdminStats).not.toHaveBeenCalled()
  })

  it('returns stats and maps store failures to 500', async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    const stats = {
      accounts: 1, projects: 2, comments: 3, shares: 4, activeAgentPresence: 5,
      signups: { last24Hours: 1, last7Days: 1, last30Days: 1 },
    }
    vi.mocked(getAdminStats).mockResolvedValueOnce(stats).mockRejectedValueOnce(new Error('boom'))
    let res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(stats)
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
