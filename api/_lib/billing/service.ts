import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import type { AuthenticatedUser } from '../auth.js'
import { billingConfig, stripeClient } from './config.js'
import { accountForCustomer, getAccount, recordEvent, withAccount, type BillingAccount } from './store.js'

const terminal = new Set(['canceled', 'incomplete_expired'])
type Save = (values: Partial<BillingAccount>) => Promise<void>

async function synchronize(stripe: Stripe, account: BillingAccount, save: Save) {
  if (!account.customer_id) return null
  const subscriptions = await stripe.subscriptions.list({ customer: account.customer_id, status: 'all', limit: 100 })
  const current = subscriptions.data.find((item) => !terminal.has(item.status)) ?? subscriptions.data[0]
  const item = current?.items.data[0]
  await save({
    subscription_id: current?.id ?? null, subscription_status: current?.status ?? null,
    price_id: item?.price.id ?? null,
    period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: current?.cancel_at_period_end ?? false,
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
  return {
    enabled: true, testMode: true, proPrice, status: latest?.subscription_status ?? 'free',
    periodEnd: latest?.period_end ?? null, cancelAtPeriodEnd: latest?.cancel_at_period_end ?? false,
    canManage: Boolean(latest?.customer_id),
  }
}

export async function checkout(user: AuthenticatedUser) {
  const config = billingConfig()
  const stripe = stripeClient()
  return withAccount(user.userId, async (account, save) => {
    let customerId = account.customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { crrt_user_id: user.userId } }, { idempotencyKey: `crrt-customer-${user.userId}` })
      customerId = customer.id
      await save({ customer_id: customerId })
      account.customer_id = customerId
    }
    const subscription = await synchronize(stripe, account, save)
    if (subscription && !terminal.has(subscription.status)) {
      return { url: (await stripe.billingPortal.sessions.create({ customer: customerId, return_url: config.returnUrl })).url }
    }
    // Inspect the saved session directly. An open session can complete on Stripe
    // at any time, so never infer expiry from its absence in an open-session list.
    // Include completed sessions when recovering a create whose DB save failed.
    const previous = account.checkout_session_id
      ? await stripe.checkout.sessions.retrieve(account.checkout_session_id, { expand: ['line_items'] })
      : (await stripe.checkout.sessions.list({ customer: customerId, limit: 1, expand: ['data.line_items'] })).data[0]
    let attempt = account.checkout_attempt
    if (previous) {
      await save({ checkout_session_id: previous.id })
      if (previous.status === 'complete' && (!subscription || previous.subscription !== subscription.id)) {
        return { url: (await stripe.billingPortal.sessions.create({ customer: customerId, return_url: config.returnUrl })).url }
      }
      if (previous.status === 'open') {
        const items = previous.line_items
        if (previous.url && items && !items.has_more && items.data.length === 1 && items.data[0].price?.id === config.price && items.data[0].quantity === 1) {
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
      await save({ checkout_attempt: attempt, checkout_session_id: null })
    }
    const session = await stripe.checkout.sessions.create({
      // Keep this integration on standard Checkout even when the sandbox defaults to Managed Payments.
      managed_payments: { enabled: false },
      customer: customerId, mode: 'subscription', line_items: [{ price: config.price, quantity: 1 }],
      client_reference_id: user.userId, subscription_data: { metadata: { crrt_user_id: user.userId } },
      success_url: config.returnUrl, cancel_url: config.returnUrl,
    }, { idempotencyKey: `crrt-checkout-${attempt}` })
    await save({ checkout_session_id: session.id })
    if (!session.url || session.status !== 'open') throw new Error('Checkout is not available; please retry')
    return { url: session.url }
  })
}

export async function portal(userId: string) {
  const account = await getAccount(userId)
  if (!account?.customer_id) return null
  const session = await stripeClient().billingPortal.sessions.create({ customer: account.customer_id, return_url: billingConfig().returnUrl })
  return { url: session.url }
}

export async function processBillingEvent(event: Stripe.Event) {
  if (event.livemode) throw new Error('Live events are not accepted by billing v1')
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
