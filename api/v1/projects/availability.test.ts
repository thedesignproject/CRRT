import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({
  isValidProjectKey: vi.fn(),
  suggestAvailableProjectKey: vi.fn(),
}))

import handler from './availability.js'
import { requireUser } from '../../_lib/auth.js'
import { isValidProjectKey, suggestAvailableProjectKey } from '../../_lib/store.js'

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
  vi.mocked(isValidProjectKey).mockReset()
  vi.mocked(suggestAvailableProjectKey).mockReset()
})

describe('api/v1/projects/availability', () => {
  it('handles preflight OPTIONS and rejects non-GET', async () => {
    let res = mockRes()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)

    res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireUser).mockImplementationOnce(async (_q, r) => {
      r.status(401).json({ error: 'Unauthorized' })
      return null
    })
    const res = mockRes()
    await call({ method: 'GET', query: { key: 'acme' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('rejects an invalid (or missing) key with 400', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(isValidProjectKey).mockReturnValue(false)

    const res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ error: 'Invalid project key' })
  })

  it('reports availability=true when the suggestion equals the key', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(isValidProjectKey).mockReturnValue(true)
    vi.mocked(suggestAvailableProjectKey).mockResolvedValue('acme')

    const res = mockRes()
    await call({ method: 'GET', query: { key: ' ACME ' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    // key is trimmed + lowercased before lookup
    expect(suggestAvailableProjectKey).toHaveBeenCalledWith('acme')
    expect(res.body).toEqual({ key: 'acme', available: true, suggestion: 'acme' })
  })

  it('reports availability=false with a suggested alternative', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(isValidProjectKey).mockReturnValue(true)
    vi.mocked(suggestAvailableProjectKey).mockResolvedValue('acme-x7k2')

    const res = mockRes()
    await call({ method: 'GET', query: { key: 'acme' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ key: 'acme', available: false, suggestion: 'acme-x7k2' })
  })

  it('returns 500 when suggestion lookup throws', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(isValidProjectKey).mockReturnValue(true)
    vi.mocked(suggestAvailableProjectKey).mockRejectedValue(new Error('db down'))

    const res = mockRes()
    await call({ method: 'GET', query: { key: 'acme' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'Internal server error' })
  })
})
