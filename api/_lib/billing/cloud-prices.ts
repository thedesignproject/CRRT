import type Stripe from 'stripe'
import { CLOUD_PLANS, type BillingCycle, type CloudPlan } from './plans.js'

export function assertCloudPrice(plan: CloudPlan, price: Stripe.Price, cycle: BillingCycle = 'monthly') {
  if (!price.active || price.currency !== 'usd' || price.unit_amount !== (cycle === 'yearly' ? CLOUD_PLANS[plan].yearlyUsd : CLOUD_PLANS[plan].monthlyUsd)*100
    || price.recurring?.interval !== (cycle === 'yearly' ? 'year' : 'month') || price.recurring.interval_count !== 1
    || price.tax_behavior === 'inclusive') {
    throw new Error(`Cloud pricing does not match the approved ${cycle} catalog`)
  }
}
