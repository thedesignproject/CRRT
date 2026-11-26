import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ listProjectsForUser: vi.fn(), listProjectActivity: vi.fn() }))

import handler from './index.js'
import { requireUser } from '../../_lib/auth.js'
import { listProjectActivity, listProjectsForUser } from '../../_lib/store.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader(key: string, value: string) { this.headers[key] = value },
  }
}
const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

beforeEach(() => {
  vi.mocked(requireUser).mockReset()
  vi.mocked(listProjectsForUser).mockReset()
  vi.mocked(listProjectActivity).mockReset().mockResolvedValue(new Map())
})

describe('api/v1/projects', () => {
  it('handles preflight OPTIONS', async () => {
    const res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)
  })

  it('returns 401 when requireUser rejects', async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })
    const res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('405 for POST, 200 for GET, 500 on store throw', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    let res = mockRes()
    await call({ method: 'POST', query: {}, body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(listProjectsForUser).mockResolvedValueOnce([{ publicKey: 'p1' }, { publicKey: 'p2' }] as never)
    vi.mocked(listProjectActivity).mockResolvedValueOnce(new Map([['p1', { openCount: 3, agentLive: true }]]))
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(listProjectsForUser).toHaveBeenCalledWith('u')
    expect(listProjectActivity).toHaveBeenCalledWith('u')
    expect(res.body).toEqual([
      { publicKey: 'p1', openCount: 3, agentLive: true },
      { publicKey: 'p2', openCount: 0, agentLive: false },
    ])

    const failure = new Error('activity down')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(listProjectsForUser).mockResolvedValueOnce([{ publicKey: 'p1' }] as never)
    vi.mocked(listProjectActivity).mockRejectedValueOnce(failure)
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{ publicKey: 'p1' }])
    expect(log).toHaveBeenCalledWith('Project activity failed', failure)

    vi.mocked(listProjectsForUser).mockRejectedValueOnce(new Error('boom'))
    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})
