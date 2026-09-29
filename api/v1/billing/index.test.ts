import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/billing/config.js', () => ({ stripeEnabled: vi.fn(), billingConfig: vi.fn() }))
vi.mock('../../_lib/billing/service.js', () => ({ billingSummary: vi.fn(), checkout: vi.fn(), portal: vi.fn() }))
import { requireUser } from '../../_lib/auth.js'
import { stripeEnabled, billingConfig } from '../../_lib/billing/config.js'
import { billingSummary, checkout, portal } from '../../_lib/billing/service.js'
import { BillingBusyError } from '../../_lib/billing/store.js'
import handler from './index.js'
const user = { userId: 'authenticated-user', email: 'owner@example.com' }
function res() {
  return { statusCode: 200, body: null as unknown, setHeader: vi.fn(), status(code: number) { this.statusCode = code; return this }, json(value: unknown) { this.body = value; return this }, end() { return this } }
}
async function call(method: string, body?: unknown, headers: Record<string, string | undefined> = { authorization: 'Bearer session' }) {
  const response = res(); await handler({ method, body, headers, query: {} } as never, response as never); return response
}
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(stripeEnabled).mockReturnValue(true); vi.mocked(requireUser).mockResolvedValue(user)
})
it('serves preflight and rejects unsupported methods', async () => {
  expect((await call('OPTIONS')).statusCode).toBe(204); expect((await call('DELETE')).statusCode).toBe(405)
})
it('is inert when disabled, without touching auth, configuration, or billing', async () => {
  vi.mocked(stripeEnabled).mockReturnValue(false)
  expect((await call('GET')).body).toEqual({ enabled: false })
  expect((await call('POST', { action: 'checkout' })).statusCode).toBe(404)
  expect(requireUser).not.toHaveBeenCalled(); expect(billingConfig).not.toHaveBeenCalled(); expect(checkout).not.toHaveBeenCalled()
})
it.each([{}, { authorization: 'Basic secret' }, { 'x-share-token': 'share' }])('requires a bearer session', async (headers) => {
  expect((await call('GET', undefined, headers)).statusCode).toBe(401)
})
it('respects failed session validation', async () => {
  vi.mocked(requireUser).mockImplementation(async (_, response) => { response.status(401).json({ error: 'Unauthorized' }); return null })
  expect((await call('GET')).statusCode).toBe(401); expect(billingSummary).not.toHaveBeenCalled()
})
it('returns the authenticated account summary with no caching', async () => {
  vi.mocked(billingSummary).mockResolvedValue({ enabled: true } as never)
  const response = await call('GET'); expect(response.body).toEqual({ enabled: true })
  expect(billingSummary).toHaveBeenCalledWith(user.userId); expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
})
it('ignores client-supplied prices and customer/account ids', async () => {
  vi.mocked(checkout).mockResolvedValue({ url: 'checkout' }); vi.mocked(portal).mockResolvedValue({ url: 'portal' })
  expect((await call('POST', { action: 'checkout', userId: 'victim', customerId: 'cus_victim', priceId: 'cheap' })).body).toEqual({ url: 'checkout' })
  expect(checkout).toHaveBeenCalledWith(user)
  expect((await call('POST', { action: 'portal', userId: 'victim' })).body).toEqual({ url: 'portal' })
  expect(portal).toHaveBeenCalledWith(user.userId)
})
it('handles missing billing accounts and invalid actions', async () => {
  vi.mocked(portal).mockResolvedValue(null)
  expect((await call('POST', { action: 'portal' })).statusCode).toBe(409)
  expect((await call('POST')).statusCode).toBe(400)
  expect((await call('POST', { action: 'delete' })).statusCode).toBe(400)
})
it('reports contention separately from configuration/provider failures without leaking details', async () => {
  vi.mocked(checkout).mockRejectedValueOnce(new BillingBusyError('Updating'))
  expect((await call('POST', { action: 'checkout' })).statusCode).toBe(409)
  vi.mocked(billingConfig).mockImplementation(() => { throw new Error('secret details') })
  const response = await call('GET'); expect(response.statusCode).toBe(503); expect(response.body).toEqual({ error: 'Billing is temporarily unavailable' })
})

it('checks navigation availability without touching configuration or account state', async () => {
  const response = res()
  await handler({ method: 'GET', headers: { authorization: 'Bearer session' }, query: { availability: '1' } } as never, response as never)
  expect(response.body).toEqual({ enabled: true })
  expect(billingConfig).not.toHaveBeenCalled()
  expect(billingSummary).not.toHaveBeenCalled()
})
