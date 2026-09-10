import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { createExtensionSupabase, handleAuthMessage, isAuthMessage } from '../lib/auth'
import { relayFrameMessage } from '../lib/frame-channel'

type MessageResponse = { ok: true; data?: unknown } | { ok: false; error: string }
const activeTabKey = (tabId: number) => `crrt:active-tab:${tabId}`
type ActiveTabState = { origin: string }

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

async function currentWebTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  const origin = webOrigin(tab?.url)
  if (typeof tab?.id !== 'number' || !origin) throw new Error('Open a regular web page to start commenting')
  return { id: tab.id, origin }
}

export async function isTabActive(tabId: number, pageUrl?: string) {
  const key = activeTabKey(tabId)
  const stored = await browser.storage.session.get(key)
  const value = stored[key]
  const origin = webOrigin(pageUrl)
  const active = Boolean(
    value
    && typeof value === 'object'
    && typeof (value as Partial<ActiveTabState>).origin === 'string'
    && origin
    && (value as ActiveTabState).origin === origin,
  )
  if (!active && value !== undefined) await browser.storage.session.remove(key)
  return active
}

export async function activateCurrentTab(): Promise<void> {
  const tab = await currentWebTab()
  const key = activeTabKey(tab.id)
  await browser.storage.session.set({ [key]: { origin: tab.origin } satisfies ActiveTabState })
  try {
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['comment.js'] })
  } catch (error) {
    await browser.storage.session.remove(key)
    throw error
  }
}

export default defineBackground(() => {
  const client = createExtensionSupabase()
  async function handleMessage(message: unknown, sender: unknown): Promise<MessageResponse | undefined> {
    try {
      if ((message as { type?: string } | null)?.type === 'private:relay') return { ok: true, data: await relayFrameMessage(message, sender) }
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
        return { ok: true, data: typeof tab?.id === 'number' && await isTabActive(tab.id, pageUrl) }
      }
      if ((message as { type?: unknown } | null)?.type === 'comment:deactivate') {
        const tab = senderTab(sender)
        if (typeof tab?.id !== 'number') throw new Error('Tab activation unavailable')
        await browser.storage.session.remove(activeTabKey(tab.id))
        return { ok: true }
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
    void browser.storage.session.remove(activeTabKey(tabId))
  })
})
