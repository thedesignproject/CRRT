import { expect, it, vi } from 'vitest'
import { trustedUser, withTrustedUser } from './trusted-user.js'
import { requireUser } from './auth.js'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn(), getSupabase: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: 'invalid' }) } }) }))
it('uses request identity, never copyable headers or body, and cleans up after success/failure', async () => {
  const req = { headers: { authorization: 'Bearer internal-mcp' }, query: {}, body: { userId: 'victim' } } as never
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as never
  const user = { userId: 'real', email: 'real@test.local' }
  expect(trustedUser(req)).toBeUndefined()
  await withTrustedUser(req, user, async () => {
    expect(await requireUser(req, res)).toEqual(user)
    expect(await requireUser({ ...(req as object) } as never, res)).toBeNull()
  })
  expect(trustedUser(req)).toBeUndefined()
  await expect(withTrustedUser(req, user, async () => { throw new Error('failure') })).rejects.toThrow('failure')
  expect(trustedUser(req)).toBeUndefined()
})
it('keeps simultaneous internal requests isolated', async () => {
  const a = {} as never, b = {} as never
  await Promise.all([withTrustedUser(a, { userId: 'a', email: 'a@test.local' }, async () => {
    await Promise.resolve(); expect(trustedUser(a)?.userId).toBe('a'); expect(trustedUser(b)?.userId).toBe('b')
  }), withTrustedUser(b, { userId: 'b', email: 'b@test.local' }, async () => { await Promise.resolve(); expect(trustedUser(b)?.userId).toBe('b') })])
})
