import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { billingConfig, stripeClient, stripeEnabled } from './config.js'
beforeEach(() => {
  vi.stubEnv('CRRT_DEPLOYMENT_MODE', 'community')
  vi.stubEnv('STRIPE_MODE', 'test')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example')
  vi.stubEnv('STRIPE_PRICE_ID', 'price_example')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_example')
  vi.stubEnv('STRIPE_RETURN_URL', 'https://preview.example/dashboard/')
})
afterEach(() => vi.unstubAllEnvs())
it('is default-off and requires Cloud mode and exactly true', () => {
  vi.stubEnv('STRIPE_ENABLED','true');expect(stripeEnabled()).toBe(false)
  vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud')
  for (const value of [undefined, 'false', 'TRUE', '1']) {
    vi.stubEnv('STRIPE_ENABLED', value); expect(stripeEnabled()).toBe(false)
  }
  vi.stubEnv('STRIPE_ENABLED', 'true'); expect(stripeEnabled()).toBe(true)
})
it('constructs the official client only with complete test configuration', () => {
  expect(billingConfig().price).toBe('price_example')
  expect(stripeClient().checkout.sessions.create).toBeTypeOf('function')
})
it.each(['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_RETURN_URL'])('fails closed without %s', (key) => {
  vi.stubEnv(key, ''); expect(billingConfig).toThrow('not configured')
})
it.each(['http://localhost:5173/dashboard/', 'http://127.0.0.1:5173/dashboard/', 'https://preview.example/dashboard/'])('allows trusted configured return URL %s', (url) => {
  vi.stubEnv('STRIPE_RETURN_URL', url); expect(billingConfig().returnUrl).toBe(url)
})
it.each(['http://evil.example', 'javascript:alert(1)', 'garbage'])('rejects unsafe return URL %s', (url) => {
  vi.stubEnv('STRIPE_RETURN_URL', url); expect(billingConfig).toThrow()
})
it('rejects live keys', () => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_example'); expect(billingConfig).toThrow('test key')
})

it('requires distinct Cloud prices and an explicitly selected live environment', () => {
  vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud')
  vi.stubEnv('STRIPE_PRO_PRICE_ID','price_pro');vi.stubEnv('STRIPE_STUDIO_PRICE_ID','price_studio')
  expect(billingConfig().price).toBe('price_pro')
  vi.stubEnv('STRIPE_MODE','live')
  expect(billingConfig).toThrow('live key')
  vi.stubEnv('STRIPE_SECRET_KEY','sk_live_example');expect(billingConfig().secret).toBe('sk_live_example')
  vi.stubEnv('CRRT_DEPLOYMENT_MODE','community');expect(billingConfig).toThrow('Live Cloud')
})

it('rejects an ambiguous Stripe environment',()=>{vi.stubEnv('STRIPE_MODE','typo');expect(billingConfig).toThrow('test or live')})
