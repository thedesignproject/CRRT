import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCheckoutState, readCheckoutState } from './checkout-state.js'
const secret = 'test-billing-state-secret-at-least-32-characters'
beforeEach(() => vi.stubEnv('BILLING_STATE_SECRET', secret))
afterEach(() => vi.unstubAllEnvs())
function signed(json: string) {
  const body = Buffer.from(json).toString('base64url')
  return body+'.'+createHmac('sha256', secret).update('crrt-billing-selection-v1:'+body).digest('base64url')
}
it('preserves a selection for 30 minutes without binding identity or a client redirect', () => {
  const state = createCheckoutState('studio', 'yearly', 100)
  expect(state.length).toBeLessThanOrEqual(512)
  expect(readCheckoutState(state, 1899)).toEqual({ plan: 'studio', cycle: 'yearly' })
  expect(() => readCheckoutState(state, 1900)).toThrow('expired')
  expect(() => readCheckoutState(state, 99)).toThrow('expired')
  expect(readCheckoutState(createCheckoutState('pro', 'monthly'))).toEqual({ plan: 'pro', cycle: 'monthly' })
})
it.each([undefined, null, {}, '', 'a.b.c', 'a.b', 'a.'.padEnd(600, 'a')])('rejects malformed state %j', value => {
  expect(() => readCheckoutState(value)).toThrow('Invalid or expired')
})
it('rejects tampered signatures and signed invalid payloads', () => {
  const state = createCheckoutState('pro', 'monthly', 100)
  expect(() => readCheckoutState(state.slice(0,-1)+(state.endsWith('a') ? 'b' : 'a'), 101)).toThrow('Invalid or expired')
  for (const json of ['{', 'null', '{"iat":100,"exp":1900,"plan":"cheap","cycle":"yearly"}', '{"iat":100,"exp":1900,"plan":"pro","cycle":"weekly"}', '{"iat":100,"exp":1900,"plan":"pro"}', '{"iat":100.5,"exp":1900,"plan":"pro","cycle":"monthly"}', '{"iat":100,"exp":"1900","plan":"pro","cycle":"monthly"}']) {
    expect(() => readCheckoutState(signed(json), 101)).toThrow('Invalid or expired')
  }
})
it.each([undefined, 'short'])('requires a server-only signing secret of sufficient length', value => {
  vi.stubEnv('BILLING_STATE_SECRET', value)
  expect(() => createCheckoutState('pro', 'monthly')).toThrow('not configured')
})
