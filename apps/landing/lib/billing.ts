export type CloudPlanKey = 'pro' | 'studio'
export type BillingCycle = 'monthly' | 'yearly'

export function cloudPlanStartUrl(apiBase: string, plan: CloudPlanKey, cycle: BillingCycle = 'monthly') {
  return `${apiBase.replace(/\/$/, '')}/v1/billing?${new URLSearchParams({ start: plan, cycle })}`
}

export async function startCloudCheckout(apiBase: string, accessToken: string, plan: CloudPlanKey, cycle: BillingCycle = 'monthly') {
  const response = await fetch(`${apiBase.replace(/\/$/, '')}/v1/billing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'checkout', plan, cycle }),
  })
  const body = await response.json().catch(() => null) as { url?: unknown; error?: unknown } | null
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Cloud checkout is temporarily unavailable')
  if (typeof body?.url !== 'string') throw new Error('Cloud checkout did not return a destination')
  const destination = new URL(body.url)
  if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') throw new Error('Cloud checkout returned an invalid destination')
  return destination.href
}
