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
  const encoded = target.toString()
  return encoded ? `?${encoded}` : ''
}
