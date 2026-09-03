import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ listener: undefined as ((message: unknown, sender: unknown, respond: (response: unknown) => void) => boolean) | undefined }))
const browser = vi.hoisted(() => ({ action: { openPopup: vi.fn() }, tabs: { query: vi.fn() }, scripting: { executeScript: vi.fn() }, runtime: { onMessage: { addListener: vi.fn((value) => { state.listener = value }) } } }))
vi.mock('wxt/browser', () => ({ browser }))
vi.mock('wxt/utils/define-background', () => ({ defineBackground: vi.fn((main) => main) }))
vi.mock('../lib/auth', () => ({ createExtensionSupabase: vi.fn(() => 'client'), handleAuthMessage: vi.fn(), isAuthMessage: vi.fn() }))

import background, { activateCurrentTab } from '../entrypoints/background'
import { handleAuthMessage, isAuthMessage } from '../lib/auth'

beforeEach(() => { vi.clearAllMocks(); state.listener = undefined })

function send(message: unknown) {
  return new Promise((resolve) => {
    // Simulate Chrome's callback contract, not native Promise listener support.
    expect(state.listener!(message, {}, resolve)).toBe(true)
  })
}

describe('extension background', () => {
  it('opens the existing action popup and reports browser failures', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    browser.action.openPopup.mockResolvedValueOnce(undefined)
    await expect(send({ type: 'auth:open-popup' })).resolves.toEqual({ ok: true })
    expect(browser.action.openPopup).toHaveBeenCalledOnce()
    expect(browser.scripting.executeScript).not.toHaveBeenCalled()
    browser.action.openPopup.mockRejectedValueOnce(new Error('Popup unavailable'))
    await expect(send({ type: 'auth:open-popup' })).resolves.toEqual({ ok: false, error: 'Popup unavailable' })
  })

  it('activates regular pages using temporary tab access', async () => {
    browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com' }])
    await activateCurrentTab()
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['comment.js'] })
  })

  it('rejects missing, internal, and malformed tabs', async () => {
    for (const tabs of [[], [{ id: 0, url: 'https://example.com' }], [{ id: 1, url: 'chrome://settings' }], [{ id: 1 }]]) {
      browser.tabs.query.mockResolvedValueOnce(tabs)
      await expect(activateCurrentTab()).rejects.toThrow(/regular web page/)
    }
  })

  it('routes auth, activation, unknown messages, and failures', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValueOnce(true)
    vi.mocked(handleAuthMessage).mockResolvedValueOnce({ email: 'u@example.com', accessToken: 't' })
    await expect(send({ type: 'auth:get' })).resolves.toMatchObject({ ok: true })

    vi.mocked(isAuthMessage).mockReturnValue(false)
    browser.tabs.query.mockResolvedValue([{ id: 7, url: 'http://example.com' }])
    await expect(send({ type: 'comment:activate' })).resolves.toEqual({ ok: true })
    await expect(send({ type: 'unknown' })).resolves.toBeUndefined()
    await expect(send(null)).resolves.toBeUndefined()

    vi.mocked(isAuthMessage).mockReturnValueOnce(true); vi.mocked(handleAuthMessage).mockRejectedValueOnce(new Error('down'))
    await expect(send({ type: 'auth:get' })).resolves.toEqual({ ok: false, error: 'down' })
    vi.mocked(isAuthMessage).mockImplementationOnce(() => { throw 'bad' })
    await expect(send({ type: 'auth:get' })).resolves.toEqual({ ok: false, error: 'Unexpected extension error' })
  })
})
