import { expect, it } from 'vitest'
import { widgetAuthRecoveryDestination } from './widget-auth'
const origin = 'https://crrt.ai'
const path = `/widget-auth?${new URLSearchParams({ projectKey: 'p', origin: 'https://site.test', state: 'a'.repeat(43), codeChallenge: 'b'.repeat(43) })}`
it('preserves only a valid same-origin widget continuation', () => {
  expect(widgetAuthRecoveryDestination(`?continue=${encodeURIComponent(path)}`, origin)).toBe(path)
  for (const value of ['', 'https://evil.test' + path, '/login', '/widget-auth', 'http://[']) {
    expect(widgetAuthRecoveryDestination(`?continue=${encodeURIComponent(value)}`, origin)).toBeNull()
  }
})
