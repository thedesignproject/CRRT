import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it.each([
  { dev: true, expected: 'http://localhost:5173' },
  { dev: false, expected: '/dashboard' },
])('uses the expected dashboard destination when DEV is $dev', async ({ dev, expected }) => {
  vi.stubEnv('DEV', dev)
  const { DASHBOARD_HREF } = await import('./Hero')

  expect(DASHBOARD_HREF).toBe(expected)
  vi.resetModules()
})
