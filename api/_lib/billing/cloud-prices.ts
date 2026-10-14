import type Stripe from 'stripe'
import { CLOUD_PLANS, type CloudPlan } from './plans.js'

export function assertCloudPrice(plan: CloudPlan, price: Stripe.Price) {
  if (!price.active || price.currency !== 'usd' || price.unit_amount !== CLOUD_PLANS[plan].monthlyUsd*100
    || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1
    || price.tax_behavior === 'inclusive') {
    throw new Error('Cloud pricing does not match the approved monthly catalog')
  }
}
