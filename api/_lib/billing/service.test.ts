import type Stripe from 'stripe'
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./config.js', () => ({ billingConfig: vi.fn(), stripeClient: vi.fn() }))
vi.mock('./store.js', () => ({ getAccount: vi.fn(), accountForCustomer: vi.fn(), recordEvent: vi.fn(), withAccount: vi.fn() }))
import { billingConfig, stripeClient } from './config.js'
import { accountForCustomer, getAccount, recordEvent, withAccount, type BillingAccount } from './store.js'
import { billingSummary, checkout, portal, processBillingEvent } from './service.js'
const user = { userId: 'user-a', email: 'a@example.com' }
const save = vi.fn()
const sdk = { prices: { retrieve: vi.fn() }, customers: { create: vi.fn() }, subscriptions: { list: vi.fn() }, checkout: { sessions: { list: vi.fn(), create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } }, billingPortal: { sessions: { create: vi.fn() } } }
let account: BillingAccount
function sub(status = 'active', id = 'sub') {
  return { id, status, items: { data: [{ price: { id: 'price_old' }, current_period_end: 1800000000 }] }, cancel_at_period_end: false }
}
function event(type = 'customer.subscription.updated', customer: unknown = 'cus') {
  return { id: 'evt', type, livemode: false, data: { object: { customer, status: 'canceled' } } } as Stripe.Event
}
beforeEach(() => {
  vi.resetAllMocks()
  account = { user_id: user.userId, customer_id: null, checkout_attempt: 'attempt', checkout_session_id: null, subscription_id: null, subscription_status: null, price_id: null, period_end: null, cancel_at_period_end: false, lock_token: null }
  vi.mocked(billingConfig).mockReturnValue({ secret: 'sk_test', price: 'price_configured', webhookSecret: 'whsec', returnUrl: 'https://preview.example/dashboard/' })
  vi.mocked(stripeClient).mockReturnValue(sdk as unknown as Stripe)
  vi.mocked(withAccount).mockImplementation(async (_id, op) => op(account, save))
  vi.mocked(getAccount).mockImplementation(async () => account)
  sdk.prices.retrieve.mockResolvedValue({ unit_amount: 1000, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } })
  sdk.customers.create.mockResolvedValue({ id: 'cus' })
  sdk.subscriptions.list.mockResolvedValue({ data: [] })
  sdk.checkout.sessions.list.mockResolvedValue({ data: [] })
  sdk.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_old', status: 'expired' })
  sdk.checkout.sessions.expire.mockResolvedValue({ status: 'expired' })
  sdk.checkout.sessions.create.mockResolvedValue({ id: 'cs', url: 'https://checkout.stripe.com/c/test', status: 'open' })
  sdk.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.com/p/test' })
})
it('returns a free summary with configured pricing without creating a customer', async () => {
  vi.mocked(getAccount).mockResolvedValue(null)
  expect(await billingSummary('u')).toEqual({ enabled: true, testMode: true, proPrice: { amount: '$10', interval: 'month' }, status: 'free', periodEnd: null, cancelAtPeriodEnd: false, canManage: false })
  expect(sdk.prices.retrieve).toHaveBeenCalledWith('price_configured')
  expect(sdk.customers.create).not.toHaveBeenCalled()
  vi.mocked(getAccount).mockResolvedValue(account)
  expect((await billingSummary('u')).status).toBe('free')
})
it('refreshes persisted subscription state from Stripe on billing reads', async () => {
  Object.assign(account, { customer_id: 'cus', subscription_status: 'past_due', period_end: '2027-01-01', cancel_at_period_end: true })
  sdk.subscriptions.list.mockResolvedValue({ data: [{ ...sub('past_due'), cancel_at_period_end: true }] })
  expect(await billingSummary('u')).toMatchObject({ status: 'past_due', periodEnd: '2027-01-01', cancelAtPeriodEnd: true, canManage: true })
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ subscription_status: 'past_due', cancel_at_period_end: true }))
})
it('creates owner-bound customers and checkout using only configured prices and URLs', async () => {
  expect(await checkout(user)).toEqual({ url: 'https://checkout.stripe.com/c/test' })
  expect(sdk.customers.create).toHaveBeenCalledWith({ metadata: { crrt_user_id: 'user-a' } }, { idempotencyKey: 'crrt-customer-user-a' })
  expect(sdk.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ managed_payments: { enabled: false }, customer: 'cus', line_items: [{ price: 'price_configured', quantity: 1 }], success_url: 'https://preview.example/dashboard/', client_reference_id: 'user-a' }), { idempotencyKey: 'crrt-checkout-attempt' })
  expect(save).toHaveBeenCalledWith({ checkout_session_id: 'cs' })
})
it('reuses an open session after a lost response instead of creating another', async () => {
  account.customer_id = 'cus'
  sdk.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_recovered', status: 'open', url: 'https://checkout.stripe.com/recovered', line_items: { has_more: false, data: [{ price: { id: 'price_configured' }, quantity: 1 }] } }] })
  expect(await checkout(user)).toEqual({ url: 'https://checkout.stripe.com/recovered' })
  expect(sdk.customers.create).not.toHaveBeenCalled(); expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
})
it('rotates the persisted attempt after an expired checkout and permits resubscription', async () => {
  Object.assign(account, { customer_id: 'cus', checkout_session_id: 'cs_old' })
  sdk.subscriptions.list.mockResolvedValue({ data: [sub('canceled')] })
  sdk.checkout.sessions.list.mockResolvedValue({ data: [{ url: null }] })
  await checkout(user)
  const attempt = save.mock.calls.find(([value]) => value.checkout_attempt)![0].checkout_attempt
  expect(attempt).not.toBe('attempt')
  expect(sdk.checkout.sessions.create.mock.calls[0][1]).toEqual({ idempotencyKey: `crrt-checkout-${attempt}` })
})
it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])('routes %s subscriptions to the portal and never creates a second subscription', async (status) => {
  account.customer_id = 'cus'; sdk.subscriptions.list.mockResolvedValue({ data: [sub(status)] })
  expect(await checkout(user)).toEqual({ url: 'https://billing.stripe.com/p/test' })
  expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
})
it('selects a current subscription ahead of canceled history', async () => {
  account.customer_id = 'cus'; sdk.subscriptions.list.mockResolvedValue({ data: [sub('canceled', 'old'), sub('active', 'new')] })
  await checkout(user); expect(save).toHaveBeenCalledWith(expect.objectContaining({ subscription_id: 'new' }))
})
it.each([{ url: null, status: 'open' }, { url: 'https://checkout.stripe.com/old', status: 'complete' }])('persists unusable checkout ids so a later retry can recover', async (session) => {
  sdk.checkout.sessions.create.mockResolvedValue({ id: 'cs_old', ...session })
  await expect(checkout(user)).rejects.toThrow('Checkout is not available')
  expect(save).toHaveBeenCalledWith({ checkout_session_id: 'cs_old' })
})
it('keeps a recoverable attempt after Stripe errors', async () => {
  sdk.checkout.sessions.create.mockRejectedValue(new Error('timeout'))
  await expect(checkout(user)).rejects.toThrow('timeout')
  expect(save).not.toHaveBeenCalledWith(expect.objectContaining({ checkout_attempt: expect.anything() }))
})
it('opens the portal only for the user’s stored customer', async () => {
  vi.mocked(getAccount).mockResolvedValueOnce(null)
  expect(await portal('u')).toBeNull(); expect(await portal('u')).toBeNull()
  account.customer_id = 'cus'; await portal('u')
  expect(sdk.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus', return_url: 'https://preview.example/dashboard/' })
})
it('ignores unrelated events and customers but rejects live and malformed events', async () => {
  await processBillingEvent(event('payment_intent.created'))
  expect(accountForCustomer).not.toHaveBeenCalled()
  await processBillingEvent(event()); expect(withAccount).not.toHaveBeenCalled()
  await expect(processBillingEvent({ ...event(), livemode: true })).rejects.toThrow('Live events')
  await expect(processBillingEvent(event('invoice.paid', null))).rejects.toThrow('Missing billing customer')
})
it('reconciles current state for duplicate and out-of-order events, including expanded customers', async () => {
  account.customer_id = 'cus'; vi.mocked(accountForCustomer).mockResolvedValue(account)
  sdk.subscriptions.list.mockResolvedValue({ data: [sub()] })
  await processBillingEvent(event()); await processBillingEvent(event('customer.subscription.deleted', { id: 'cus' }))
  expect(save).toHaveBeenCalledTimes(2)
  for (const [value] of save.mock.calls) expect(value.subscription_status).toBe('active')
  expect(recordEvent).toHaveBeenCalledTimes(2)
})
it('does not acknowledge a failed reconciliation', async () => {
  account.customer_id = 'cus'; vi.mocked(accountForCustomer).mockResolvedValue(account)
  sdk.subscriptions.list.mockRejectedValue(new Error('offline'))
  await expect(processBillingEvent(event())).rejects.toThrow('offline')
  expect(recordEvent).not.toHaveBeenCalled()
})
it('handles no customer during reconciliation without calling Stripe', async () => {
  vi.mocked(accountForCustomer).mockResolvedValue(account)
  await processBillingEvent(event())
  expect(sdk.subscriptions.list).not.toHaveBeenCalled()
})

it.each([null, sub('canceled', 'older')])('prevents duplicate checkout while a completed session subscription is becoming visible', async (subscription) => {
  Object.assign(account, { customer_id: 'cus', checkout_session_id: 'cs_complete' })
  sdk.subscriptions.list.mockResolvedValue({ data: subscription ? [subscription] : [] })
  sdk.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete', subscription: 'new-sub' })
  expect(await checkout(user)).toEqual({ url: 'https://billing.stripe.com/p/test' })
  expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
})
it('allows a new checkout after the completed session subscription was canceled', async () => {
  Object.assign(account, { customer_id: 'cus', checkout_session_id: 'cs_complete' })
  sdk.subscriptions.list.mockResolvedValue({ data: [sub('canceled', 'sub')] })
  sdk.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete', subscription: 'sub' })
  expect(await checkout(user)).toEqual({ url: 'https://checkout.stripe.com/c/test' })
})

it('formats zero-decimal currencies and multi-month billing intervals', async () => {
  sdk.prices.retrieve.mockResolvedValue({ unit_amount: 1500, currency: 'jpy', recurring: { interval: 'month', interval_count: 3 } })
  expect((await billingSummary('u')).proPrice).toEqual({ amount: '¥1,500', interval: '3 months' })
})
it.each([{ unit_amount: null, recurring: {} }, { unit_amount: 1000, recurring: null }])('rejects prices without a fixed recurring amount', async (price) => {
  sdk.prices.retrieve.mockResolvedValue(price)
  await expect(billingSummary('u')).rejects.toThrow('A fixed recurring price is required')
})

it('preserves cents in non-whole prices', async () => {
  sdk.prices.retrieve.mockResolvedValue({ unit_amount: 1050, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } })
  expect((await billingSummary('u')).proPrice.amount).toBe('$10.5')
})

function openSession(overrides = {}) {
  return { id: 'cs_old', status: 'open', url: 'https://checkout.stripe.com/old', line_items: { has_more: false, data: [{ price: { id: 'price_configured' }, quantity: 1 }] }, ...overrides }
}
it('returns the same saved session even if it completes after retrieval', async () => {
  account.checkout_session_id = 'cs_old'
  sdk.checkout.sessions.retrieve.mockResolvedValue(openSession())
  expect(await checkout(user)).toEqual({ url: 'https://checkout.stripe.com/old' })
  expect(sdk.checkout.sessions.list).not.toHaveBeenCalled()
  expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
})
it.each([
  { line_items: { has_more: false, data: [{ price: { id: 'old_price' }, quantity: 1 }] } },
  { url: null }, { line_items: null },
  { line_items: { has_more: true, data: [] } },
  { line_items: { has_more: false, data: [] } },
  { line_items: { has_more: false, data: [{ price: null, quantity: 1 }] } },
  { line_items: { has_more: false, data: [{ price: { id: 'price_configured' }, quantity: 2 }] } },
])('expires mismatched or unusable open sessions before replacement: %j', async (overrides) => {
  sdk.checkout.sessions.list.mockResolvedValue({ data: [openSession(overrides)] })
  await checkout(user)
  expect(sdk.checkout.sessions.expire).toHaveBeenCalledWith('cs_old')
  expect(sdk.checkout.sessions.expire.mock.invocationCallOrder[0]).toBeLessThan(sdk.checkout.sessions.create.mock.invocationCallOrder[0])
})
it('does not replace a stale-price checkout when payment wins the expiry race', async () => {
  account.checkout_session_id = 'cs_old'
  sdk.checkout.sessions.retrieve.mockResolvedValue(openSession({ line_items: null }))
  sdk.checkout.sessions.expire.mockRejectedValue(new Error('Session already complete'))
  await expect(checkout(user)).rejects.toThrow('Session already complete')
  expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
  sdk.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_old', status: 'complete', subscription: 'new' })
  expect(await checkout(user)).toEqual({ url: 'https://billing.stripe.com/p/test' })
})
it('recovers a completed session after its initial database save was lost', async () => {
  sdk.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_lost', status: 'complete', subscription: 'new' }] })
  expect(await checkout(user)).toEqual({ url: 'https://billing.stripe.com/p/test' })
  expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
})
it('fails closed if expiry is unconfirmed or session state is unknown', async () => {
  sdk.checkout.sessions.list.mockResolvedValue({ data: [openSession({ line_items: null })] })
  sdk.checkout.sessions.expire.mockResolvedValue({ status: 'complete' })
  await expect(checkout(user)).rejects.toThrow('Checkout is updating')
  sdk.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs', status: null }] })
  await expect(checkout(user)).rejects.toThrow('Checkout is updating')
  expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
})
