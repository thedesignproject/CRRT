import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  listener: undefined as ((message: unknown, sender: unknown, respond: (response: unknown) => void) => boolean) | undefined,
  removed: undefined as ((tabId: number) => void) | undefined,
  activated: undefined as ((info: { windowId: number }) => void) | undefined,
  updated: undefined as ((tabId: number, changeInfo: { url?: string; status?: string }) => void) | undefined,
  command: undefined as ((command: string) => void) | undefined,
  session: {} as Record<string, unknown>,
}))
const browser = vi.hoisted(() => ({
  action: { openPopup: vi.fn() },
  windows: { create: vi.fn(), update: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) },
  tabCapture: { getMediaStreamId: vi.fn() },
  commands: { onCommand: { addListener: vi.fn((value) => { state.command = value }) } },
  tabs: {
    query: vi.fn(),
    get: vi.fn(),
    captureVisibleTab: vi.fn(),
    sendMessage: vi.fn(),
    update: vi.fn(),
    onActivated: { addListener: vi.fn((value) => { state.activated = value }) },
    onRemoved: { addListener: vi.fn((value) => { state.removed = value }) },
    onUpdated: { addListener: vi.fn((value) => { state.updated = value }) },
  },
  storage: { session: {
    get: vi.fn(async (key: string) => ({ [key]: state.session[key] })),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(state.session, values) }),
    remove: vi.fn(async (key: string) => { delete state.session[key] }),
  } },
  scripting: { executeScript: vi.fn() },
  offscreen: { createDocument: vi.fn() },
  runtime: {
    id: 'extension-id',
    getURL: vi.fn((path: string) => `chrome-extension://extension-id${path}`),
    sendMessage: vi.fn(),
    getContexts: vi.fn().mockResolvedValue([]),
    onMessage: { addListener: vi.fn((value) => { state.listener = value }) },
  },
}))
vi.mock('wxt/browser', () => ({ browser }))
vi.mock('wxt/utils/define-background', () => ({ defineBackground: vi.fn((main) => main) }))
vi.mock('../lib/auth', () => ({ createExtensionSupabase: vi.fn(() => 'client'), handleAuthMessage: vi.fn(), isAuthMessage: vi.fn() }))
vi.mock('../lib/hosted-auth', () => ({ startHostedSignIn: vi.fn() }))
const hasAcceptedDisclosure = vi.hoisted(() => vi.fn())
vi.mock('../lib/disclosure', () => ({ hasAcceptedDisclosure }))
vi.mock('../lib/frame-channel', () => ({ relayFrameMessage: vi.fn() }))

import background, { activateCurrentTab, tabActivation } from '../entrypoints/background'
import { createExtensionSupabase, handleAuthMessage, isAuthMessage } from '../lib/auth'
import { relayFrameMessage } from '../lib/frame-channel'
import { startHostedSignIn } from '../lib/hosted-auth'

beforeEach(() => {
  vi.clearAllMocks(); state.listener = undefined; state.removed = undefined; state.updated = undefined; state.command = undefined; state.session = {}
  browser.tabs.get.mockImplementation(async (tabId: number) => ({ id: tabId, url: 'https://example.com' }))
  browser.tabs.sendMessage.mockResolvedValue({ ok: true })
  browser.tabs.update.mockResolvedValue(undefined)
  browser.windows.update.mockResolvedValue(undefined)
  browser.runtime.sendMessage.mockResolvedValue({ ok: true, granted: true })
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
  it('does not initialize persisted authentication before disclosure acceptance', async () => {
    hasAcceptedDisclosure.mockResolvedValue(false)
    ;(background as unknown as () => void)()
    expect(createExtensionSupabase).not.toHaveBeenCalled()
    vi.mocked(isAuthMessage).mockReturnValue(true)
    for (const message of [{ type: 'auth:get' }, { type: 'auth:sign-out' }, { type: 'auth:hosted-sign-in', intent: 'signin' }]) {
      await expect(send(message)).resolves.toEqual({ ok: false, error: 'Review the CRRT privacy summary before signing in' })
    }
    expect(createExtensionSupabase).not.toHaveBeenCalled()
    expect(handleAuthMessage).not.toHaveBeenCalled()
    expect(startHostedSignIn).not.toHaveBeenCalled()

    hasAcceptedDisclosure.mockResolvedValue(true)
    await Promise.all([send({ type: 'auth:get' }), send({ type: 'auth:get' })])
    expect(createExtensionSupabase).toHaveBeenCalledOnce()
    expect(handleAuthMessage).toHaveBeenCalledTimes(2)
  })

  it('fails closed when disclosure storage cannot be read and retries initialization safely', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(true)
    hasAcceptedDisclosure.mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(send({ type: 'auth:get' })).resolves.toEqual({ ok: false, error: 'storage unavailable' })
    expect(createExtensionSupabase).not.toHaveBeenCalled()
    vi.mocked(createExtensionSupabase).mockImplementationOnce(() => { throw new Error('configuration unavailable') })
    await expect(send({ type: 'auth:get' })).resolves.toEqual({ ok: false, error: 'configuration unavailable' })
    await expect(send({ type: 'auth:get' })).resolves.toMatchObject({ ok: true })
    expect(createExtensionSupabase).toHaveBeenCalledTimes(2)
  })

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

  it('opens the recorder with active-tab context from messages and the keyboard shortcut', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com/checkout', title: 'Acme checkout' }])

    await expect(send({ type: 'record:open' })).resolves.toEqual({ ok: true })
    expect(browser.windows.create).not.toHaveBeenCalled()
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['record-overlay.js'] })

    state.command?.('start-recording')
    await vi.waitFor(() => expect(browser.tabs.update).toHaveBeenCalledWith(7, { active: true }))
    expect(browser.scripting.executeScript).toHaveBeenCalledOnce()
    delete state.session['crrt:recording-session']
    browser.tabs.query.mockResolvedValueOnce([{}])
    await expect(send({ type: 'record:open' })).resolves.toEqual({ ok: false, error: 'Open a regular web page to start recording' })
  })

  it('runs the integrated setup, recording, restart, finish, and cancel lifecycle', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com/checkout', title: 'Checkout' }])
    browser.tabs.get.mockResolvedValue({ id: 7, url: 'https://example.com/checkout', title: 'Checkout' })
    browser.tabCapture.getMediaStreamId.mockResolvedValue('stream-7')

    await send({ type: 'record:open' })
    const descriptor = state.session['crrt:recording-session'] as { sessionId: string; snapshot: Record<string, unknown> }
    const surface = { url: 'https://example.com/checkout', tab: { id: 7 }, frameId: 0 }
    await expect(send({ type: 'record:surface-ready', sessionId: descriptor.sessionId }, surface)).resolves.toMatchObject({ ok: true, data: { status: 'setup' } })
    await expect(send({ type: 'record:surface-command', sessionId: descriptor.sessionId, command: { kind: 'camera.toggled' } }, surface)).resolves.toEqual({ ok: true })
    await expect(send({ type: 'record:surface-command', sessionId: descriptor.sessionId, command: { kind: 'microphone.toggled' } }, surface)).resolves.toEqual({ ok: true })
    await expect(send({ type: 'record:surface-command', sessionId: descriptor.sessionId, command: { kind: 'start' } }, surface)).resolves.toEqual({ ok: true })
    expect(browser.offscreen.createDocument).toHaveBeenCalledWith(expect.objectContaining({ url: 'chrome-extension://extension-id/offscreen.html' }))
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'record:offscreen-start', sessionId: descriptor.sessionId, tabStreamId: 'stream-7', pageTitle: 'Checkout',
    }))

    const recording = { ...descriptor.snapshot, status: 'recording', countdown: 0, durationMs: 2_000 }
    await send({ type: 'record:offscreen-state', target: 'background', sessionId: descriptor.sessionId, snapshot: recording })
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'record:surface-state', snapshot: recording }), { frameId: 0 })
    await send({ type: 'record:surface-command', sessionId: descriptor.sessionId, command: { kind: 'camera.toggled' } }, surface)
    expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({ type: 'record:offscreen-command', target: 'offscreen', sessionId: descriptor.sessionId, command: { kind: 'camera.toggled' } })
    browser.scripting.executeScript.mockResolvedValueOnce([{ result: { selector: '#pay', pageUrl: 'https://example.com/checkout', tagName: 'button' } }])
    await send({
      type: 'record:surface-command', sessionId: descriptor.sessionId,
      command: { kind: 'mark.added', mark: { id: 'mark-1', type: 'box', atMs: 2_000, points: [{ x: 20, y: 30 }, { x: 40, y: 50 }] } },
    }, surface)
    expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'record:offscreen-command',
      command: expect.objectContaining({ mark: expect.objectContaining({ target: { selector: '#pay', pageUrl: 'https://example.com/checkout', tagName: 'button' } }) }),
    }))
    await send({ type: 'record:offscreen-restart', target: 'background', sessionId: descriptor.sessionId })
    expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'record:offscreen-start', sessionId: descriptor.sessionId }))
    await send({ type: 'record:offscreen-finished', target: 'background', sessionId: descriptor.sessionId, recordingId: 'recording-1' })
    expect(browser.windows.create).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('recording=recording-1') }))
    expect(state.session).not.toHaveProperty('crrt:recording-session')

    await send({ type: 'record:open' })
    const cancel = state.session['crrt:recording-session'] as { sessionId: string }
    await send({ type: 'record:surface-ready', sessionId: cancel.sessionId }, surface)
    await expect(send({ type: 'record:surface-command', sessionId: cancel.sessionId, command: { kind: 'cancel' } }, surface)).resolves.toEqual({ ok: true })
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'record:overlay-remove', sessionId: cancel.sessionId }, { frameId: 0 })
    expect(state.session).not.toHaveProperty('crrt:recording-session')

    await send({ type: 'record:open' })
    const failed = state.session['crrt:recording-session'] as { sessionId: string }
    await send({ type: 'record:offscreen-error', target: 'background', sessionId: failed.sessionId, error: 'Permission denied' })
    expect(state.session['crrt:recording-session']).toMatchObject({ snapshot: { status: 'failed', error: 'Permission denied' } })
  })

  it('grants tab capture and DOM target resolution only to extension pages', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    browser.tabCapture.getMediaStreamId.mockResolvedValue('stream-7')
    browser.scripting.executeScript.mockResolvedValue([{ result: { selector: '#pay', pageUrl: 'https://example.com', tagName: 'button' } }])
    const sender = { url: 'chrome-extension://extension-id/record.html' }

    await expect(send({ type: 'record:tab-stream', tabId: 7 }, sender)).resolves.toEqual({ ok: true, data: 'stream-7' })
    expect(browser.tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 7 })
    await expect(send({ type: 'record:resolve-target', tabId: 7, x: 42, y: 61 }, sender)).resolves.toEqual({
      ok: true, data: { selector: '#pay', pageUrl: 'https://example.com', tagName: 'button' },
    })
    expect(browser.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 }, args: [42, 61] }))
    const resolve = browser.scripting.executeScript.mock.calls[0]?.[0]?.func as (x: number, y: number) => unknown
    const button = document.createElement('button'); button.id = 'pay:now'
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => button) })
    Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { escape: (value: string) => value.replace(':', '\\:') } })
    expect(resolve(42, 61)).toMatchObject({ selector: '#pay\\:now', tagName: 'button' })
    button.id = ''; button.className = 'primary large ignored'
    Object.defineProperty(globalThis, 'CSS', { configurable: true, value: undefined })
    expect(resolve(42, 61)).toMatchObject({ selector: 'button.primary.large' })
    vi.mocked(document.elementFromPoint).mockReturnValueOnce(null)
    expect(resolve(42, 61)).toBeNull()

    await expect(send({ type: 'record:tab-stream', tabId: 7 }, { url: 'https://example.com' })).resolves.toEqual({ ok: false, error: 'Invalid recording request' })
    browser.tabs.get.mockResolvedValueOnce({ id: 7, url: 'chrome://extensions' })
    await expect(send({ type: 'record:tab-stream', tabId: 7 }, sender)).resolves.toEqual({ ok: false, error: 'This tab cannot be recorded. Choose Window or Entire screen.' })
    await expect(send({ type: 'record:resolve-target', tabId: 7, x: '42', y: 61 }, sender)).resolves.toEqual({ ok: false, error: 'Invalid recording target' })
  })

  it('routes a tab recording session between its controller and injected surface', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    browser.tabs.get.mockResolvedValueOnce({ id: 7, url: 'https://example.com', windowId: 2 })
    const controller = { url: 'chrome-extension://extension-id/record.html', tab: { id: 9, windowId: 3 } }
    const snapshot = { status: 'countdown', source: 'tab', cameraEnabled: true, microphoneEnabled: true, countdown: 3, durationMs: 0, tool: 'pointer', marks: [], error: null }

    await expect(send({ type: 'record:session-create', tabId: 7, sessionId: 'session-1', snapshot }, controller)).resolves.toMatchObject({ ok: true, data: { sessionId: 'session-1', tabId: 7 } })
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['record-overlay.js'] })
    await expect(send({ type: 'record:surface-mount' }, { url: 'https://example.com', tab: { id: 7 }, frameId: 0 })).resolves.toEqual({ ok: true, data: { sessionId: 'session-1' } })
    await expect(send({ type: 'record:surface-ready', sessionId: 'session-1' }, { url: 'chrome-extension://extension-id/record-controls.html', tab: { id: 7 }, frameId: 2 })).resolves.toEqual({ ok: true, data: snapshot })

    const next = { ...snapshot, status: 'recording', countdown: 0 }
    await expect(send({ type: 'record:session-sync', sessionId: 'session-1', snapshot: next }, controller)).resolves.toEqual({ ok: true, data: 2 })
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'record:surface-state', snapshot: next }), { frameId: 2 })
    const surface = { url: 'chrome-extension://extension-id/record-controls.html', tab: { id: 7 }, frameId: 2 }
    await expect(send({ type: 'record:surface-layout', sessionId: 'session-1', tool: 'pointer', rects: [[1, 2, 3, 4]] }, surface)).resolves.toEqual({ ok: true })
    await expect(send({ type: 'record:surface-pointer', sessionId: 'session-1', x: 'bad', y: 60 }, surface)).resolves.toEqual({ ok: false, error: 'Invalid recording surface' })
    await expect(send({ type: 'record:surface-pointer', sessionId: 'session-1', x: 50, y: 60 }, surface)).resolves.toEqual({ ok: true })
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'record:overlay-pointer', x: 50, y: 60 }), { frameId: 0 })
    await expect(send({ type: 'record:surface-command', sessionId: 'session-1', command: { kind: 'finish' } }, surface)).resolves.toEqual({ ok: true })
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'record:offscreen-command', target: 'offscreen', sessionId: 'session-1', command: { kind: 'finish' } })
    await expect(send({ type: 'record:session-stop', sessionId: 'session-1' }, controller)).resolves.toEqual({ ok: true, data: true })
    expect(state.session).not.toHaveProperty('crrt:recording-session')
  })

  it('reinjects an active recording after navigation, reports lost access, and clears closed sessions', async () => {
    ;(background as unknown as () => void)()
    vi.mocked(isAuthMessage).mockReturnValue(false)
    browser.tabs.get.mockResolvedValue({ id: 7, url: 'https://example.com', windowId: 2 })
    const controller = { url: 'chrome-extension://extension-id/record.html', tab: { id: 9, windowId: 3 } }
    const snapshot = { status: 'recording', source: 'tab', cameraEnabled: false, microphoneEnabled: true, countdown: 0, durationMs: 2_000, tool: 'pointer', marks: [], error: null }
    await send({ type: 'record:session-create', tabId: 7, sessionId: 'session-nav', snapshot }, controller)
    browser.scripting.executeScript.mockClear()
    state.updated!(8, { status: 'complete' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(browser.scripting.executeScript).not.toHaveBeenCalled()
    state.updated!(7, { status: 'complete' })
    await vi.waitFor(() => expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['record-overlay.js'] }))
    browser.scripting.executeScript.mockRejectedValueOnce(new Error('access revoked'))
    browser.runtime.sendMessage.mockRejectedValueOnce(new Error('controller closed'))
    state.updated!(7, { status: 'complete' })
    await vi.waitFor(() => expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:controller-warning', sessionId: 'session-nav' })))
    state.removed!(7)
    await vi.waitFor(() => expect(state.session).not.toHaveProperty('crrt:recording-session'))
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
    state.session['crrt:active-tab:7'] = activation('https://example.com', 'activation-7')
    await expect(send({ type: 'comment:is-active' }, { url: 'not a URL', tab: { id: 7 } })).resolves.toEqual({ ok: true, data: null })
    expect(state.session).toHaveProperty('crrt:active-tab:7')
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
    await expect(send({ type: 'comment:deactivate' }, { tab: { id: 8, url: 'https://example.com' } }))
      .resolves.toEqual({ ok: true, data: false })
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
    browser.storage.session.get.mockClear()
    browser.storage.session.remove.mockClear()
    browser.tabs.get.mockResolvedValueOnce({ id: 7, url: 'https://new.example/page' })
    state.updated!(7, { url: 'https://new.example/page' })
    await vi.waitFor(() => expect(browser.storage.session.get).toHaveBeenCalledWith('crrt:active-tab:7'))
    expect(browser.storage.session.remove).not.toHaveBeenCalled()
    browser.tabs.get.mockClear()
    state.updated!(7, {})
    expect(browser.tabs.get).not.toHaveBeenCalled()
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

describe('native screenshots', () => {
  const sender = { id: 'extension-id', frameId: 0, url: 'https://example.com', tab: { id: 7, windowId: 3 } }
  beforeEach(() => {
    ;(background as unknown as () => void)()
    state.session['crrt:active-tab:7'] = activation('https://example.com', 'activation-7')
    browser.tabs.query.mockResolvedValue([{ id: 7, url: sender.url }])
    browser.tabs.captureVisibleTab.mockResolvedValue('data:image/png;base64,eA==')
  })
  it('captures only the requesting active window as PNG', async () => {
    await expect(send({ type: 'comment:capture' }, sender)).resolves.toEqual({ ok: true, data: 'data:image/png;base64,eA==' })
    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, windowId: 3 })
    expect(browser.tabs.captureVisibleTab).toHaveBeenCalledWith(3, { format: 'png' })
  })
  it.each([null, {}, { ...sender, id: 'foreign' }, { ...sender, frameId: 1 }, { ...sender, tab: {} }, { ...sender, tab: { id: 7 } }, { ...sender, url: 'chrome://settings' }])('rejects invalid senders %j', async (invalid) => {
    await expect(send({ type: 'comment:capture' }, invalid)).resolves.toMatchObject({ ok: false, error: 'Invalid screenshot sender' })
    expect(browser.tabs.captureVisibleTab).not.toHaveBeenCalled()
  })
  it('rejects missing activation', async () => {
    state.session = {}
    await expect(send({ type: 'comment:capture' }, sender)).resolves.toMatchObject({ ok: false, error: 'Screenshot activation unavailable' })
  })
  it.each([[], [{ id: 8, url: sender.url }], [{ id: 7, url: 'https://example.com/next' }]].map((tabs) => [tabs]))('rejects changed tabs before capture %j', async (tabs) => {
    browser.tabs.query.mockResolvedValue(tabs)
    await expect(send({ type: 'comment:capture' }, sender)).resolves.toMatchObject({ ok: false, error: 'Page changed during screenshot capture' })
    expect(browser.tabs.captureVisibleTab).not.toHaveBeenCalled()
  })
  it('discards screenshots after tab, URL or activation changes', async () => {
    for (const change of ['tab', 'url', 'activation']) {
      ;(background as unknown as () => void)()
      state.session['crrt:active-tab:7'] = activation('https://example.com', 'activation-7')
      browser.tabs.query.mockResolvedValue([{ id: 7, url: sender.url }])
      browser.tabs.captureVisibleTab.mockImplementationOnce(async () => {
        if (change === 'activation') state.session['crrt:active-tab:7'] = activation('https://example.com', 'new')
        else browser.tabs.query.mockResolvedValue([{ id: change === 'tab' ? 8 : 7, url: change === 'url' ? 'https://example.com/next' : sender.url }])
        return 'image'
      })
      await expect(send({ type: 'comment:capture' }, sender)).resolves.toMatchObject({ ok: false, error: 'Page changed during screenshot capture' })
    }
  })
  it('serializes capture calls, spaces them by 550ms, and revalidates after waiting', async () => {
    vi.useFakeTimers()
    try {
      const first = send({ type: 'comment:capture' }, sender)
      await vi.advanceTimersByTimeAsync(0)
      await expect(first).resolves.toMatchObject({ ok: true })
      const second = send({ type: 'comment:capture' }, sender)
      const third = send({ type: 'comment:capture' }, sender)
      await vi.advanceTimersByTimeAsync(549)
      expect(browser.tabs.captureVisibleTab).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      await expect(second).resolves.toMatchObject({ ok: true })
      expect(browser.tabs.captureVisibleTab).toHaveBeenCalledTimes(2)
      browser.tabs.query.mockResolvedValue([{ id: 8, url: sender.url }])
      await vi.advanceTimersByTimeAsync(550)
      await expect(third).resolves.toMatchObject({ ok: false })
      expect(browser.tabs.captureVisibleTab).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers() }
  })
  it('reports capture errors and releases the queue for retries', async () => {
    vi.useFakeTimers()
    try {
      browser.tabs.captureVisibleTab.mockRejectedValueOnce(new Error('Permission revoked'))
      await expect(send({ type: 'comment:capture' }, sender)).resolves.toEqual({ ok: false, error: 'Permission revoked' })
      const retry = send({ type: 'comment:capture' }, sender)
      await vi.advanceTimersByTimeAsync(550)
      await expect(retry).resolves.toMatchObject({ ok: true })
    } finally { vi.useRealTimers() }
  })
})

it('discards native pixels when the tab switches away and back or reloads at the same URL', async () => {
  const sender = { id: 'extension-id', frameId: 0, url: 'https://example.com', tab: { id: 7, windowId: 3 } }
  for (const change of ['switch', 'reload', 'remove']) {
    ;(background as unknown as () => void)()
    state.session['crrt:active-tab:7'] = activation('https://example.com', 'activation-7')
    browser.tabs.query.mockResolvedValue([{ id: 7, url: sender.url }])
    browser.tabs.captureVisibleTab.mockImplementationOnce(async () => {
      if (change === 'switch') { state.activated!({ windowId: 3 }); state.activated!({ windowId: 3 }) }
      else if (change === 'reload') { state.updated!(7, { status: 'loading' }); state.updated!(7, { status: 'loading' }) }
      else state.removed!(7)
      return 'image'
    })
    await expect(send({ type: 'comment:capture' }, sender)).resolves.toMatchObject({ ok: false })
  }
})

it('requests first-use device permissions in a visible window before acquiring a tab stream', async () => {
  ;(background as unknown as () => void)()
  vi.mocked(isAuthMessage).mockReturnValue(false)
  browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com', title: 'Example' }])
  browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'record:permissions-check' ? { granted: false } : { ok: true })
  await send({ type: 'record:open' })
  const descriptor = state.session['crrt:recording-session'] as { sessionId: string }
  const surface = { url: 'https://example.com', tab: { id: 7 }, frameId: 0 }
  await send({ type: 'record:surface-ready', sessionId: descriptor.sessionId }, surface)
  await send({ type: 'record:surface-command', sessionId: descriptor.sessionId, command: { kind: 'start' } }, surface)
  expect(browser.tabCapture.getMediaStreamId).not.toHaveBeenCalled()
  expect(browser.windows.create).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/record-permissions.html?session=') }))
  const permissionUrl = new URL(browser.windows.create.mock.calls[browser.windows.create.mock.calls.length - 1]![0].url)
  expect(permissionUrl.searchParams.get('camera')).toBe('1')
  expect(permissionUrl.searchParams.get('microphone')).toBe('1')
  browser.runtime.sendMessage.mockResolvedValue({ ok: true, granted: true })
  const ready = { type: 'record:permissions-ready', sessionId: descriptor.sessionId }
  await expect(send(ready, { url: 'https://example.com' })).resolves.toMatchObject({ ok: false })
  await expect(send({ ...ready, sessionId: 'expired' }, { url: 'chrome-extension://extension-id/record-permissions.html', tab: { windowId: 99 } })).resolves.toMatchObject({ ok: false })
  await expect(send(ready, { url: 'chrome-extension://extension-id/record-permissions.html', tab: { windowId: 99 } })).resolves.toEqual({ ok: true })
  expect(browser.tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 7 })
  const current = state.session['crrt:recording-session'] as any
  current.snapshot.status = 'recording'
  await expect(send(ready, { url: 'chrome-extension://extension-id/record-permissions.html', tab: { windowId: 99 } })).resolves.toMatchObject({ ok: false })
  delete state.session['crrt:recording-session']
  await expect(send(ready, { url: 'chrome-extension://extension-id/record-permissions.html', tab: { windowId: 99 } })).resolves.toMatchObject({ ok: false })
})

it('requests only the enabled devices when a setup attempt needs permission', async () => {
  ;(background as unknown as () => void)()
  vi.mocked(isAuthMessage).mockReturnValue(false)
  browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com' }])
  browser.runtime.sendMessage.mockResolvedValue({ granted: false })
  await send({ type: 'record:open' })
  const descriptor = state.session['crrt:recording-session'] as { sessionId: string }
  const surface = { url: 'https://example.com', tab: { id: 7 }, frameId: 0 }
  await send({ type: 'record:surface-ready', sessionId: descriptor.sessionId }, surface)
  for (const kind of ['camera.toggled', 'microphone.toggled', 'start']) await send({ type: 'record:surface-command', sessionId: descriptor.sessionId, command: { kind } }, surface)
  const url = new URL(browser.windows.create.mock.calls[browser.windows.create.mock.calls.length - 1]![0].url)
  expect(url.searchParams.get('camera')).toBe('0')
  expect(url.searchParams.get('microphone')).toBe('0')
})

it('returns a failed capture acknowledgment to the visible permission window', async () => {
  ;(background as unknown as () => void)()
  vi.mocked(isAuthMessage).mockReturnValue(false)
  browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com' }])
  browser.runtime.sendMessage.mockImplementation(async (message) => message.type === 'record:permissions-check' ? { granted: true } : { ok: false, error: 'Camera disconnected' })
  await send({ type: 'record:open' })
  const descriptor = state.session['crrt:recording-session'] as { sessionId: string }
  await expect(send({ type: 'record:permissions-ready', sessionId: descriptor.sessionId }, { url: 'chrome-extension://extension-id/record-permissions.html', tab: { windowId: 99 } })).resolves.toEqual({ ok: false, error: 'Camera disconnected' })
})

it.each(['finish', 'cancel', 'error', 'tab-close'])('closes the temporary permission window on %s', async (action) => {
  ;(background as unknown as () => void)()
  vi.mocked(isAuthMessage).mockReturnValue(false)
  browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com' }])
  browser.runtime.sendMessage.mockResolvedValue({ ok: true, granted: true })
  await send({ type: 'record:open' })
  const descriptor = state.session['crrt:recording-session'] as { sessionId: string }
  const sessionId = descriptor.sessionId
  const sender = { url: 'chrome-extension://extension-id/record-permissions.html', tab: { windowId: 99 } }
  await expect(send({ type: 'record:permissions-ready', sessionId }, { url: sender.url })).resolves.toMatchObject({ ok: false })
  await expect(send({ type: 'record:permissions-ready', sessionId }, sender)).resolves.toMatchObject({ ok: true })
  expect(browser.windows.update).toHaveBeenCalledWith(99, { state: 'minimized' })
  if (action === 'finish') {
    browser.windows.remove.mockRejectedValueOnce(new Error('Window already closed'))
    await send({ type: 'record:offscreen-finished', target: 'background', sessionId, recordingId: 'capture-1' })
  } else if (action === 'cancel') {
    const surface = { url: 'https://example.com', tab: { id: 7 }, frameId: 0 }
    await send({ type: 'record:surface-ready', sessionId }, surface)
    await send({ type: 'record:surface-command', sessionId, command: { kind: 'cancel' } }, surface)
  } else if (action === 'error') {
    await send({ type: 'record:offscreen-error', target: 'background', sessionId, error: 'Encoder failed' })
  } else {
    state.removed!(7)
  }
  await vi.waitFor(() => expect(browser.windows.remove).toHaveBeenCalledWith(99))
})

it('reopens an active session without replacing it, stopping capture, or losing its permission window', async () => {
  ;(background as unknown as () => void)()
  vi.mocked(isAuthMessage).mockReturnValue(false)
  browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com' }])
  browser.tabs.get.mockResolvedValue({ id: 7, windowId: 2, url: 'https://example.com' })
  await send({ type: 'record:open' })
  const descriptor = state.session['crrt:recording-session'] as any
  descriptor.snapshot.status = 'recording'
  descriptor.snapshot.durationMs = 12000
  descriptor.permissionWindowId = 99
  const preserved = structuredClone(descriptor)
  const initialInjections = browser.scripting.executeScript.mock.calls.length
  await Promise.all([send({ type: 'record:open' }), send({ type: 'record:open' })])
  expect(browser.scripting.executeScript).toHaveBeenCalledTimes(initialInjections)
  expect(state.session['crrt:recording-session']).toEqual(preserved)
  expect(browser.tabs.update).toHaveBeenCalledWith(7, { active: true })
  expect(browser.windows.update).toHaveBeenCalledWith(2, { focused: true })
  expect(browser.windows.remove).not.toHaveBeenCalled()
  expect(browser.runtime.sendMessage).not.toHaveBeenCalled()
  descriptor.controllerTabId = 9
  browser.tabs.get.mockResolvedValue({ id: 9, windowId: 3, url: 'chrome-extension://extension-id/record.html' })
  const injections = browser.scripting.executeScript.mock.calls.length
  await send({ type: 'record:open' })
  expect(browser.tabs.update).toHaveBeenLastCalledWith(9, { active: true })
  expect(browser.scripting.executeScript).toHaveBeenCalledTimes(injections)
})

it('opens a standalone source picker from the library when no web tab is active', async () => {
  ;(background as unknown as () => void)()
  vi.mocked(isAuthMessage).mockReturnValue(false)
  browser.tabs.query.mockResolvedValue([{ id: 9, url: 'chrome-extension://extension-id/recordings.html' }])
  await expect(send({ type: 'record:open' }, { url: 'chrome-extension://extension-id/recordings.html' })).resolves.toEqual({ ok: true })
  expect(browser.windows.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'chrome-extension://extension-id/record.html' }))
  await expect(send({ type: 'record:open' }, { url: 'chrome-extension://another-extension/recordings.html' })).resolves.toMatchObject({ ok: false })
})

it('preserves surface authorization across worker restarts and rejects other tabs and frames', async () => {
  ;(background as unknown as () => void)()
  vi.mocked(isAuthMessage).mockReturnValue(false)
  browser.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com' }])
  await send({ type: 'record:open' })
  const descriptor = state.session['crrt:recording-session'] as any
  const surface = { url: 'https://example.com', tab: { id: 7 }, frameId: 0 }
  await send({ type: 'record:surface-ready', sessionId: descriptor.sessionId }, surface)
  expect(state.session['crrt:recording-session']).toMatchObject({ surfaceFrameId: 0 })
  vi.resetModules()
  const { default: worker } = await import('../entrypoints/background')
  ;(worker as unknown as () => void)()
  const command = { type: 'record:surface-command', sessionId: descriptor.sessionId, command: { kind: 'camera.toggled' } }
  await expect(send(command, surface)).resolves.toMatchObject({ ok: true })
  for (const sender of [{ ...surface, tab: { id: 8 } }, { ...surface, frameId: 1 }, { ...surface, frameId: undefined }]) {
    await expect(send(command, sender)).resolves.toMatchObject({ ok: false })
  }
})
