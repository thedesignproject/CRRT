/** A plan hint selects a card only; billing actions still require user confirmation. */
export function billingPlanSelection(search: string) {
  const plan = new URLSearchParams(search).get('billingPlan')
  return plan === 'pro' || plan === 'studio' ? plan : undefined
}

/** Preserve only dashboard-owned continuation parameters, never arbitrary redirect URLs. */
export function dashboardAuthSearch(search: string) {
  const source = new URLSearchParams(search)
  const target = new URLSearchParams()
  for (const key of ['invite', 'accessProject']) {
    const value = source.get(key)
    if (value) target.set(key, value)
  }
  const billingState = source.get('billingState')
  if (billingState && billingState.length <= 512 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(billingState)) {
    target.set('billingState', billingState)
  }
  const billingPlan = billingPlanSelection(search)
  if (billingPlan) target.set('billingPlan', billingPlan)
  const encoded = target.toString()
  return encoded ? `?${encoded}` : ''
}
