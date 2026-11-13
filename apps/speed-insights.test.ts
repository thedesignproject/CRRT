import { afterEach, expect, it, vi } from 'vitest'
import { injectSpeedInsights } from '@vercel/speed-insights'

vi.mock('@vercel/speed-insights', () => ({ injectSpeedInsights: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.clearAllMocks()
})

async function load(prod = true, ssr = false, hostname = 'crrt.ai') {
  vi.stubEnv('PROD', prod)
  vi.stubEnv('SSR', ssr)
  vi.stubGlobal('location', ssr ? undefined : { hostname })
  await import('./speed-insights')
}

it('starts production collection once per application entry', async () => {
  await load()
  await import('./speed-insights')
  expect(injectSpeedInsights).toHaveBeenCalledOnce()
  expect(injectSpeedInsights).toHaveBeenCalledWith(expect.objectContaining({ framework: 'react' }))
})

it.each([
  [false, false, 'crrt.ai'],
  [true, true, 'crrt.ai'],
  [true, false, 'localhost'],
  [true, false, '127.0.0.1'],
  [true, false, 'crrt-preview.vercel.app'],
] as const)('does not collect for prod=%s ssr=%s host=%s', async (prod, ssr, hostname) => {
  await load(prod, ssr, hostname)
  expect(injectSpeedInsights).not.toHaveBeenCalled()
})

it.each([
  ['https://crrt.ai/dashboard/login?invite=secret#access_token=private', 'https://crrt.ai/dashboard/login'],
  ['https://crrt.ai/resources#section', 'https://crrt.ai/resources'],
  ['https://crrt.ai/resources', 'https://crrt.ai/resources'],
])('redacts sensitive URL data from %s without mutating the event', async (url, safeUrl) => {
  await load()
  const beforeSend = vi.mocked(injectSpeedInsights).mock.calls[0][0]!.beforeSend!
  const event = { type: 'vital' as const, url, route: '/dashboard/login' }
  expect(beforeSend(event)).toEqual({ ...event, url: safeUrl })
  expect(event.url).toBe(url)
})
