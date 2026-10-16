import { assertCloudPrice } from './cloud-prices.js'
import { stripeClient } from './config.js'
import { ownerEntitlements } from './entitlements.js'
import { CLOUD_PLANS, billingCycles, cloudPriceCatalog, type CloudPlan } from './plans.js'
import { billingSummary } from './service.js'

export async function cloudBillingSummary(ownerId: string) {
  const billing = await billingSummary(ownerId)
  const cycle = billing.billingCycle ?? 'monthly'
  const prices = cloudPriceCatalog(process.env, cycle)
  const sdk = stripeClient()
  const plans = await Promise.all((['pro','studio'] as CloudPlan[]).map(async id=>{
    const price = await sdk.prices.retrieve(prices[id])
    assertCloudPrice(id, price, cycle)
    return { id, ...CLOUD_PLANS[id], amount: `$${cycle === 'yearly' ? CLOUD_PLANS[id].yearlyUsd : CLOUD_PLANS[id].monthlyUsd}`, interval: cycle === 'yearly' ? 'year' : 'month' }
  }))
  const entitlements = await ownerEntitlements(ownerId)
  return { ...billing, actions: { checkoutState: true, changePlan: false }, billingCycles: billingCycles(), status: entitlements.status, testMode: process.env.STRIPE_MODE !== 'live', plans, entitlements }
}
