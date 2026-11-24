import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from '../supabase.js'
import { normalizeAppsumoCode, redeemAppsumoCode } from './appsumo.js'

// In-memory stand-in for redeem_appsumo_code with the same claim semantics:
// a code is claimed only while unredeemed, and one user holds one code.
let codes: Map<string, string | null>
let legacy: Set<string>
const rpc = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  codes = new Map([['AS-Valid-1', null], ['AS-Valid-2', null], ['AS-Used', 'someone-else']])
  legacy = new Set()
  rpc.mockImplementation(async (_name: string, { p_user, p_code }: { p_user: string; p_code: string }) => {
    await Promise.resolve()
    if ([...codes.values()].includes(p_user)) return { data: 'already_has_plan', error: null }
    if (!codes.has(p_code)) return { data: 'invalid_code', error: null }
    if (codes.get(p_code) !== null) return { data: 'already_redeemed', error: null }
    codes.set(p_code, p_user); legacy.add(p_user)
    return { data: 'redeemed', error: null }
  })
  vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never)
})

it('trims whitespace but keeps the code case exactly as issued', () => {
  expect(normalizeAppsumoCode('  AS-Valid-1\n')).toBe('AS-Valid-1')
  expect(normalizeAppsumoCode('as-valid-1')).toBe('as-valid-1')
  for (const value of ['', '   ', null, 42, 'x'.repeat(129)]) expect(normalizeAppsumoCode(value)).toBeNull()
})

it('redeems a valid code once and grants the lifetime plan', async () => {
  await expect(redeemAppsumoCode('buyer', ' AS-Valid-1 ')).resolves.toEqual({ redeemed: true })
  expect(rpc).toHaveBeenCalledWith('redeem_appsumo_code', { p_user: 'buyer', p_code: 'AS-Valid-1' })
  expect(codes.get('AS-Valid-1')).toBe('buyer'); expect(legacy.has('buyer')).toBe(true)
})

it('rejects an unknown code, including a different case of a real code', async () => {
  await expect(redeemAppsumoCode('buyer', 'nope')).rejects.toMatchObject({ status: 400, code: 'invalid_code' })
  await expect(redeemAppsumoCode('buyer', 'as-valid-1')).rejects.toMatchObject({ status: 400, code: 'invalid_code' })
  await expect(redeemAppsumoCode('buyer', '   ')).rejects.toMatchObject({ status: 400, code: 'invalid_code' })
  expect(rpc).toHaveBeenCalledTimes(2)
})

it('rejects a code another buyer already redeemed', async () => {
  await expect(redeemAppsumoCode('buyer', 'AS-Used')).rejects.toMatchObject({ status: 409, code: 'already_redeemed', message: expect.stringContaining('already been redeemed') })
  expect(legacy.has('buyer')).toBe(false)
})

it('lets only one of two simultaneous buyers claim the same code', async () => {
  const results = await Promise.allSettled([redeemAppsumoCode('first', 'AS-Valid-1'), redeemAppsumoCode('second', 'AS-Valid-1')])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'already_redeemed' } })
  expect([...codes.values()].filter(owner => owner === 'first' || owner === 'second')).toHaveLength(1)
})

it('rejects a second code for a user who already redeemed one', async () => {
  await redeemAppsumoCode('buyer', 'AS-Valid-1')
  await expect(redeemAppsumoCode('buyer', 'AS-Valid-2')).rejects.toMatchObject({ status: 409, code: 'already_has_plan' })
  expect(codes.get('AS-Valid-2')).toBeNull()
})

it('reports the per-user rate limit and fails closed on database errors', async () => {
  rpc.mockResolvedValueOnce({ data: 'rate_limited', error: null })
  await expect(redeemAppsumoCode('buyer', 'AS-Valid-1')).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  await expect(redeemAppsumoCode('buyer', 'AS-Valid-1')).rejects.toMatchObject({ status: 503 })
  rpc.mockResolvedValueOnce({ data: 'surprise', error: null })
  await expect(redeemAppsumoCode('buyer', 'AS-Valid-1')).rejects.toMatchObject({ status: 503 })
  rpc.mockRejectedValueOnce(new Error('network'))
  await expect(redeemAppsumoCode('buyer', 'AS-Valid-1')).rejects.toMatchObject({ status: 503 })
})
