import { assertCloudPrice } from './cloud-prices.js'
import { stripeClient } from './config.js'
import { ownerEntitlements } from './entitlements.js'
import { CLOUD_PLANS, cloudPriceCatalog, type CloudPlan } from './plans.js'
import { billingSummary } from './service.js'

export async function cloudBillingSummary(ownerId: string) {
  const billing = await billingSummary(ownerId)
  const prices = cloudPriceCatalog()
  const sdk = stripeClient()
  const plans = await Promise.all((['pro','studio'] as CloudPlan[]).map(async id=>{
    const price = await sdk.prices.retrieve(prices[id])
    assertCloudPrice(id, price)
    return { id, ...CLOUD_PLANS[id], amount: `$${CLOUD_PLANS[id].monthlyUsd}`, interval: 'month' }
  }))
  const entitlements = await ownerEntitlements(ownerId)
  return { ...billing, status: entitlements.status, testMode: process.env.STRIPE_MODE !== 'live', plans, entitlements }
}
