import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn(), logger: { info: vi.fn() } }))
const init = sdk.init
beforeEach(() => vi.doMock('posthog-js', () => ({ default: sdk })))
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
  const module = await import('./posthog')
  await module.postHogReady
  return module
}

describe('PostHog browser initialization', () => {
  it('redacts top-level identify attribution while preserving the event envelope', async () => {
    await load()
    const beforeSend = init.mock.calls[0][1].before_send
    const timestamp = new Date('2026-11-03T00:00:00Z')
    const event = {
      event: '$identify', uuid: 'event-id', timestamp,
      properties: { distinct_id: 'user-1', $current_url: 'https://crrt.ai/dashboard?invite=project#secret' },
      $set: { email: 'user@example.com', $referrer: 'https://crrt.ai/?email=guest@example.com' },
      $set_once: {
        $initial_current_url: 'https://crrt.ai/dashboard/login?invite=project&email=guest%40example.com#secret',
        $current_url: 'https://crrt.ai/dashboard?invite=project#secret',
      },
    }
    expect(beforeSend(event)).toEqual({
      event: '$identify', uuid: 'event-id', timestamp,
      properties: { distinct_id: 'user-1', $current_url: 'https://crrt.ai/dashboard' },
      $set: { email: 'user@example.com', $referrer: 'https://crrt.ai/' },
      $set_once: {
        $initial_current_url: 'https://crrt.ai/dashboard/login',
        $current_url: 'https://crrt.ai/dashboard',
      },
    })
    expect(event.timestamp).toBe(timestamp)
  })
  it('redacts query strings and fragments from page, referrer, identity and nested link URLs', async () => {
    await load()
    const beforeSend = init.mock.calls[0][1].before_send
    const event = { properties: {
      $current_url: 'https://crrt.ai/dashboard/login?invite=project&email=guest@example.com#secret',
      $referrer: 'https://crrt.ai/?email=guest@example.com',
      $set_once: { $initial_current_url: 'https://crrt.ai/#access_token=secret' },
      $elements: [{ attr__href: '/dashboard/?invite=project#secret' }],
      $elements_chain: 'a[href="https://storage.example/screenshot?token=secret"]',
      $el_text: 'Private feedback body',
      $pathname: '/dashboard/login',
      count: 1,
      empty: null,
      url_count: 2,
    } }
    expect(beforeSend(event)).toEqual({ properties: {
      $current_url: 'https://crrt.ai/dashboard/login',
      $referrer: 'https://crrt.ai/',
      $set_once: { $initial_current_url: 'https://crrt.ai/' },
      $elements: [{ attr__href: '/dashboard/' }],
      $pathname: '/dashboard/login', count: 1, empty: null, url_count: 2,
    } })
    expect(beforeSend(null)).toBeNull()
    expect(beforeSend({ event: '$autocapture', properties: { $el_text: 'Private feedback' } })).toBeNull()
  })
  it('initializes once with the configured ingestion host and error capture', async () => {
    expect((await load()).isPostHogConfigured).toBe(true)
    await import('./posthog')
    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][1]).not.toHaveProperty('logs')
    expect(init).toHaveBeenCalledWith('test-public-key', expect.objectContaining({
      api_host: 'https://us.i.posthog.com',
      autocapture: false,
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
  expect(sdk.identify).toHaveBeenCalledWith('user-1')
  expect(sdk.reset).toHaveBeenCalledOnce()
  expect(sdk.logger.info).not.toHaveBeenCalled()
})

it('does not send product events when disabled', async () => {
  const { default: analytics } = await load('test')
  analytics.capture('project_created')
  analytics.identify('user-1')
  analytics.reset()
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


it('preserves identity and event order while the SDK downloads, including failed calls', async () => {
  let release!: (module: { default: typeof sdk }) => void
  vi.doMock('posthog-js', () => new Promise(resolve => { release = resolve }))
  vi.stubEnv('MODE', 'production')
  vi.stubEnv('SSR', false)
  vi.stubEnv('VITE_POSTHOG_KEY', 'test-public-key')
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com')
  const module = await import('./posthog')
  const calls: string[] = []
  sdk.identify.mockImplementationOnce(() => { calls.push('identify') })
  sdk.capture.mockImplementationOnce(() => { throw new Error('capture failed') })
  sdk.reset.mockImplementationOnce(() => { calls.push('reset') })
  module.default.identify('user-1')
  module.default.capture('project_created')
  module.default.reset()
  expect(sdk.identify).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  release({ default: sdk })
  await module.postHogReady
  expect(calls).toEqual(['identify', 'reset'])
  expect(sdk.capture).toHaveBeenCalledWith('project_created')
})

it('disables analytics and drops queued actions when downloading fails', async () => {
  let reject!: (error: Error) => void
  vi.doMock('posthog-js', () => new Promise((_resolve, fail) => { reject = fail }))
  vi.stubEnv('MODE', 'production')
  vi.stubEnv('SSR', false)
  vi.stubEnv('VITE_POSTHOG_KEY', 'test-public-key')
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com')
  const module = await import('./posthog')
  module.default.identify('user-1')
  await vi.waitFor(() => expect(reject).toBeTypeOf('function'))
  reject(new Error('network failed'))
  await module.postHogReady
  expect(module.isPostHogConfigured).toBe(false)
  module.default.capture('project_created')
  expect(sdk.identify).not.toHaveBeenCalled()
  expect(sdk.capture).not.toHaveBeenCalled()
})
