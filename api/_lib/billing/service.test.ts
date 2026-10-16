import Stripe from 'stripe'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('./config.js', () => ({ billingConfig: vi.fn(), stripeClient: vi.fn() }))
vi.mock('./store.js', () => ({ getAccount: vi.fn(), accountForCustomer: vi.fn(), recordEvent: vi.fn(), withAccount: vi.fn() }))
import { billingConfig, stripeClient } from './config.js'
import { accountForCustomer, getAccount, recordEvent, withAccount, type BillingAccount } from './store.js'
import { billingSummary, checkout, portal, processBillingEvent } from './service.js'
const user = { userId: 'user-a', email: 'a@example.com' }
const save = vi.fn()
const sdk = { prices: { retrieve: vi.fn() }, customers: { create: vi.fn() }, subscriptions: { list: vi.fn() }, checkout: { sessions: { list: vi.fn(), create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } }, billingPortal: { configurations: { retrieve: vi.fn() }, sessions: { create: vi.fn() } } }
let account: BillingAccount
function sub(status = 'active', id = 'sub') {
  return { id, status, items: { data: [{ price: { id: 'price_old' }, current_period_start: 1700000000, current_period_end: 1800000000 }] }, cancel_at_period_end: false }
}
function event(type = 'customer.subscription.updated', customer: unknown = 'cus') {
  return { id: 'evt', type, livemode: false, data: { object: { customer, status: 'canceled' } } } as Stripe.Event
}
afterEach(()=>vi.unstubAllEnvs())
beforeEach(() => {
  vi.stubEnv('CRRT_DEPLOYMENT_MODE','community')
  vi.stubEnv('STRIPE_MODE','test')
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
it('preserves rejected attempts until fixed expiry so delayed workers cannot compete', async () => {
  save.mockImplementation(async values => { Object.assign(account, values) })
  const rejected = new Stripe.errors.StripeInvalidRequestError({ message: 'Tax configuration missing', statusCode: 400 })
  sdk.checkout.sessions.create.mockRejectedValueOnce(rejected)
  await expect(checkout(user)).rejects.toBe(rejected)
  expect(account.checkout_attempt).toBe('attempt')
  const payload=account.checkout_payload
  await checkout(user)
  expect(sdk.checkout.sessions.create.mock.calls[1]).toEqual([payload,{idempotencyKey:'crrt-checkout-attempt'}])
})

it('preserves the key for a conflicting request that may still be creating checkout', async () => {
  const conflict = new Stripe.errors.StripeInvalidRequestError({ message: 'Request in progress', statusCode: 409 })
  sdk.checkout.sessions.create.mockRejectedValueOnce(conflict)
  await expect(checkout(user)).rejects.toBe(conflict)
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
  await expect(processBillingEvent({ ...event(), livemode: true })).rejects.toThrow('environment')
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

it('persists trusted Cloud plans, windows and irrevocable trial history during reconciliation',async()=>{
  vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud')
  vi.stubEnv('STRIPE_PRO_PRICE_ID','price_pro');vi.stubEnv('STRIPE_STUDIO_PRICE_ID','price_studio')
  account.customer_id='cus'
  vi.mocked(accountForCustomer).mockResolvedValue(account)
  sdk.subscriptions.list.mockResolvedValue({data:[{...sub('trialing'),trial_start:1700000000,items:{data:[{price:{id:'price_pro'},current_period_start:1700000000,current_period_end:1800000000}]}}]})
  await processBillingEvent(event())
  expect(save).toHaveBeenCalledWith(expect.objectContaining({plan:'pro',trial_used:true,period_start:new Date(1700000000000).toISOString(),grace_until:null}))
  account.trial_used=true
  sdk.subscriptions.list.mockResolvedValue({data:[]});await processBillingEvent(event())
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({plan:null,trial_used:true,period_start:null}))
  account.trial_used=false
  sdk.subscriptions.list.mockResolvedValue({data:[{...sub('past_due'),items:{data:[{price:{id:'price_studio'},current_period_start:1700000000,current_period_end:1800000000}]}}]})
  await processBillingEvent(event());expect(save).toHaveBeenLastCalledWith(expect.objectContaining({plan:'studio',trial_used:false}))
  expect(save.mock.lastCall![0]).not.toHaveProperty('grace_until')
})
it('accepts live events only for an explicitly configured live deployment',async()=>{
  vi.stubEnv('STRIPE_MODE','live')
  await expect(processBillingEvent(event())).rejects.toThrow('environment')
  vi.mocked(accountForCustomer).mockResolvedValue(null)
  await processBillingEvent({...event(),livemode:true})
})

it.each(['pro','studio'] as const)('starts a payment-method-backed %s trial and never repeats it',async plan=>{
  sdk.prices.retrieve.mockImplementation(async id=>({active:true,currency:'usd',unit_amount:id==='price_studio'?4900:1900,recurring:{interval:'month',interval_count:1},tax_behavior:'exclusive'}))
  vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud')
  vi.stubEnv('STRIPE_PRO_PRICE_ID','price_pro');vi.stubEnv('STRIPE_STUDIO_PRICE_ID','price_studio')
  await checkout(user,plan)
  expect(sdk.checkout.sessions.create).toHaveBeenLastCalledWith(expect.objectContaining({
    line_items:[{price:'price_'+plan,quantity:1}],payment_method_collection:'always',automatic_tax:{enabled:true},billing_address_collection:'required',customer_update:{address:'auto'},
    subscription_data:{metadata:{crrt_user_id:'user-a'},trial_period_days:14},
  }),expect.anything())
  account.trial_used=true;account.checkout_payload=null;account.checkout_session_id=null
  await checkout(user,plan)
  expect(sdk.checkout.sessions.create.mock.lastCall![0].subscription_data).not.toHaveProperty('trial_period_days')
})

it('validates Cloud pricing before creating a customer or accepting a direct checkout request',async()=>{
 vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud');vi.stubEnv('STRIPE_PRO_PRICE_ID','price_pro');vi.stubEnv('STRIPE_STUDIO_PRICE_ID','price_studio')
 sdk.prices.retrieve.mockResolvedValue({active:true,currency:'usd',unit_amount:100,recurring:{interval:'year',interval_count:1}})
 await expect(checkout(user,'pro')).rejects.toThrow('approved monthly catalog')
 expect(sdk.customers.create).not.toHaveBeenCalled();expect(withAccount).not.toHaveBeenCalled()
})

it('paginates subscription history before granting a first trial',async()=>{
 account.customer_id='cus'
 vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud');vi.stubEnv('STRIPE_PRO_PRICE_ID','price_pro');vi.stubEnv('STRIPE_STUDIO_PRICE_ID','price_studio')
 vi.mocked(accountForCustomer).mockResolvedValue(account)
 sdk.subscriptions.list.mockResolvedValueOnce({data:[sub('canceled','newest')],has_more:true}).mockResolvedValueOnce({data:[{...sub('canceled','old-trial'),trial_start:1}],has_more:false})
 await processBillingEvent(event())
 expect(sdk.subscriptions.list).toHaveBeenLastCalledWith({customer:'cus',status:'all',limit:100,starting_after:'newest'})
 expect(save).toHaveBeenCalledWith(expect.objectContaining({trial_used:true}))
 sdk.subscriptions.list.mockResolvedValue({data:[],has_more:true})
 await expect(processBillingEvent(event())).rejects.toThrow('pagination')
})
it('recovers pending Checkout with identical parameters/key despite an older expired session and different plan',async()=>{
 save.mockImplementation(async values=>Object.assign(account,values))
 account.customer_id='cus'
 sdk.checkout.sessions.create.mockRejectedValueOnce(new Error('lost response'))
 await expect(checkout(user)).rejects.toThrow('lost response')
 const first=sdk.checkout.sessions.create.mock.calls[0]
 sdk.checkout.sessions.list.mockResolvedValue({data:[{id:'older',status:'expired'}]})
 // A recovering worker sees new configuration, but must finish the admitted request.
 vi.mocked(billingConfig).mockReturnValue({secret:'sk_test',price:'other',webhookSecret:'whsec',returnUrl:'https://new.example/dashboard/'})
 await expect(checkout(user)).rejects.toThrow('Checkout recovered')
 expect(sdk.checkout.sessions.create.mock.calls[1]).toEqual(first)
 expect(sdk.checkout.sessions.list).toHaveBeenCalledTimes(1)
 expect(sdk.checkout.sessions.expire).not.toHaveBeenCalled()
})
it('only rotates an unknown pending attempt after its immutable expiry',async()=>{
 save.mockImplementation(async values=>Object.assign(account,values))
 account.customer_id='cus'
 account.checkout_payload={mode:'subscription',expires_at:Math.floor(Date.now()/1000)-1,line_items:[{price:'price_configured',quantity:1}]}
 await checkout(user)
 expect(account.checkout_attempt).not.toBe('attempt')
 expect(sdk.checkout.sessions.create.mock.lastCall![0].expires_at).toBeGreaterThan(Math.floor(Date.now()/1000)+1800)
})

it('preserves the same attempt when delayed first creation is below Stripe minimum expiry',async()=>{
 account.customer_id='cus'
 account.checkout_payload={mode:'subscription',expires_at:Math.floor(Date.now()/1000)+1200,line_items:[{price:'price_configured',quantity:1}]}
 const pending=account.checkout_payload
 sdk.checkout.sessions.create.mockRejectedValue(new Stripe.errors.StripeInvalidRequestError({message:'Expiry must be at least thirty minutes',statusCode:400}))
 await expect(checkout(user)).rejects.toThrow('Expiry')
 expect(sdk.checkout.sessions.create).toHaveBeenCalledWith(pending,{idempotencyKey:'crrt-checkout-attempt'})
 expect(save).not.toHaveBeenCalledWith(expect.objectContaining({checkout_attempt:expect.anything()}))
})
it('prevents charging legacy users for included Pro and allows a Studio upgrade',async()=>{
 vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud');vi.stubEnv('STRIPE_PRO_PRICE_ID','price_pro');vi.stubEnv('STRIPE_STUDIO_PRICE_ID','price_studio')
 account.is_legacy=true
 sdk.prices.retrieve.mockImplementation(async id=>({active:true,currency:'usd',unit_amount:id==='price_studio'?4900:1900,recurring:{interval:'month',interval_count:1},tax_behavior:'exclusive'}))
 await expect(checkout(user,'pro')).rejects.toThrow('included for legacy users')
 expect(sdk.customers.create).not.toHaveBeenCalled();expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
 await checkout(user,'studio')
 expect(sdk.checkout.sessions.create.mock.lastCall![0].line_items).toEqual([{price:'price_studio',quantity:1}])
 expect(save.mock.calls.every(([values])=>!Object.prototype.hasOwnProperty.call(values,'is_legacy'))).toBe(true)
})

const legacyPortalSettings = {
 active:true,
 features:{subscription_update:{enabled:false},subscription_cancel:{enabled:true,mode:'at_period_end'}},
}
function legacyPortalSetup() {
 vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud')
 vi.stubEnv('STRIPE_PRO_PRICE_ID','price_pro');vi.stubEnv('STRIPE_STUDIO_PRICE_ID','price_studio')
 vi.stubEnv('STRIPE_LEGACY_PORTAL_CONFIGURATION_ID','bpc_legacy')
 account.is_legacy=true;account.customer_id='cus'
 sdk.prices.retrieve.mockImplementation(async id=>({active:true,currency:'usd',unit_amount:id==='price_studio'?4900:1900,recurring:{interval:'month',interval_count:1},tax_behavior:'exclusive'}))
 sdk.billingPortal.configurations.retrieve.mockResolvedValue(legacyPortalSettings)
}
function enterLegacyPortal(path:string) {
 if(path==='manage') return portal(user.userId)
 if(path==='active') sdk.subscriptions.list.mockResolvedValue({data:[{...sub(),items:{data:[{price:{id:'price_studio'},current_period_start:1700000000,current_period_end:1800000000}]}}]})
 else sdk.checkout.sessions.list.mockResolvedValue({data:[{id:'cs_completed',status:'complete',subscription:'new'}]})
 return checkout(user,'studio')
}
it.each(['manage','active','recovery'])('restricts the legacy portal configuration for %s entry',async path=>{
 legacyPortalSetup()
 expect(await enterLegacyPortal(path)).toEqual({url:'https://billing.stripe.com/p/test'})
 expect(sdk.billingPortal.configurations.retrieve).toHaveBeenCalledWith('bpc_legacy')
 expect(sdk.billingPortal.sessions.create).toHaveBeenCalledWith({customer:'cus',return_url:'https://preview.example/dashboard/',configuration:'bpc_legacy'})
 expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
})
it.each(['manage','active','recovery'])('fails closed without a legacy portal configuration for %s entry',async path=>{
 legacyPortalSetup();vi.stubEnv('STRIPE_LEGACY_PORTAL_CONFIGURATION_ID','')
 await expect(enterLegacyPortal(path)).rejects.toThrow('not configured')
 expect(sdk.billingPortal.sessions.create).not.toHaveBeenCalled()
})
it('rejects malformed or unavailable legacy portal configuration without a default fallback',async()=>{
 legacyPortalSetup();vi.stubEnv('STRIPE_LEGACY_PORTAL_CONFIGURATION_ID','default')
 await expect(portal(user.userId)).rejects.toThrow('not configured')
 expect(sdk.billingPortal.configurations.retrieve).not.toHaveBeenCalled()
 vi.stubEnv('STRIPE_LEGACY_PORTAL_CONFIGURATION_ID','bpc_missing')
 sdk.billingPortal.configurations.retrieve.mockRejectedValue(new Error('No such configuration'))
 await expect(portal(user.userId)).rejects.toThrow('No such configuration')
 expect(sdk.billingPortal.sessions.create).not.toHaveBeenCalled()
})
it.each([
 {...legacyPortalSettings,active:false},
 {...legacyPortalSettings,features:{...legacyPortalSettings.features,subscription_update:{enabled:true}}},
 {...legacyPortalSettings,features:{...legacyPortalSettings.features,subscription_cancel:{enabled:false,mode:'at_period_end'}}},
 {...legacyPortalSettings,features:{...legacyPortalSettings.features,subscription_cancel:{enabled:true,mode:'immediately'}}},
])('rejects an unsafe legacy portal configuration: %j',async settings=>{
 legacyPortalSetup();sdk.billingPortal.configurations.retrieve.mockResolvedValue(settings)
 await expect(portal(user.userId)).rejects.toThrow('must disable plan changes')
 expect(sdk.billingPortal.sessions.create).not.toHaveBeenCalled()
})
it('preserves the default portal for nonlegacy Cloud customers',async()=>{
 legacyPortalSetup();account.is_legacy=false
 await portal(user.userId)
 expect(sdk.billingPortal.configurations.retrieve).not.toHaveBeenCalled()
 expect(sdk.billingPortal.sessions.create).toHaveBeenCalledWith({customer:'cus',return_url:'https://preview.example/dashboard/'})
})
it('shows scheduled cancellation for flexible billing and clears it after the subscription ends',async()=>{
 account.customer_id='cus'
 save.mockImplementation(async values=>{Object.assign(account,values)})
 sdk.subscriptions.list.mockResolvedValue({data:[{...sub(),cancel_at:1800000000,cancel_at_period_end:false}]})
 expect(await billingSummary(user.userId)).toMatchObject({cancelAtPeriodEnd:true})
 sdk.subscriptions.list.mockResolvedValue({data:[{...sub('canceled'),cancel_at:1800000000,cancel_at_period_end:false}]})
 expect(await billingSummary(user.userId)).toMatchObject({cancelAtPeriodEnd:false})
})

function annualConfig() {
  vi.stubEnv('CRRT_DEPLOYMENT_MODE', 'cloud')
  vi.stubEnv('STRIPE_PRO_PRICE_ID', 'price_pro'); vi.stubEnv('STRIPE_STUDIO_PRICE_ID', 'price_studio')
  vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID', 'price_pro_year'); vi.stubEnv('STRIPE_STUDIO_YEARLY_PRICE_ID', 'price_studio_year')
  sdk.prices.retrieve.mockImplementation(async id => ({ active: true, currency: 'usd', unit_amount: id === 'price_pro_year' ? 19200 : 49200, recurring: { interval: 'year', interval_count: 1 } }))
}
it.each(['pro', 'studio'] as const)('uses the configured annual %s price in Checkout', async plan => {
  annualConfig()
  await checkout(user, plan, 'yearly')
  expect(sdk.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: `price_${plan}_year`, quantity: 1 }] }), expect.anything())
})
it('expires a pending monthly checkout before switching to annual', async () => {
  annualConfig(); account.customer_id = 'cus'; account.checkout_session_id = 'cs_monthly'
  sdk.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_monthly', status: 'open', url: 'https://checkout.stripe.com/monthly', line_items: { has_more: false, data: [{ price: { id: 'price_pro' }, quantity: 1 }] } })
  await checkout(user, 'pro', 'yearly')
  expect(sdk.checkout.sessions.expire).toHaveBeenCalledWith('cs_monthly')
  expect(sdk.checkout.sessions.create.mock.lastCall![0].line_items).toEqual([{ price: 'price_pro_year', quantity: 1 }])
})
it('reuses an identical open annual checkout', async () => {
  annualConfig(); account.customer_id = 'cus'; account.checkout_session_id = 'cs_annual'
  sdk.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_annual', status: 'open', url: 'https://checkout.stripe.com/annual', line_items: { has_more: false, data: [{ price: { id: 'price_pro_year' }, quantity: 1 }] } })
  expect(await checkout(user, 'pro', 'yearly')).toEqual({ url: 'https://checkout.stripe.com/annual' })
  expect(sdk.checkout.sessions.create).not.toHaveBeenCalled()
})
it('reconciles annual webhook subscriptions into the same plan and preserves cycle in summaries', async () => {
  annualConfig(); account.customer_id = 'cus'
  save.mockImplementation(async values => Object.assign(account, values))
  vi.mocked(accountForCustomer).mockResolvedValue(account)
  sdk.subscriptions.list.mockResolvedValue({ data: [{ ...sub(), items: { data: [{ price: { id: 'price_studio_year' }, current_period_start: 1700000000, current_period_end: 1731536000 }] } }] })
  await processBillingEvent(event())
  expect(account).toMatchObject({ plan: 'studio', price_id: 'price_studio_year', subscription_status: 'active' })
  expect(await billingSummary(user.userId)).toMatchObject({ billingCycle: 'yearly', status: 'active' })
})
it('keeps unknown attempt payloads immutable when changing billing cycle', async () => {
  annualConfig(); account.customer_id = 'cus'
  account.checkout_payload = { mode: 'subscription', expires_at: Math.floor(Date.now()/1000)+1800, line_items: [{ price: 'price_pro', quantity: 1 }] }
  await expect(checkout(user, 'pro', 'yearly')).rejects.toThrow('Checkout recovered')
  expect(sdk.checkout.sessions.create).toHaveBeenCalledWith(account.checkout_payload, { idempotencyKey: 'crrt-checkout-attempt' })
})

it('recovers a canceled annual Checkout selection without mistaking it for an active plan', async () => {
  annualConfig(); account.customer_id = 'cus'
  account.checkout_payload = { mode:'subscription',line_items:[{price:'price_studio_year',quantity:1}] }
  save.mockImplementation(async values => Object.assign(account,values))
  expect(await billingSummary(user.userId)).toMatchObject({ status:'free',billingCycle:'yearly',checkoutPlan:'studio' })
  sdk.subscriptions.list.mockResolvedValue({ data: [sub('active')] })
  expect(await billingSummary(user.userId)).toMatchObject({ billingCycle:'monthly' })
})

it('uses the previous annual subscription price when a canceled account has no pending checkout', async () => {
  annualConfig(); account.customer_id = 'cus'
  save.mockImplementation(async values => Object.assign(account, values))
  sdk.subscriptions.list.mockResolvedValue({ data: [{ ...sub('canceled'), items: { data: [{ price: { id: 'price_pro_year' }, current_period_start: 1700000000, current_period_end: 1731536000 }] } }] })
  expect(await billingSummary(user.userId)).toMatchObject({ status: 'canceled', billingCycle: 'yearly', checkoutPlan: 'pro' })
})

it('defaults a new Cloud account without a stored price to monthly without inventing a checkout plan', async () => {
  annualConfig()
  const summary = await billingSummary(user.userId)
  expect(summary).toMatchObject({ billingCycle: 'monthly', canManage: false })
  expect(summary).not.toHaveProperty('checkoutPlan')
})

it('returns the same safe defaults before a Cloud billing account exists', async () => {
  annualConfig(); vi.mocked(getAccount).mockResolvedValue(null)
  const summary = await billingSummary(user.userId)
  expect(summary).toMatchObject({ billingCycle: 'monthly', canManage: false })
  expect(summary).not.toHaveProperty('checkoutPlan')
})
