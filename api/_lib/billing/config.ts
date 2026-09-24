import Stripe from 'stripe'

export function stripeEnabled() {
  return process.env.STRIPE_ENABLED === 'true'
}

export function billingConfig() {
  const secret = process.env.STRIPE_SECRET_KEY
  const price = process.env.STRIPE_PRICE_ID
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const returnUrl = process.env.STRIPE_RETURN_URL
  if (!secret || !price || !webhookSecret || !returnUrl) throw new Error('Billing is not configured')
  const url = new URL(returnUrl)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Invalid billing return URL')
  }
  // v1 is deliberately test-only until pricing and entitlement enforcement ship.
  if (!secret.startsWith('sk_test_')) throw new Error('Billing v1 requires a Stripe test key')
  return { secret, price, webhookSecret, returnUrl: url.href }
}

export function stripeClient() {
  return new Stripe(billingConfig().secret, { maxNetworkRetries: 1, timeout: 10_000 })
}
