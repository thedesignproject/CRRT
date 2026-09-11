import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  listener: undefined as ((message: unknown, sender: unknown, respond: (response: unknown) => void) => boolean) | undefined,
  removed: undefined as ((tabId: number) => void) | undefined,
  updated: undefined as ((tabId: number, changeInfo: { url?: string }) => void) | undefined,
  session: {} as Record<string, unknown>,
}))
const browser = vi.hoisted(() => ({
  action: { openPopup: vi.fn() },
  tabs: {
    query: vi.fn(),
    get: vi.fn(),
    onRemoved: { addListener: vi.fn((value) => { state.removed = value }) },
    onUpdated: { addListener: vi.fn((value) => { state.updated = value }) },
  },
  storage: { session: {
    get: vi.fn(async (key: string) => ({ [key]: state.session[key] })),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(state.session, values) }),
    remove: vi.fn(async (key: string) => { delete state.session[key] }),
  } },
  scripting: { executeScript: vi.fn() },
  runtime: { onMessage: { addListener: vi.fn((value) => { state.listener = value }) } },
}))
vi.mock('wxt/browser', () => ({ browser }))
vi.mock('wxt/utils/define-background', () => ({ defineBackground: vi.fn((main) => main) }))
vi.mock('../lib/auth', () => ({ createExtensionSupabase: vi.fn(() => 'client'), handleAuthMessage: vi.fn(), isAuthMessage: vi.fn() }))
vi.mock('../lib/hosted-auth', () => ({ startHostedSignIn: vi.fn() }))
const hasAcceptedDisclosure = vi.hoisted(() => vi.fn())
vi.mock('../lib/disclosure', () => ({ hasAcceptedDisclosure }))
vi.mock('../lib/frame-channel', () => ({ relayFrameMessage: vi.fn() }))

import background, { activateCurrentTab, tabActivation } from '../entrypoints/background'
import { handleAuthMessage, isAuthMessage } from '../lib/auth'
import { relayFrameMessage } from '../lib/frame-channel'
import { startHostedSignIn } from '../lib/hosted-auth'

beforeEach(() => {
  vi.clearAllMocks(); state.listener = undefined; state.removed = undefined; state.updated = undefined; state.session = {}
  browser.tabs.get.mockImplementation(async (tabId: number) => ({ id: tabId, url: 'https://example.com' }))
  hasAcceptedDisclosure.mockResolvedValue(true)
})

function send(message: unknown, sender: unknown = {}) {
  return new Promise((resolve) => {
    // Simulate Chrome's callback contract, not native Promise listener support.
    expect(state.listener!(message, sender, resolve)).toBe(true)
  })
}

const activation = (origin: string, activationId: string) => ({
  origin,
  activationId,
  attemptId: `${activationId}-attempt`,
})

describe('extension background', () => {
  it('relays private frame messages with their browser-provided sender', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(relayFrameMessage).mockResolvedValueOnce('reply')
    await expect(send({ type: 'private:relay' })).resolves.toEqual({ ok: true, data: 'reply' })
    expect(relayFrameMessage).toHaveBeenCalledWith({ type: 'private:relay' }, {})
  })
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
    expect(browser.storage.session.set).toHaveBeenCalledWith({
      'crrt:active-tab:7': {
        origin: 'https://example.com', activationId: expect.any(String), attemptId: expect.any(String),
      },
    })
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['comment.js'] })
  })

  it('blocks activation and clears stale state until disclosure is accepted', async () => {
    hasAcceptedDisclosure.mockResolvedValue(false)
    browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com' }])
    await expect(activateCurrentTab()).rejects.toThrow('privacy summary')
    expect(browser.tabs.query).not.toHaveBeenCalled()
    state.session['crrt:active-tab:7'] = { origin: 'https://example.com' }
    await expect(tabActivation(7, 'https://example.com')).resolves.toBeNull()
    expect(state.session).not.toHaveProperty('crrt:active-tab:7')
    await expect(tabActivation(8, 'https://example.com')).resolves.toBeNull()
  })

  it('exposes activation only to the browser-provided tab and original page origin', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    state.session['crrt:active-tab:7'] = activation('https://example.com', 'activation-7')
    await expect(send({ type: 'comment:is-active' }, { url: 'https://example.com/next', tab: { id: 7, url: 'https://stale.test' } })).resolves.toEqual({
      ok: true, data: { active: true, activationId: 'activation-7' },
    })
    await expect(send({ type: 'comment:is-active' }, { tab: { id: 8, url: 'https://example.com' } })).resolves.toEqual({ ok: true, data: null })
    await expect(send({ type: 'comment:is-active' }, {})).resolves.toEqual({ ok: true, data: null })
    browser.tabs.get.mockResolvedValueOnce({ id: 7, url: 'https://other.example' })
    await expect(send({ type: 'comment:is-active' }, { tab: { id: 7, url: 'https://other.example' } })).resolves.toEqual({ ok: true, data: null })
    expect(state.session).not.toHaveProperty('crrt:active-tab:7')
  })

  it('does not let a stale document clear a newer activation', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    state.session['crrt:active-tab:7'] = activation('https://new.example', 'new-activation')
    browser.tabs.get.mockResolvedValueOnce({ id: 7, url: 'https://new.example/page' })
    await expect(send({ type: 'comment:is-active' }, { url: 'https://old.example', tab: { id: 7 } })).resolves.toEqual({ ok: true, data: null })
    expect(state.session['crrt:active-tab:7']).toEqual(activation('https://new.example', 'new-activation'))
  })

  it('serializes overlapping state operations for the same tab', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    state.session['crrt:active-tab:7'] = activation('https://example.com', 'activation-7')
    let releaseRead!: (value: Record<string, unknown>) => void
    browser.storage.session.get.mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve }))
    const read = send({ type: 'comment:is-active' }, { url: 'https://example.com', tab: { id: 7 } })
    await vi.waitFor(() => expect(browser.storage.session.get).toHaveBeenCalledOnce())
    const remove = send(
      { type: 'comment:deactivate', activationId: 'activation-7' },
      { url: 'https://example.com', tab: { id: 7 } },
    )
    expect(browser.storage.session.get).toHaveBeenCalledOnce()
    releaseRead({ 'crrt:active-tab:7': state.session['crrt:active-tab:7'] })
    await expect(read).resolves.toEqual({ ok: true, data: { active: true, activationId: 'activation-7' } })
    await expect(remove).resolves.toEqual({ ok: true, data: true })
  })

  it('clears legacy, malformed, and closed-tab activation state', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    state.session['crrt:active-tab:7'] = true
    await expect(send({ type: 'comment:is-active' }, { tab: { id: 7, url: 'not a URL' } })).resolves.toEqual({ ok: true, data: null })
    state.session['crrt:active-tab:7'] = activation('https://example.com', 'activation-7')
    state.removed!(7)
    await vi.waitFor(() => expect(browser.storage.session.remove).toHaveBeenCalledWith('crrt:active-tab:7'))
  })

  it('deactivates only the browser-provided tab and matching activation', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    state.session['crrt:active-tab:7'] = activation('https://example.com', 'activation-7')
    state.session['crrt:active-tab:8'] = activation('https://example.com', 'activation-8')
    await expect(send({ type: 'comment:deactivate', tabId: 8, activationId: 'stale' }, { url: 'https://example.com', tab: { id: 7 } }))
      .resolves.toEqual({ ok: true, data: false })
    await expect(send({ type: 'comment:deactivate', tabId: 8, activationId: 'activation-7' }, { url: 'https://other.example', tab: { id: 7 } }))
      .resolves.toEqual({ ok: true, data: false })
    await expect(send({ type: 'comment:deactivate', tabId: 8, activationId: 'activation-7' }, { url: 'https://example.com', tab: { id: 7 } }))
      .resolves.toEqual({ ok: true, data: true })
    expect(state.session).toEqual({ 'crrt:active-tab:8': activation('https://example.com', 'activation-8') })
    await expect(send({ type: 'comment:deactivate' }, {})).resolves.toEqual({ ok: false, error: 'Tab activation unavailable' })
  })

  it('rolls back activation when injection fails', async () => {
    browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com' }])
    browser.scripting.executeScript.mockRejectedValueOnce(new Error('restricted'))
    await expect(activateCurrentTab()).rejects.toThrow('restricted')
    expect(browser.storage.session.remove).toHaveBeenCalledWith('crrt:active-tab:7')
  })

  it('does not let a failed older injection roll back a newer activation', async () => {
    browser.tabs.query
      .mockResolvedValueOnce([{ id: 7, url: 'https://old.example' }])
      .mockResolvedValueOnce([{ id: 7, url: 'https://new.example' }])
    let rejectOlder!: (error: Error) => void
    browser.scripting.executeScript.mockImplementationOnce(() => new Promise((_, reject) => { rejectOlder = reject }))
    const older = activateCurrentTab()
    await vi.waitFor(() => expect(browser.scripting.executeScript).toHaveBeenCalledOnce())
    await activateCurrentTab()
    const newer = state.session['crrt:active-tab:7']
    rejectOlder(new Error('old injection failed'))
    await expect(older).rejects.toThrow('old injection failed')
    expect(state.session['crrt:active-tab:7']).toEqual(newer)
  })

  it('keeps the widget token while preventing an older same-origin failure from clearing a retry', async () => {
    browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com/page' }])
    let rejectOlder!: (error: Error) => void
    browser.scripting.executeScript.mockImplementationOnce(() => new Promise((_, reject) => { rejectOlder = reject }))
    const older = activateCurrentTab()
    await vi.waitFor(() => expect(browser.scripting.executeScript).toHaveBeenCalledOnce())
    const first = state.session['crrt:active-tab:7'] as { activationId: string; attemptId: string }
    await activateCurrentTab()
    const retry = state.session['crrt:active-tab:7'] as { activationId: string; attemptId: string }
    expect(retry.activationId).toBe(first.activationId)
    expect(retry.attemptId).not.toBe(first.attemptId)
    rejectOlder(new Error('old injection failed'))
    await expect(older).rejects.toThrow('old injection failed')
    expect(state.session['crrt:active-tab:7']).toEqual(retry)
  })

  it('clears activation after a committed cross-origin navigation but ignores stale navigation events', async () => {
    ;(background as unknown as () => void)()
    state.session['crrt:active-tab:7'] = activation('https://example.com', 'activation-7')
    browser.tabs.get.mockResolvedValueOnce({ id: 7, url: 'https://new.example/page' })
    state.updated!(7, { url: 'https://stale.example/page' })
    await vi.waitFor(() => expect(browser.tabs.get).toHaveBeenCalled())
    expect(state.session).toHaveProperty('crrt:active-tab:7')
    browser.tabs.get.mockResolvedValueOnce({ id: 7, url: 'https://new.example/page' })
    state.updated!(7, { url: 'https://new.example/page' })
    await vi.waitFor(() => expect(state.session).not.toHaveProperty('crrt:active-tab:7'))
  })

  it('rejects missing, internal, and malformed tabs', async () => {
    for (const tabs of [[], [{ url: 'https://example.com' }], [{ id: 1, url: 'chrome://settings' }], [{ id: 1 }], [{ id: 1, url: 'not a URL' }]]) {
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

  it('runs hosted authentication in the background', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(startHostedSignIn).mockResolvedValueOnce({ email: 'u@example.com', accessToken: 'token' })
    await expect(send({ type: 'auth:hosted-sign-in', intent: 'signup' })).resolves.toEqual({
      ok: true, data: { email: 'u@example.com', accessToken: 'token' },
    })
    expect(startHostedSignIn).toHaveBeenCalledWith('client', 'signup')
  })
})
