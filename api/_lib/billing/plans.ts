export const CLOUD_PLANS = {
  pro: { name: 'Cloud Pro', monthlyUsd: 19, yearlyUsd: 192, projects: 10, internal_users: 10, comments: 2000, product_audits: 5 },
  studio: { name: 'Cloud Studio', monthlyUsd: 49, yearlyUsd: 492, projects: 50, internal_users: 25, comments: 10000, product_audits: 30 },
} as const
export type BillingCycle = 'monthly' | 'yearly'
export type CloudPlan = keyof typeof CLOUD_PLANS
export const PLAN_RESOURCES = ['projects', 'internal_users', 'comments', 'product_audits', 'subscription'] as const
export type PlanResource = typeof PLAN_RESOURCES[number]

export function isCloud(env: Record<string, string | undefined> = process.env) {
  if (env.CRRT_DEPLOYMENT_MODE === undefined || env.CRRT_DEPLOYMENT_MODE === 'community') return false
  if (env.CRRT_DEPLOYMENT_MODE === 'cloud') return true
  throw new Error('CRRT_DEPLOYMENT_MODE must be cloud or community')
}
export function cloudPriceCatalog(env: Record<string, string | undefined> = process.env, cycle: BillingCycle = 'monthly'): { pro: string; studio: string } {
  if (cycle === 'yearly') cloudPriceCatalog(env)
  const monthly = { pro: env.STRIPE_PRO_PRICE_ID, studio: env.STRIPE_STUDIO_PRICE_ID }
  const prices = cycle === 'monthly' ? monthly : { pro: env.STRIPE_PRO_YEARLY_PRICE_ID, studio: env.STRIPE_STUDIO_YEARLY_PRICE_ID }
  const { pro, studio } = prices
  if (!pro?.startsWith('price_') || !studio?.startsWith('price_') || pro === studio
    || (cycle === 'yearly' && [monthly.pro, monthly.studio].some(id => id === pro || id === studio))) {
    throw new Error(`Distinct Pro and Studio ${cycle} Stripe prices are required`)
  }
  return { pro, studio }
}
export function billingCycles(env: Record<string, string | undefined> = process.env): BillingCycle[] {
  if (!env.STRIPE_PRO_YEARLY_PRICE_ID && !env.STRIPE_STUDIO_YEARLY_PRICE_ID) return ['monthly']
  cloudPriceCatalog(env, 'yearly')
  return ['monthly', 'yearly']
}
export function selectionForPrice(price: string | null, env: Record<string, string | undefined> = process.env): { plan: CloudPlan; cycle: BillingCycle } | null {
  for (const cycle of billingCycles(env)) {
    const prices = cloudPriceCatalog(env, cycle)
    for (const plan of ['pro', 'studio'] as const) if (price === prices[plan]) return { plan, cycle }
  }
  return null
}
export function planForPrice(price: string | null, env: Record<string, string | undefined> = process.env): CloudPlan | null {
  return selectionForPrice(price, env)?.plan ?? null
}
export function parseBillingCycle(value: unknown): BillingCycle {
  if (value === undefined || value === 'monthly') return 'monthly'
  if (value === 'yearly') return 'yearly'
  throw new Error('Choose monthly or yearly billing')
}
export function parseCloudPlan(value: unknown): CloudPlan {
  if (value === 'pro' || value === 'studio') return value
  throw new Error('Choose Cloud Pro or Cloud Studio')
}
export type CloudSubscription = {
  plan?: string | null
  subscription_status: string | null
  period_start?: string | null
  period_end?: string | null
  grace_until?: string | null
}
export function subscriptionCanWrite(account: CloudSubscription | null, now = Date.now()) {
  if (!account || (account.plan !== 'pro' && account.plan !== 'studio')) return false
  if (!account.period_start || !account.period_end) return false
  if (!(Date.parse(account.period_start) <= now && Date.parse(account.period_end) > now)) return false
  if (account.subscription_status === 'active' || account.subscription_status === 'trialing') return true
  return account.subscription_status === 'past_due' && Boolean(account.grace_until && Date.parse(account.grace_until) > now)
}
