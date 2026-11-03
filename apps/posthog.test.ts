import { afterEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn(), logger: { info: vi.fn() } }))
const init = sdk.init
vi.mock('posthog-js', () => ({ default: sdk }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.clearAllMocks()
})

async function load(mode = 'production', ssr = false, key = 'test-public-key', host = 'https://us.i.posthog.com') {
  vi.stubEnv('MODE', mode)
  vi.stubEnv('SSR', ssr)
  vi.stubEnv('VITE_POSTHOG_KEY', key)
  vi.stubEnv('VITE_POSTHOG_HOST', host)
  return import('./posthog')
}

describe('PostHog browser initialization', () => {
  it('initializes once with the configured ingestion host and error capture', async () => {
    expect((await load()).isPostHogConfigured).toBe(true)
    await import('./posthog')
    expect(init).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledWith('test-public-key', expect.objectContaining({
      api_host: 'https://us.i.posthog.com',
      capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false },
    }))
  })
  it.each([
    ['test', false, 'key', 'https://us.i.posthog.com'],
    ['production', true, 'key', 'https://us.i.posthog.com'],
    ['development', false, 'key', 'https://us.i.posthog.com'],
    ['production', false, '', 'https://us.i.posthog.com'],
    ['production', false, 'key', ''],
  ] as const)('stays disabled for mode=%s ssr=%s key=%s host=%s', async (mode, ssr, key, host) => {
    expect((await load(mode, ssr, key, host)).isPostHogConfigured).toBe(false)
    expect(init).not.toHaveBeenCalled()
  })
})

it('keeps product actions working when analytics fails', async () => {
  const { default: analytics } = await load()
  sdk.capture.mockImplementationOnce(() => { throw new Error('SDK unavailable') })
  expect(() => analytics.capture('project_created')).not.toThrow()
  analytics.identify('user-1')
  analytics.reset()
  analytics.logger.info('project created')
  expect(sdk.identify).toHaveBeenCalledWith('user-1')
  expect(sdk.reset).toHaveBeenCalledOnce()
  expect(sdk.logger.info).toHaveBeenCalledWith('project created')
})

it('does not send product events when disabled', async () => {
  const { default: analytics } = await load('test')
  analytics.capture('project_created')
  analytics.identify('user-1')
  analytics.reset()
  analytics.logger.info('project created')
  expect(sdk.capture).not.toHaveBeenCalled()
  expect(sdk.identify).not.toHaveBeenCalled()
  expect(sdk.reset).not.toHaveBeenCalled()
  expect(sdk.logger.info).not.toHaveBeenCalled()
})

it('disables analytics if SDK initialization fails', async () => {
  sdk.init.mockImplementationOnce(() => { throw new Error('init failed') })
  const { default: analytics, isPostHogConfigured } = await load()
  expect(isPostHogConfigured).toBe(false)
  analytics.capture('project_created')
  expect(sdk.capture).not.toHaveBeenCalled()
})
