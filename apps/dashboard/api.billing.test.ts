import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { beginBillingCheckout, getBillingAvailability, getBillingSummary, runBillingAction } from './api'

const fetchMock = vi.fn()
const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, text: async () => JSON.stringify(body) })

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

it('loads availability and final summaries with authenticated no-store requests', async () => {
  fetchMock.mockResolvedValue(response({ enabled: true }))
  const controller = new AbortController()
  await getBillingAvailability('/api', 'token', controller.signal)
  await getBillingSummary('/api', 'token')
  await getBillingSummary('/api', 'token', true, controller.signal)
  expect(fetchMock.mock.calls[0]).toEqual(['/api/v1/billing?availability=1', { signal: controller.signal, headers: { Authorization: 'Bearer token' } }])
  expect(fetchMock.mock.calls[1]).toEqual(['/api/v1/billing', { signal: undefined, cache: 'no-store', headers: { Authorization: 'Bearer token' } }])
  expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/v1/billing?reconcile=1')
})

it('normalizes the current trunk summary without enabling unsupported actions', async () => {
  fetchMock.mockResolvedValue(response({
    enabled: true, testMode: true, canManage: true, cancelAtPeriodEnd: false, periodEnd: '2026-11-01T00:00:00Z',
    plans: [{ id: 'pro', name: 'Cloud Pro', monthlyUsd: 19, projects: 10, internal_users: 10, comments: 2000, product_audits: 5, amount: '$19', interval: 'month' }],
    entitlements: { plan: 'pro', status: 'active', resetAt: '2026-11-01T00:00:00Z', usage: { projects: 2, internal_users: 3, comments: 40, product_audits: 1 }, limits: { projects: 10, internal_users: 10, comments: 2000, product_audits: 5 } },
  }))
  await expect(getBillingSummary('/api', 'token')).resolves.toMatchObject({
    plan: 'pro', lifecycle: 'active', actions: { checkoutState: false, changePlan: false },
    plans: [{ key: 'pro', name: 'Pro', limits: { internalUsers: 10 } }],
    usage: { comments: { used: 40, limit: 2000, resetAt: '2026-11-01T00:00:00Z' } },
  })
})

it.each([
  ['legacy', 'pro', 'active'],
  ['past_due', 'pro', 'read_only'],
  ['paused', 'pro', 'read_only'],
  ['canceled', 'pro', 'none'],
  ['none', null, 'none'],
] as const)('maps legacy %s lifecycle safely', async (status, plan, lifecycle) => {
  fetchMock.mockResolvedValue(response({
    enabled: true,
    entitlements: { isLegacy: status === 'legacy', plan, status, resetAt: null, usage: { projects: 0, internal_users: 0, comments: 0, product_audits: 0 }, limits: { projects: null, internal_users: null, comments: null, product_audits: null } },
  }))
  expect(await getBillingSummary('/api', 'token')).toMatchObject({ lifecycle, isLegacy: status === 'legacy' })
})

it('posts each closed billing action and keeps the legacy Pro shortcut', async () => {
  fetchMock.mockResolvedValue(response({ status: 'updated', plan: 'studio' }))
  await runBillingAction('/api', 'token', 'change_plan', 'studio')
  await runBillingAction('/api', 'token', 'portal')
  await runBillingAction('/api', 'token', 'checkout_state', undefined, 'signed.state')
  await beginBillingCheckout('/api', 'token')
  expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body))).toEqual([
    { action: 'change_plan', plan: 'studio' },
    { action: 'portal' },
    { action: 'checkout_state', state: 'signed.state' },
    { action: 'checkout' },
  ])
})

it('surfaces billing API and invalid JSON failures through the shared contract', async () => {
  fetchMock.mockResolvedValueOnce(response({ error: 'down' }, false))
  await expect(getBillingSummary('/api', 'token')).rejects.toThrow('down')
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<!doctype html> API unavailable' })
  await expect(getBillingSummary('/api', 'token')).rejects.toThrow('Expected JSON from /api/v1/billing')
})
