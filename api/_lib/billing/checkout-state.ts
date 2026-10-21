import { createHmac, timingSafeEqual } from 'node:crypto'
import { parseBillingCycle, parseCloudPlan, type BillingCycle, type CloudPlan } from './plans.js'

const TTL_SECONDS = 30 * 60
export class InvalidCheckoutState extends Error {}

function signature(body: string) {
  const secret = process.env.BILLING_STATE_SECRET
  if (!secret || secret.length < 32) throw new Error('Billing state signing is not configured')
  return createHmac('sha256', secret).update(`crrt-billing-selection-v1:${body}`).digest('base64url')
}

export function createCheckoutState(plan: CloudPlan, cycle: BillingCycle, now = Math.floor(Date.now() / 1000)) {
  const body = Buffer.from(JSON.stringify({ plan, cycle, iat: now, exp: now + TTL_SECONDS })).toString('base64url')
  return `${body}.${signature(body)}`
}

/** A signed selection carries no account identity, payment authority, or redirect. */
export function readCheckoutState(value: unknown, now = Math.floor(Date.now() / 1000)): { plan: CloudPlan; cycle: BillingCycle } {
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw new InvalidCheckoutState('Invalid or expired checkout selection')
  const [body, mac] = value.split('.')
  const expected = signature(body)
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw new InvalidCheckoutState('Invalid or expired checkout selection')
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.iat > now || payload.exp <= now || payload.exp - payload.iat !== TTL_SECONDS || !payload.cycle) throw new Error('Invalid lifetime')
    return { plan: parseCloudPlan(payload.plan), cycle: parseBillingCycle(payload.cycle) }
  } catch {
    throw new InvalidCheckoutState('Invalid or expired checkout selection')
  }
}
