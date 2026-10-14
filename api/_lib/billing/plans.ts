export const CLOUD_PLANS = {
  pro: { name: 'Cloud Pro', monthlyUsd: 19, projects: 10, internal_users: 10, comments: 2000, product_audits: 5 },
  studio: { name: 'Cloud Studio', monthlyUsd: 49, projects: 50, internal_users: 25, comments: 10000, product_audits: 30 },
} as const
export type CloudPlan = keyof typeof CLOUD_PLANS
export const PLAN_RESOURCES = ['projects', 'internal_users', 'comments', 'product_audits', 'subscription'] as const
export type PlanResource = typeof PLAN_RESOURCES[number]

export function isCloud(env: Record<string, string | undefined> = process.env) {
  if (env.CRRT_DEPLOYMENT_MODE === undefined || env.CRRT_DEPLOYMENT_MODE === 'community') return false
  if (env.CRRT_DEPLOYMENT_MODE === 'cloud') return true
  throw new Error('CRRT_DEPLOYMENT_MODE must be cloud or community')
}
export function cloudPriceCatalog(env: Record<string, string | undefined> = process.env) {
  const pro = env.STRIPE_PRO_PRICE_ID
  const studio = env.STRIPE_STUDIO_PRICE_ID
  if (!pro || !studio || !pro.startsWith('price_') || !studio.startsWith('price_') || pro === studio) {
    throw new Error('Distinct Pro and Studio Stripe prices are required')
  }
  return { pro, studio }
}
export function planForPrice(price: string | null, env: Record<string, string | undefined> = process.env): CloudPlan | null {
  const prices = cloudPriceCatalog(env)
  if (price === prices.pro) return 'pro'
  if (price === prices.studio) return 'studio'
  return null
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
