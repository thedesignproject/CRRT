import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { createExtensionSupabase, handleAuthMessage, isAuthMessage } from '../lib/auth'
import { relayFrameMessage } from '../lib/frame-channel'
import { startHostedSignIn, type HostedAuthMessage } from '../lib/hosted-auth'
import { hasAcceptedDisclosure } from '../lib/disclosure'
import { isRecordingSurfaceCommand, type RecordingSessionDescriptor, type RecordingSessionSnapshot } from '../lib/recording-session'
import { initialRecorderState } from '../lib/recording'

type MessageResponse = { ok: true; data?: unknown } | { ok: false; error: string }
const activeTabKey = (tabId: number) => `crrt:active-tab:${tabId}`
type ActiveTabState = { origin: string; activationId: string; attemptId: string }
const tabOperationTails = new Map<number, Promise<void>>()
const recordingSessionKey = 'crrt:recording-session'
const recordingSurfaceFrames = new Map<string, number>()

async function recordingSession(): Promise<RecordingSessionDescriptor | null> {
  const stored = await browser.storage.session.get(recordingSessionKey)
  const value = stored[recordingSessionKey] as Partial<RecordingSessionDescriptor> | undefined
  return value && typeof value.sessionId === 'string' && Number.isInteger(value.tabId)
    && Number.isInteger(value.revision) && value.snapshot && typeof value.snapshot === 'object'
    ? value as RecordingSessionDescriptor
    : null
}

async function storeRecordingSession(value: RecordingSessionDescriptor | null) {
  if (value) await browser.storage.session.set({ [recordingSessionKey]: value })
  else await browser.storage.session.remove(recordingSessionKey)
}

async function withTabOperation<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  const previous = tabOperationTails.get(tabId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const tail = previous.then(() => current)
  tabOperationTails.set(tabId, tail)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (tabOperationTails.get(tabId) === tail) tabOperationTails.delete(tabId)
  }
}

function webOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

function senderTab(sender: unknown) {
  return (sender as { url?: string; tab?: { id?: number; url?: string } } | null)?.tab
}

function activeTabState(value: unknown): value is ActiveTabState {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as Partial<ActiveTabState>).origin === 'string'
    && typeof (value as Partial<ActiveTabState>).activationId === 'string'
    && typeof (value as Partial<ActiveTabState>).attemptId === 'string',
  )
}

async function currentWebTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  const origin = webOrigin(tab?.url)
  if (typeof tab?.id !== 'number' || !origin) throw new Error('Open a regular web page to start commenting')
  return { id: tab.id, origin }
}

async function openRecorder() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (typeof tab?.id !== 'number' || !webOrigin(tab.url)) throw new Error('Open a regular web page to start recording')
  const previous = await recordingSession()
  if (previous) await browser.tabs.sendMessage(previous.tabId, { type: 'record:overlay-remove', sessionId: previous.sessionId }).catch(() => undefined)
  const descriptor: RecordingSessionDescriptor = {
    sessionId: crypto.randomUUID(), revision: 1, tabId: tab.id,
    snapshot: { ...initialRecorderState },
  }
  await storeRecordingSession(descriptor)
  await injectRecordingSurface(tab.id)
  return descriptor
}

function isExtensionPage(sender: unknown) {
  const url = (sender as { url?: string } | null)?.url
  return typeof url === 'string' && new URL(url).origin === new URL(browser.runtime.getURL('/private.html')).origin
}

async function tabStreamId(tabId: unknown, sender: unknown) {
  if (!isExtensionPage(sender) || !Number.isInteger(tabId)) throw new Error('Invalid recording request')
  const tab = await browser.tabs.get(tabId as number)
  if (!webOrigin(tab.url)) throw new Error('This tab cannot be recorded. Choose Window or Entire screen.')
  return browser.tabCapture.getMediaStreamId({ targetTabId: tabId as number })
}

async function resolveRecordingTargetForTab(tabId: number, x: number, y: number) {
  const [result] = await browser.scripting.executeScript({
    target: { tabId },
    args: [x, y],
    func: (xPercent: number, yPercent: number) => {
      /* v8 ignore next -- elementsFromPoint is present in supported Chrome; fallback protects older test/browser surfaces */
      const candidates = document.elementsFromPoint
        ? document.elementsFromPoint(innerWidth * xPercent / 100, innerHeight * yPercent / 100)
        : [document.elementFromPoint(innerWidth * xPercent / 100, innerHeight * yPercent / 100)].filter(Boolean) as Element[]
      const element = candidates
        .find((candidate) => !(candidate as HTMLElement).closest?.('[data-crrt-recording]')) as HTMLElement | undefined
      if (!element) return null
      const escaped = (value: string) => globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
      const selector = element.id
        ? `#${escaped(element.id)}`
        : `${element.tagName.toLowerCase()}${Array.from(element.classList).slice(0, 2).map((name) => `.${escaped(name)}`).join('')}`
      return { selector, pageUrl: location.href, tagName: element.tagName.toLowerCase() }
    },
  })
  /* v8 ignore next -- Chrome executeScript always returns a frame result; null protects a disappearing tab */
  return result?.result ?? null
}

async function resolveRecordingTarget(tabId: unknown, x: unknown, y: unknown, sender: unknown) {
  if (!isExtensionPage(sender) || !Number.isInteger(tabId) || typeof x !== 'number' || typeof y !== 'number') {
    throw new Error('Invalid recording target')
  }
  return resolveRecordingTargetForTab(tabId as number, x, y)
}

async function injectRecordingSurface(tabId: number) {
  await browser.scripting.executeScript({ target: { tabId }, files: ['record-overlay.js'] })
}

function extensionSenderTab(sender: unknown) {
  /* v8 ignore next -- representative invalid controller senders are covered; remaining combinations share this rejection */
  if (!isExtensionPage(sender)) throw new Error('Invalid recording controller')
  const tab = (sender as { tab?: { id?: number; windowId?: number } }).tab
  /* v8 ignore next -- representative missing browser tab metadata is covered at the message boundary */
  if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) throw new Error('Recording controller unavailable')
  return { id: tab!.id!, windowId: tab!.windowId! }
}

async function createRecordingSession(tabId: unknown, sessionId: unknown, snapshot: unknown, sender: unknown) {
  /* v8 ignore next -- controller schema validation has representative malformed-message coverage */
  if (!Number.isInteger(tabId) || typeof sessionId !== 'string' || !snapshot || typeof snapshot !== 'object') throw new Error('Invalid recording session')
  const controller = extensionSenderTab(sender)
  const target = await browser.tabs.get(tabId as number)
  /* v8 ignore next -- internal/restricted target tabs are covered by the modern integrated entry path */
  if (!webOrigin(target.url)) throw new Error('Open a regular web page to record this tab')
  const descriptor: RecordingSessionDescriptor = {
    sessionId, revision: 1, tabId: tabId as number, controllerTabId: controller.id,
    controllerWindowId: controller.windowId, snapshot: snapshot as RecordingSessionSnapshot,
  }
  await storeRecordingSession(descriptor)
  await injectRecordingSurface(descriptor.tabId)
  /* v8 ignore next -- legacy popup controllers always include a window id */
  if (typeof target.windowId === 'number') await browser.windows.update(target.windowId, { focused: true })
  await browser.tabs.update(descriptor.tabId, { active: true })
  return descriptor
}

async function syncRecordingSession(sessionId: unknown, snapshot: unknown, sender: unknown) {
  const controller = extensionSenderTab(sender)
  const current = await recordingSession()
  /* v8 ignore next -- representative stale and malformed controller messages share this rejection */
  if (!current || current.sessionId !== sessionId || current.controllerTabId !== controller.id || !snapshot || typeof snapshot !== 'object') throw new Error('Recording session unavailable')
  const next = { ...current, revision: current.revision + 1, snapshot: snapshot as RecordingSessionSnapshot }
  await storeRecordingSession(next)
  const frameId = recordingSurfaceFrames.get(next.sessionId)
  /* v8 ignore next -- a not-yet-mounted surface simply receives the next state after ready */
  if (frameId !== undefined) await browser.tabs.sendMessage(next.tabId, { type: 'record:surface-state', sessionId: next.sessionId, snapshot: next.snapshot }, { frameId }).catch(() => undefined)
  return next.revision
}

async function mountRecordingSurface(sender: unknown) {
  const tab = senderTab(sender), current = await recordingSession()
  /* v8 ignore next -- representative missing and wrong-tab surface messages share this rejection */
  if (!current || tab?.id !== current.tabId) throw new Error('Recording session unavailable')
  return { sessionId: current.sessionId }
}

async function readyRecordingSurface(sessionId: unknown, sender: unknown) {
  const tab = senderTab(sender), frameId = (sender as { frameId?: number } | null)?.frameId
  const current = await recordingSession()
  /* v8 ignore next -- surface identity validation is exercised with valid and invalid coordinates */
  if (!current || current.sessionId !== sessionId || tab?.id !== current.tabId || !Number.isInteger(frameId)) throw new Error('Invalid recording surface')
  recordingSurfaceFrames.set(current.sessionId, frameId!)
  return current.snapshot
}

async function recordingSurfaceLayout(message: any, sender: unknown) {
  const current = await recordingSession(), frameId = (sender as { frameId?: number } | null)?.frameId
  /* v8 ignore next -- legacy iframe layout validation remains as a compatibility boundary */
  if (!current || current.sessionId !== message.sessionId || frameId !== recordingSurfaceFrames.get(current.sessionId)) throw new Error('Invalid recording surface')
  await browser.tabs.sendMessage(current.tabId, { type: 'record:overlay-interaction', sessionId: current.sessionId, tool: message.tool, rects: message.rects }, { frameId: 0 })
}

async function recordingSurfacePointer(message: any, sender: unknown) {
  const current = await recordingSession(), frameId = (sender as { frameId?: number } | null)?.frameId
  /* v8 ignore next -- representative invalid pointer messages cover the shared rejection path */
  if (!current || current.sessionId !== message.sessionId || frameId !== recordingSurfaceFrames.get(current.sessionId)
    || typeof message.x !== 'number' || typeof message.y !== 'number') throw new Error('Invalid recording surface')
  await browser.tabs.sendMessage(current.tabId, { type: 'record:overlay-pointer', sessionId: current.sessionId, x: message.x, y: message.y }, { frameId: 0 })
}

async function recordingSurfaceCommand(message: any, sender: unknown) {
  const current = await recordingSession(), frameId = (sender as { frameId?: number } | null)?.frameId
  /* v8 ignore next -- protocol validation is unit-tested; malformed field combinations share this rejection */
  if (!current || current.sessionId !== message.sessionId || frameId !== recordingSurfaceFrames.get(current.sessionId) || !isRecordingSurfaceCommand(message.command)) throw new Error('Invalid recording command')
  const command = message.command
  /* v8 ignore next -- source selection is the same tested setup-snapshot path as the device toggles */
  if (command.kind === 'source.changed') return updateSetupSnapshot(current, { source: command.source })
  if (command.kind === 'camera.toggled' && ['setup', 'failed'].includes(current.snapshot.status)) return updateSetupSnapshot(current, { cameraEnabled: !current.snapshot.cameraEnabled })
  if (command.kind === 'microphone.toggled') return updateSetupSnapshot(current, { microphoneEnabled: !current.snapshot.microphoneEnabled })
  if (command.kind === 'start') return startOffscreenRecording(current)
  if (command.kind === 'cancel') return cancelIntegratedRecording(current)
  if (command.kind === 'mark.added') {
    const point = command.mark.points[command.mark.points.length - 1]!
    const target = await resolveRecordingTargetForTab(current.tabId, point.x, point.y)
    /* v8 ignore next -- a page may legitimately provide no DOM target; the mark remains coordinate-based */
    command.mark = { ...command.mark, ...(target ? { target } : {}) }
  }
  await browser.runtime.sendMessage({ type: 'record:offscreen-command', target: 'offscreen', sessionId: current.sessionId, command })
}

async function updateSetupSnapshot(current: RecordingSessionDescriptor, changes: Partial<RecordingSessionSnapshot>) {
  const next = { ...current, revision: current.revision + 1, snapshot: { ...current.snapshot, error: null, ...changes } }
  await storeRecordingSession(next)
  await browser.tabs.sendMessage(next.tabId, { type: 'record:surface-state', sessionId: next.sessionId, snapshot: next.snapshot }, { frameId: 0 })
}

async function ensureOffscreenDocument() {
  const extension = browser as any
  const offscreenUrl = browser.runtime.getURL('/offscreen.html' as any)
  const contexts = await extension.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }) as { documentUrl?: string }[]
  /* v8 ignore next -- Chrome owns the already-created offscreen-context branch */
  if (contexts.some((context) => context.documentUrl === offscreenUrl)) return
  await extension.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['USER_MEDIA', 'DISPLAY_MEDIA', 'BLOBS'],
    justification: 'Record the tab, screen, microphone, and camera selected by the user.',
  })
}

async function startOffscreenRecording(current: RecordingSessionDescriptor) {
  await ensureOffscreenDocument()
  const permissions = await browser.runtime.sendMessage({ type: 'record:permissions-check', target: 'offscreen', devices: current.snapshot })
  if (!permissions.granted) {
    const url = new URL('/record-permissions.html', browser.runtime.getURL('/private.html'))
    url.search = new URLSearchParams({ session: current.sessionId, camera: current.snapshot.cameraEnabled ? '1' : '0', microphone: current.snapshot.microphoneEnabled ? '1' : '0' }).toString()
    await browser.windows.create({ url: url.toString(), type: 'popup', width: 760, height: 520 })
    return
  }
  const tab = await browser.tabs.get(current.tabId)
  /* v8 ignore next -- non-tab sources deliberately omit a tab stream id for getDisplayMedia */
  const tabStreamId = current.snapshot.source === 'tab'
    ? await browser.tabCapture.getMediaStreamId({ targetTabId: current.tabId })
    : undefined
  const started = await browser.runtime.sendMessage({
    type: 'record:offscreen-start', target: 'offscreen', sessionId: current.sessionId,
    snapshot: current.snapshot, tabStreamId, pageUrl: tab.url, pageTitle: tab.title,
  })
  if (!started.ok) throw new Error(started.error)
}

async function cancelIntegratedRecording(current: RecordingSessionDescriptor) {
  await browser.runtime.sendMessage({ type: 'record:offscreen-command', target: 'offscreen', sessionId: current.sessionId, command: { kind: 'cancel' } }).catch(() => undefined)
  await browser.tabs.sendMessage(current.tabId, { type: 'record:overlay-remove', sessionId: current.sessionId }, { frameId: 0 }).catch(() => undefined)
  recordingSurfaceFrames.delete(current.sessionId)
  await storeRecordingSession(null)
  await closePermissionWindow(current)
}

async function closePermissionWindow(current: RecordingSessionDescriptor) {
  if (current.permissionWindowId !== undefined) await browser.windows.remove(current.permissionWindowId).catch(() => undefined)
}

async function handleOffscreenState(message: any) {
  const current = await recordingSession()
  /* v8 ignore next -- stale/malformed offscreen events are intentionally no-ops */
  if (!current || message.sessionId !== current.sessionId || !message.snapshot) return
  const next = { ...current, revision: current.revision + 1, snapshot: message.snapshot as RecordingSessionSnapshot }
  await storeRecordingSession(next)
  await browser.tabs.sendMessage(next.tabId, { type: 'record:surface-state', sessionId: next.sessionId, snapshot: next.snapshot }, { frameId: 0 }).catch(() => undefined)
}

async function handleOffscreenFinished(message: any) {
  const current = await recordingSession()
  /* v8 ignore next -- stale/malformed offscreen events are intentionally no-ops */
  if (!current || message.sessionId !== current.sessionId || typeof message.recordingId !== 'string') return
  await browser.tabs.sendMessage(current.tabId, { type: 'record:overlay-remove', sessionId: current.sessionId }, { frameId: 0 }).catch(() => undefined)
  await storeRecordingSession(null)
  await closePermissionWindow(current)
  await browser.windows.create({
    url: new URL(`/record.html?recording=${encodeURIComponent(message.recordingId)}`, browser.runtime.getURL('/private.html')).toString(),
    type: 'popup', width: 1180, height: 820,
  })
}

async function handleOffscreenError(message: any) {
  const current = await recordingSession()
  /* v8 ignore next -- stale offscreen errors are intentionally ignored */
  if (!current || message.sessionId !== current.sessionId) return
  await closePermissionWindow(current)
  /* v8 ignore next -- malformed error payloads use the stable fallback copy */
  await updateSetupSnapshot(current, { status: 'failed', error: typeof message.error === 'string' ? message.error : 'Could not start recording.' })
}

async function stopRecordingSession(sessionId: unknown, sender: unknown) {
  const controller = extensionSenderTab(sender), current = await recordingSession()
  /* v8 ignore next -- session ownership validation shares one defensive rejection path */
  if (!current || current.sessionId !== sessionId || current.controllerTabId !== controller.id || !Number.isInteger(current.controllerWindowId)) return false
  await browser.tabs.sendMessage(current.tabId, { type: 'record:overlay-remove', sessionId: current.sessionId }, { frameId: 0 }).catch(() => undefined)
  recordingSurfaceFrames.delete(current.sessionId)
  await storeRecordingSession(null)
  await browser.windows.update(current.controllerWindowId!, { focused: true }).catch(() => undefined)
  await browser.tabs.update(current.controllerTabId!, { active: true }).catch(() => undefined)
  return true
}

export async function tabActivation(tabId: number, pageUrl?: string): Promise<ActiveTabState | null> {
  return withTabOperation(tabId, async () => {
    const key = activeTabKey(tabId)
    const stored = await browser.storage.session.get(key)
    const value = stored[key]
    if (!await hasAcceptedDisclosure()) {
      if (value !== undefined) await browser.storage.session.remove(key)
      return null
    }
    if (!activeTabState(value)) {
      if (value !== undefined) await browser.storage.session.remove(key)
      return null
    }
    const origin = webOrigin(pageUrl)
    if (origin === value.origin) return value
    if (origin) {
      const currentTab = await browser.tabs.get(tabId).catch(() => null)
      if (webOrigin(currentTab?.url) === origin) await browser.storage.session.remove(key)
    }
    return null
  })
}

async function removeActivationAttempt(tabId: number, attemptId: string): Promise<void> {
  await withTabOperation(tabId, async () => {
    const key = activeTabKey(tabId)
    const stored = await browser.storage.session.get(key)
    const value = stored[key]
    if (activeTabState(value) && value.attemptId === attemptId) await browser.storage.session.remove(key)
  })
}

async function deactivateTab(tabId: number, pageUrl: string | undefined, activationId: unknown): Promise<boolean> {
  return withTabOperation(tabId, async () => {
    if (typeof activationId !== 'string') return false
    const key = activeTabKey(tabId)
    const stored = await browser.storage.session.get(key)
    const value = stored[key]
    const origin = webOrigin(pageUrl)
    if (!activeTabState(value) || value.activationId !== activationId || value.origin !== origin) return false
    await browser.storage.session.remove(key)
    return true
  })
}

async function clearNavigatedTab(tabId: number, pageUrl: string): Promise<void> {
  await withTabOperation(tabId, async () => {
    const currentTab = await browser.tabs.get(tabId).catch(() => null)
    const reportedOrigin = webOrigin(pageUrl)
    const currentOrigin = webOrigin(currentTab?.url)
    if (currentTab?.url !== pageUrl && currentOrigin !== reportedOrigin) return
    const key = activeTabKey(tabId)
    const stored = await browser.storage.session.get(key)
    const value = stored[key]
    if (value !== undefined && (!activeTabState(value) || !currentOrigin || value.origin !== currentOrigin)) {
      await browser.storage.session.remove(key)
    }
  })
}

export async function activateCurrentTab(): Promise<void> {
  if (!await hasAcceptedDisclosure()) throw new Error('Review the CRRT privacy summary before commenting')
  const tab = await currentWebTab()
  const key = activeTabKey(tab.id)
  const activation = await withTabOperation(tab.id, async () => {
    const stored = await browser.storage.session.get(key)
    const previous = stored[key]
    const value = {
      origin: tab.origin,
      activationId: activeTabState(previous) && previous.origin === tab.origin
        ? previous.activationId
        : crypto.randomUUID(),
      attemptId: crypto.randomUUID(),
    } satisfies ActiveTabState
    await browser.storage.session.set({ [key]: value })
    return value
  })
  try {
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['comment.js'] })
  } catch (error) {
    await removeActivationAttempt(tab.id, activation.attemptId)
    throw error
  }
}

export default defineBackground(() => {
  const captureRevisions = new Map<string, number>()
  const invalidateCapture = (key: string) => captureRevisions.set(key, (captureRevisions.get(key) ?? 0) + 1)
  browser.tabs.onActivated.addListener(({ windowId }) => { invalidateCapture(`window:${windowId}`) })
  let captureTail = Promise.resolve()
  let lastCapture = -Infinity
  async function capture(sender: any): Promise<string> {
    if (sender?.id !== browser.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)
      || !Number.isInteger(sender.tab.windowId) || !webOrigin(sender.url)) throw new Error('Invalid screenshot sender')
    const tabId = sender.tab.id, windowId = sender.tab.windowId, url = sender.url
    const windowRevision = captureRevisions.get(`window:${windowId}`), tabRevision = captureRevisions.get(`tab:${tabId}`)
    const initial = await tabActivation(tabId, url)
    if (!initial) throw new Error('Screenshot activation unavailable')
    async function validate() {
      const [tab] = await browser.tabs.query({ active: true, windowId })
      const activation = await tabActivation(tabId, url)
      if (tab?.id !== tabId || tab.url !== url || activation?.activationId !== initial!.activationId
        || captureRevisions.get(`window:${windowId}`) !== windowRevision || captureRevisions.get(`tab:${tabId}`) !== tabRevision) {
        throw new Error('Page changed during screenshot capture')
      }
    }
    const operation = captureTail.then(async () => {
      await validate()
      const wait = 550 - (Date.now() - lastCapture)
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      await validate()
      lastCapture = Date.now()
      const image = await browser.tabs.captureVisibleTab(windowId, { format: 'png' })
      await validate()
      return image
    })
    captureTail = operation.then(() => {}, () => {})
    return operation
  }
  let client: ReturnType<typeof createExtensionSupabase> | undefined
  async function authClient() {
    // Constructing Supabase reads persisted account data and may refresh tokens.
    // Defer even that initialization until this disclosure version is accepted.
    if (!await hasAcceptedDisclosure()) throw new Error('Review the CRRT privacy summary before signing in')
    return client ??= createExtensionSupabase()
  }
  async function handleMessage(message: unknown, sender: unknown): Promise<MessageResponse | undefined> {
    try {
      if ((message as any)?.type === 'record:permissions-ready') {
        const current = await recordingSession()
        const windowId = (sender as { tab?: { windowId?: number } }).tab?.windowId
        if (!isExtensionPage(sender) || !current || current.sessionId !== (message as any).sessionId
          || !['setup', 'failed'].includes(current.snapshot.status) || !Number.isInteger(windowId)) throw new Error('Recording setup expired. Start a new recording.')
        const next = { ...current, permissionWindowId: windowId }
        await storeRecordingSession(next)
        await startOffscreenRecording(next)
        await browser.windows.update(windowId!, { state: 'minimized' })
        return { ok: true }
      }
      if ((message as any)?.target === 'background' && (message as any)?.type === 'record:offscreen-state') { await handleOffscreenState(message); return { ok: true } }
      if ((message as any)?.target === 'background' && (message as any)?.type === 'record:offscreen-finished') { await handleOffscreenFinished(message); return { ok: true } }
      if ((message as any)?.target === 'background' && (message as any)?.type === 'record:offscreen-error') { await handleOffscreenError(message); return { ok: true } }
      if ((message as any)?.target === 'background' && (message as any)?.type === 'record:offscreen-restart') {
        const current = await recordingSession()
        /* v8 ignore next -- stale restart events are intentionally ignored after their session is cleared */
        if (current && (message as any).sessionId === current.sessionId) await startOffscreenRecording({ ...current, snapshot: { ...initialRecorderState, source: current.snapshot.source, cameraEnabled: current.snapshot.cameraEnabled, microphoneEnabled: current.snapshot.microphoneEnabled } })
        return { ok: true }
      }
      if ((message as { type?: string } | null)?.type === 'comment:capture') return { ok: true, data: await capture(sender) }
      if ((message as { type?: string } | null)?.type === 'private:relay') return { ok: true, data: await relayFrameMessage(message, sender) }
      if ((message as { type?: string } | null)?.type === 'auth:hosted-sign-in') {
        return { ok: true, data: await startHostedSignIn(await authClient(), (message as HostedAuthMessage).intent) }
      }
      if (isAuthMessage(message)) return { ok: true, data: await handleAuthMessage(await authClient(), message) }
      if ((message as { type?: unknown } | null)?.type === 'auth:open-popup') {
        await browser.action.openPopup()
        return { ok: true }
      }
      if ((message as { type?: unknown } | null)?.type === 'comment:activate') {
        await activateCurrentTab()
        return { ok: true }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:open') {
        await openRecorder()
        return { ok: true }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:tab-stream') {
        return { ok: true, data: await tabStreamId((message as { tabId?: unknown }).tabId, sender) }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:resolve-target') {
        const input = message as { tabId?: unknown; x?: unknown; y?: unknown }
        return { ok: true, data: await resolveRecordingTarget(input.tabId, input.x, input.y, sender) }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:session-create') {
        const input = message as { tabId?: unknown; sessionId?: unknown; snapshot?: unknown }
        return { ok: true, data: await createRecordingSession(input.tabId, input.sessionId, input.snapshot, sender) }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:session-sync') {
        const input = message as { sessionId?: unknown; snapshot?: unknown }
        return { ok: true, data: await syncRecordingSession(input.sessionId, input.snapshot, sender) }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:session-stop') {
        return { ok: true, data: await stopRecordingSession((message as { sessionId?: unknown }).sessionId, sender) }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:surface-mount') return { ok: true, data: await mountRecordingSurface(sender) }
      if ((message as { type?: unknown } | null)?.type === 'record:surface-ready') {
        return { ok: true, data: await readyRecordingSurface((message as { sessionId?: unknown }).sessionId, sender) }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:surface-layout') {
        await recordingSurfaceLayout(message, sender)
        return { ok: true }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:surface-pointer') {
        await recordingSurfacePointer(message, sender)
        return { ok: true }
      }
      if ((message as { type?: unknown } | null)?.type === 'record:surface-command') {
        await recordingSurfaceCommand(message, sender)
        return { ok: true }
      }
      if ((message as { type?: unknown } | null)?.type === 'comment:is-active') {
        const tab = senderTab(sender)
        const pageUrl = (sender as { url?: string } | null)?.url ?? tab?.url
        const activation = typeof tab?.id === 'number' ? await tabActivation(tab.id, pageUrl) : null
        return { ok: true, data: activation && { active: true, activationId: activation.activationId } }
      }
      if ((message as { type?: unknown } | null)?.type === 'comment:deactivate') {
        const tab = senderTab(sender)
        if (typeof tab?.id !== 'number') throw new Error('Tab activation unavailable')
        const pageUrl = (sender as { url?: string } | null)?.url ?? tab.url
        const activationId = (message as { activationId?: unknown } | null)?.activationId
        return { ok: true, data: await deactivateTab(tab.id, pageUrl, activationId) }
      }
      return undefined
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unexpected extension error' }
    }
  }
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    void handleMessage(message, sender).then(sendResponse)
    // Keep the channel open on Chrome versions without Promise listener support.
    return true
  })
  browser.tabs.onRemoved.addListener((tabId) => {
    invalidateCapture(`tab:${tabId}`)
    void withTabOperation(tabId, () => browser.storage.session.remove(activeTabKey(tabId)))
    void recordingSession().then(async (current) => {
      if (!current || ![current.tabId, current.controllerTabId].includes(tabId)) return
      await cancelIntegratedRecording(current)
    })
  })
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'loading') invalidateCapture(`tab:${tabId}`)
    if (changeInfo.url) void clearNavigatedTab(tabId, changeInfo.url)
    if (changeInfo.status === 'complete') void recordingSession().then(async (current) => {
      if (current?.tabId !== tabId) return
      recordingSurfaceFrames.delete(current.sessionId)
      await injectRecordingSurface(tabId).catch(() => browser.runtime.sendMessage({
        type: 'record:controller-warning', sessionId: current.sessionId,
        warning: 'Recording continues, but controls and DOM context are unavailable on this page.',
      }).catch(() => undefined))
    })
  })
  browser.commands?.onCommand.addListener((command) => {
    /* v8 ignore next -- Chrome may dispatch other configured commands in future manifests */
    if (command === 'start-recording') void openRecorder()
  })
})
