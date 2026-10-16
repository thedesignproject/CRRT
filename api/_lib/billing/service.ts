import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import type { AuthenticatedUser } from '../auth.js'
import { assertCloudPrice } from './cloud-prices.js'
import { billingConfig, stripeClient } from './config.js'
import { accountForCustomer, getAccount, recordEvent, withAccount, type BillingAccount } from './store.js'

import { cloudPriceCatalog, isCloud, planForPrice, selectionForPrice, type BillingCycle, type CloudPlan } from './plans.js'

const terminal = new Set(['canceled', 'incomplete_expired'])
type Save = (values: Partial<BillingAccount>) => Promise<void>

// Every portal entry point must apply the same legacy protection, including
// checkout recovery redirects. Never fall back to the default configuration.
async function portalSession(stripe: Stripe, account: BillingAccount, customerId: string, returnUrl: string) {
  let configuration: string | undefined
  if (isCloud() && account.is_legacy) {
    configuration = process.env.STRIPE_LEGACY_PORTAL_CONFIGURATION_ID
    if (!configuration || !/^bpc_[A-Za-z0-9]+$/.test(configuration)) throw new Error('Legacy billing portal is not configured')
    const settings = await stripe.billingPortal.configurations.retrieve(configuration)
    if (!settings.active || settings.features.subscription_update.enabled !== false
      || !settings.features.subscription_cancel.enabled || settings.features.subscription_cancel.mode !== 'at_period_end') {
      throw new Error('Legacy billing portal must disable plan changes and allow cancellation at period end')
    }
  }
  return stripe.billingPortal.sessions.create({
    customer: customerId, return_url: returnUrl, ...(configuration ? { configuration } : {}),
  })
}

async function synchronize(stripe: Stripe, account: BillingAccount, save: Save) {
  if (!account.customer_id) return null
  let page = await stripe.subscriptions.list({ customer: account.customer_id, status: 'all', limit: 100 })
  const history = [...page.data]
  while (page.has_more) {
    const last = page.data[page.data.length-1]
    if (!last) throw new Error('Invalid subscription pagination')
    page = await stripe.subscriptions.list({customer:account.customer_id,status:'all',limit:100,starting_after:last.id})
    history.push(...page.data)
  }
  const current = history.find((item) => !terminal.has(item.status)) ?? history[0]
  const item = current?.items.data[0]
  await save({
    subscription_id: current?.id ?? null, subscription_status: current?.status ?? null,
    price_id: item?.price.id ?? null,
    ...(isCloud() ? {
      plan: planForPrice(item?.price.id ?? null),
      period_start: item ? new Date(item.current_period_start * 1000).toISOString() : null,
      trial_used: Boolean(account.trial_used || history.some(subscription => subscription.trial_start != null)),
      // No implicit client-timed grace; an explicit server policy may set grace_until.
      ...(current?.status !== 'past_due' ? { grace_until: null } : {}),
    } : {}),
    period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    // Flexible billing uses cancel_at even for end-of-period cancellation.
    cancel_at_period_end: Boolean(current && !terminal.has(current.status) && (current.cancel_at_period_end || current.cancel_at != null)),
  })
  return current ?? null
}

export async function billingSummary(userId: string) {
  const price = await stripeClient().prices.retrieve(billingConfig().price)
  if (price.unit_amount === null || !price.recurring) throw new Error('A fixed recurring price is required')
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency, currencyDisplay: 'symbol', minimumFractionDigits: 0 })
  const digits = formatter.resolvedOptions().maximumFractionDigits!
  const amount = formatter.format(price.unit_amount / 10 ** digits)
  const { interval, interval_count: count } = price.recurring
  const proPrice = { amount, interval: count === 1 ? interval : `${count} ${interval}s` }
  const account = await getAccount(userId)
  // Refresh from Stripe on return, including when a webhook is delayed. The
  // redirect query string itself never determines payment or access state.
  if (account?.customer_id) await withAccount(userId, (locked, save) => synchronize(stripeClient(), locked, save))
  const latest = account?.customer_id ? await getAccount(userId) : account
  const pendingPrice = latest?.checkout_payload?.line_items?.[0]?.price
  const existing = latest?.subscription_status && !terminal.has(latest.subscription_status)
  const selection = isCloud() ? selectionForPrice(existing ? latest.price_id : typeof pendingPrice === 'string' ? pendingPrice : latest?.price_id ?? null) : null
  return {
    enabled: true, testMode: true, proPrice, status: latest?.subscription_status ?? 'free',
    periodEnd: latest?.period_end ?? null, cancelAtPeriodEnd: latest?.cancel_at_period_end ?? false,
    canManage: Boolean(latest?.customer_id),
    ...(isCloud() ? { billingCycle: selection?.cycle ?? 'monthly', ...(!existing && selection ? { checkoutPlan: selection.plan } : {}) } : {}),
  }
}

export async function checkout(user: AuthenticatedUser, plan: CloudPlan = 'pro', cycle: BillingCycle = 'monthly') {
  const config = billingConfig()
  const stripe = stripeClient()
  const cloud = isCloud()
  const price = cloud ? cloudPriceCatalog(process.env, cycle)[plan] : config.price
  if (cloud) assertCloudPrice(plan, await stripe.prices.retrieve(price), cycle)
  return withAccount(user.userId, async (account, save) => {
    if (cloud && account.is_legacy && plan === 'pro') throw new Error('Cloud Pro is included for legacy users. Choose Cloud Studio to upgrade.')
    let customerId = account.customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { crrt_user_id: user.userId } }, { idempotencyKey: `crrt-customer-${user.userId}` })
      customerId = customer.id
      await save({ customer_id: customerId })
      account.customer_id = customerId
    }
    const subscription = await synchronize(stripe, account, save)
    if (subscription && !terminal.has(subscription.status)) {
      return { url: (await portalSession(stripe, account, customerId, config.returnUrl)).url }
    }
    // Inspect the saved session directly. An open session can complete on Stripe
    // at any time, so never infer expiry from its absence in an open-session list.
    // Include completed sessions when recovering a create whose DB save failed.
    // A persisted create whose result is unknown must retain its exact payload
    // and key across lease recovery. An unrelated older expired session is not
    // evidence that the pending attempt finished.
    let pending = account.checkout_payload
    if (pending && !account.checkout_session_id && pending.expires_at! <= Math.floor(Date.now()/1000)) {
      // A stale worker cannot create a payable session with this past expiry.
      await save({checkout_attempt:randomUUID(),checkout_payload:null})
      pending=null
    }
    const previous = account.checkout_session_id
      ? await stripe.checkout.sessions.retrieve(account.checkout_session_id, { expand: ['line_items'] })
      : pending ? undefined : (await stripe.checkout.sessions.list({ customer: customerId, limit: 1, expand: ['data.line_items'] })).data[0]
    let attempt = account.checkout_attempt
    if (previous) {
      await save({ checkout_session_id: previous.id })
      if (previous.status === 'complete' && (!subscription || previous.subscription !== subscription.id)) {
        return { url: (await portalSession(stripe, account, customerId, config.returnUrl)).url }
      }
      if (previous.status === 'open') {
        const items = previous.line_items
        if (previous.url && items && !items.has_more && items.data.length === 1 && items.data[0].price?.id === price && items.data[0].quantity === 1) {
          return { url: previous.url }
        }
        // Stripe atomically refuses expiry if payment won the race. On failure,
        // stop; a retry will observe completion instead of creating a duplicate.
        const expired = await stripe.checkout.sessions.expire(previous.id)
        if (expired.status !== 'expired') throw new Error('Checkout is updating; please retry')
      } else if (previous.status !== 'expired' && previous.status !== 'complete') {
        throw new Error('Checkout is updating; please retry')
      }
      attempt = randomUUID()
      await save({ checkout_attempt: attempt, checkout_session_id: null, checkout_payload:null })
      pending=null
    }
    const payload: Stripe.Checkout.SessionCreateParams = pending ?? {
      managed_payments: { enabled: false },
      customer: customerId, mode: 'subscription', line_items: [{ price, quantity: 1 }],
      client_reference_id: user.userId, subscription_data: { metadata: { crrt_user_id: user.userId },
        ...(cloud && !account.trial_used ? { trial_period_days: 14 } : {}),
      },
      ...(cloud ? { payment_method_collection: 'always' as const, automatic_tax: { enabled: true },
        billing_address_collection: 'required' as const, customer_update: { address: 'auto' as const },
      } : {}),
      success_url: config.returnUrl, cancel_url: config.returnUrl,
      // Fixed on admission, never recomputed by a recovering worker. Thirty-five
      // minutes leaves room for Stripe's minimum thirty-minute creation window.
      expires_at: Math.floor(Date.now()/1000)+35*60,
    }
    if (!pending) await save({checkout_payload:payload})
    // Preserve even definitive failures until expiry. Immediate key rotation can
    // let a paused worker create a competing Checkout after configuration changes.
    const session = await stripe.checkout.sessions.create(payload, { idempotencyKey: `crrt-checkout-${attempt}` })
    await save({ checkout_session_id: session.id })
    if (!session.url || session.status !== 'open') throw new Error('Checkout is not available; please retry')
    if (payload.line_items?.[0]?.price !== price) throw new Error('Checkout recovered; retry to select the requested plan')
    return { url: session.url }
  })
}

export async function portal(userId: string) {
  const account = await getAccount(userId)
  if (!account?.customer_id) return null
  const session = await portalSession(stripeClient(), account, account.customer_id, billingConfig().returnUrl)
  return { url: session.url }
}

export async function processBillingEvent(event: Stripe.Event) {
  if (event.livemode !== (process.env.STRIPE_MODE === 'live')) throw new Error('Stripe event environment does not match billing')
  const supported = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed']
  if (!supported.includes(event.type)) return
  const object = event.data.object as { customer: string | { id: string } | null }
  const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id
  if (!customerId) throw new Error('Missing billing customer')
  const account = await accountForCustomer(customerId)
  // Other products in the same Stripe test account may emit these events.
  if (!account) return
  // Reconcile the current Stripe object under an account lease. Duplicate and
  // out-of-order events cannot replay an older subscription snapshot.
  await withAccount(account.user_id, (locked, save) => synchronize(stripeClient(), locked, save))
  await recordEvent(event.id, event.type)
}
