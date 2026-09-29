import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from '../supabase.js'
import { accountForCustomer, BillingBusyError, getAccount, recordEvent, withAccount } from './store.js'

const calls: Array<{ table: string; method: string; args: unknown[] }> = []
let results: Array<{ data?: unknown; error?: unknown }>
beforeEach(() => {
  calls.length = 0; results = []
  vi.mocked(getServiceSupabase).mockImplementation(() => ({ from: (table: string) => {
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'or', 'upsert', 'update']) query[method] = (...args: unknown[]) => {
      calls.push({ table, method, args }); return query
    }
    query.maybeSingle = () => Promise.resolve(results.shift())
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(results.shift()).then(resolve)
    return query
  } }) as never)
})
it('scopes lookups by authenticated user or verified Stripe customer', async () => {
  results = [{ data: { user_id: 'u' } }, { data: null }]
  expect(await getAccount('u')).toEqual({ user_id: 'u' })
  expect(await accountForCustomer('cus')).toBeNull()
  expect(calls.filter((call) => call.method === 'eq').map((call) => call.args)).toEqual([['user_id', 'u'], ['customer_id', 'cus']])
})
it.each([getAccount, accountForCustomer])('propagates lookup failures', async (lookup) => {
  results = [{ error: { message: 'no db' } }]; await expect(lookup('u')).rejects.toThrow()
})
it('serializes account operations and fences writes and release by lease token', async () => {
  results = [{}, { data: { user_id: 'u' } }, { data: { user_id: 'u' } }, {}]
  expect(await withAccount('u', async (account, save) => {
    expect(account.user_id).toBe('u'); await save({ customer_id: 'cus' }); return 'done'
  })).toBe('done')
  const lock = calls.find((call) => call.method === 'update')!.args[0] as { lock_token: string }
  expect(calls.filter((call) => call.method === 'eq' && call.args[0] === 'lock_token').map((call) => call.args[1])).toEqual([lock.lock_token, lock.lock_token])
  expect(calls.find((call) => call.method === 'or')!.args[0]).toMatch(/^lock_expires_at.is.null,lock_expires_at.lt./)
})
it.each([
  [[{ error: {} }], 'creation'],
  [[{}, { error: {} }], 'lock failed'],
  [[{}, { data: null }], 'updating'],
])('rejects unavailable account locks', async (responses, message) => {
  results = responses as typeof results
  const op = vi.fn(); await expect(withAccount('u', op)).rejects.toThrow(message as string)
  expect(op).not.toHaveBeenCalled()
})
it('identifies contention separately', async () => {
  results = [{}, { data: null }]; await expect(withAccount('u', vi.fn())).rejects.toBeInstanceOf(BillingBusyError)
})
it.each([{ error: {} }, { data: null }])('rejects failed or fenced writes and still releases', async (failure) => {
  results = [{}, { data: {} }, failure, {}]
  await expect(withAccount('u', async (_, save) => save({ customer_id: 'cus' }))).rejects.toThrow('update failed')
  expect(calls.filter((call) => call.method === 'update')).toHaveLength(3)
})
it('releases after operation failure and propagates release failure', async () => {
  results = [{}, { data: {} }, {}]
  await expect(withAccount('u', async () => { throw new Error('Stripe unavailable') })).rejects.toThrow('Stripe unavailable')
  results = [{}, { data: {} }, { error: {} }]
  await expect(withAccount('u', async () => 'done')).rejects.toThrow('release failed')
})
it('records successful webhook receipts idempotently, surfacing persistence failures', async () => {
  results = [{}, { error: {} }]
  await recordEvent('evt', 'invoice.paid')
  expect(calls[0]).toEqual({ table: 'billing_webhook_events', method: 'upsert', args: [{ event_id: 'evt', event_type: 'invoice.paid' }, { onConflict: 'event_id', ignoreDuplicates: true }] })
  await expect(recordEvent('evt', 'invoice.paid')).rejects.toThrow('recording failed')
})
