import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { createExtensionSupabase, handleAuthMessage, isAuthMessage } from '../lib/auth'
import { relayFrameMessage } from '../lib/frame-channel'
import { startHostedSignIn, type HostedAuthMessage } from '../lib/hosted-auth'

type MessageResponse = { ok: true; data?: unknown } | { ok: false; error: string }
const activeTabKey = (tabId: number) => `crrt:active-tab:${tabId}`
type ActiveTabState = { origin: string; activationId: string; attemptId: string }
const tabOperationTails = new Map<number, Promise<void>>()

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

export async function tabActivation(tabId: number, pageUrl?: string): Promise<ActiveTabState | null> {
  return withTabOperation(tabId, async () => {
    const key = activeTabKey(tabId)
    const stored = await browser.storage.session.get(key)
    const value = stored[key]
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
  const client = createExtensionSupabase()
  async function handleMessage(message: unknown, sender: unknown): Promise<MessageResponse | undefined> {
    try {
      if ((message as { type?: string } | null)?.type === 'private:relay') return { ok: true, data: await relayFrameMessage(message, sender) }
      if ((message as { type?: string } | null)?.type === 'auth:hosted-sign-in') {
        return { ok: true, data: await startHostedSignIn(client, (message as HostedAuthMessage).intent) }
      }
      if (isAuthMessage(message)) return { ok: true, data: await handleAuthMessage(client, message) }
      if ((message as { type?: unknown } | null)?.type === 'auth:open-popup') {
        await browser.action.openPopup()
        return { ok: true }
      }
      if ((message as { type?: unknown } | null)?.type === 'comment:activate') {
        await activateCurrentTab()
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
    void withTabOperation(tabId, () => browser.storage.session.remove(activeTabKey(tabId)))
  })
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) void clearNavigatedTab(tabId, changeInfo.url)
  })
})
