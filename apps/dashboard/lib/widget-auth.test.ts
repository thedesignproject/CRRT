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

it('accepts only a valid public Storybook connection in a widget continuation', async () => {
  const { widgetAuthContinuation } = await import('./widget-auth')
  const connectionId = '11111111-1111-4111-8111-111111111111'
  expect(widgetAuthContinuation(path.split('?')[1] + `&connectionId=${connectionId}`)?.connectionId).toBe(connectionId)
  for (const connection of ['', 'bad', '../connections']) expect(widgetAuthContinuation(path.split('?')[1] + `&connectionId=${connection}`)).toBeNull()
  expect(widgetAuthContinuation('?connectionId=' + connectionId)).toBeNull()
  expect(widgetAuthRecoveryDestination(`?continue=${encodeURIComponent(path + '&connectionId=' + connectionId)}`, origin)).toBe(path + '&connectionId=' + connectionId)
})
