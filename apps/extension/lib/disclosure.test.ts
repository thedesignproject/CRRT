import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const local = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('wxt/browser', () => ({ browser: { storage: { local } } }))

import { EXTENSION_DISCLOSURE_KEY, EXTENSION_DISCLOSURE_VERSION, acceptDisclosure, hasAcceptedDisclosure, publicCrrtUrl } from './disclosure'

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('WXT_DASHBOARD_URL', 'https://crrt.ai/dashboard/') })
afterEach(() => vi.unstubAllEnvs())

describe('extension disclosure', () => {
  it('requires the exact current disclosure version', async () => {
    local.get.mockResolvedValueOnce({ [EXTENSION_DISCLOSURE_KEY]: EXTENSION_DISCLOSURE_VERSION })
      .mockResolvedValueOnce({ [EXTENSION_DISCLOSURE_KEY]: EXTENSION_DISCLOSURE_VERSION - 1 })
      .mockResolvedValueOnce({})
    await expect(hasAcceptedDisclosure()).resolves.toBe(true)
    await expect(hasAcceptedDisclosure()).resolves.toBe(false)
    await expect(hasAcceptedDisclosure()).resolves.toBe(false)
  })

  it('stores acceptance locally and builds public policy links', async () => {
    local.set.mockResolvedValue(undefined)
    await acceptDisclosure()
    expect(local.set).toHaveBeenCalledWith({ [EXTENSION_DISCLOSURE_KEY]: EXTENSION_DISCLOSURE_VERSION })
    expect(publicCrrtUrl('/privacy')).toBe('https://crrt.ai/privacy')
    expect(publicCrrtUrl('/support')).toBe('https://crrt.ai/support')
  })
})
