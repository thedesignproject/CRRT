import Stripe from 'stripe'
import { billingCycles, cloudPriceCatalog, isCloud } from './plans.js'

export function stripeEnabled() {
  return isCloud() && process.env.STRIPE_ENABLED === 'true'
}

export function billingConfig() {
  if (process.env.STRIPE_MODE && !['test','live'].includes(process.env.STRIPE_MODE)) throw new Error('STRIPE_MODE must be test or live')
  if (isCloud()) billingCycles()
  const secret = process.env.STRIPE_SECRET_KEY
  const price = isCloud() ? cloudPriceCatalog().pro : process.env.STRIPE_PRICE_ID
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const returnUrl = process.env.STRIPE_RETURN_URL
  if (!secret || !price || !webhookSecret || !returnUrl) throw new Error('Billing is not configured')
  const url = new URL(returnUrl)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Invalid billing return URL')
  }
  // v1 is deliberately test-only until pricing and entitlement enforcement ship.
  if (process.env.STRIPE_MODE === 'live') {
    if (!isCloud() || !secret.startsWith('sk_live_')) throw new Error('Live Cloud billing requires a live key')
  } else if (!secret.startsWith('sk_test_')) throw new Error('Billing requires a Stripe test key')
  return { secret, price, webhookSecret, returnUrl: url.href }
}

export function stripeClient() {
  return new Stripe(billingConfig().secret, { maxNetworkRetries: 1, timeout: 10_000 })
}
