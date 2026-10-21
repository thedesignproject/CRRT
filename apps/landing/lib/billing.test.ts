import { afterEach, expect, it, vi } from 'vitest'
import { cloudPlanStartUrl, startCloudCheckout } from './billing'

afterEach(() => vi.unstubAllGlobals())

it('routes signed-out selections through the signed plan and cycle handoff', () => {
  expect(cloudPlanStartUrl('/api/', 'pro')).toBe('/api/v1/billing?start=pro&cycle=monthly')
  expect(cloudPlanStartUrl('https://crrt.ai/api', 'studio', 'yearly')).toBe('https://crrt.ai/api/v1/billing?start=studio&cycle=yearly')
})

it('starts authenticated Checkout with only a bearer session and allowlisted selection', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/session' }) })
  vi.stubGlobal('fetch', fetch)
  await expect(startCloudCheckout('/api/', 'session', 'studio', 'yearly')).resolves.toBe('https://checkout.stripe.com/c/session')
  expect(fetch).toHaveBeenCalledWith('/api/v1/billing', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session' },
    body: JSON.stringify({ action: 'checkout', plan: 'studio', cycle: 'yearly' }),
  })
})

it.each([
  [{ ok: false, json: async () => ({ error: 'Billing unavailable' }) }, 'Billing unavailable'],
  [{ ok: true, json: async () => ({ url: 'https://evil.example/checkout' }) }, 'invalid destination'],
  [{ ok: true, json: async () => ({}) }, 'did not return'],
  [{ ok: false, json: async () => { throw new Error('html') } }, 'temporarily unavailable'],
] as const)('fails safely for invalid checkout responses', async (response, message) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(startCloudCheckout('/api', 'session', 'pro')).rejects.toThrow(message)
})

it('accepts the existing-subscription Portal response from checkout', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://billing.stripe.com/p/session' }) }))
  await expect(startCloudCheckout('/api', 'session', 'pro')).resolves.toBe('https://billing.stripe.com/p/session')
})

it.each(['http://billing.stripe.com/p/session', 'https://billing.stripe.com.evil.test/p/session'])('rejects an unsafe Portal destination: %s', async (url) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url }) }))
  await expect(startCloudCheckout('/api', 'session', 'pro')).rejects.toThrow('invalid destination')
})
