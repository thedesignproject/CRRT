import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { createExtensionSupabase, handleAuthMessage, isAuthMessage } from '../lib/auth'

type MessageResponse = { ok: true; data?: unknown } | { ok: false; error: string }

export async function activateCurrentTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !/^https?:/.test(tab.url ?? '')) throw new Error('Open a regular web page to start commenting')
  await browser.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['comment.js'],
  })
}

export default defineBackground(() => {
  const client = createExtensionSupabase()
  async function handleMessage(message: unknown, sender: unknown): Promise<MessageResponse | undefined> {
    try {
      if (isAuthMessage(message)) return { ok: true, data: await handleAuthMessage(client, message) }
      if ((message as { type?: unknown } | null)?.type === 'auth:open-popup') {
        await browser.action.openPopup()
        return { ok: true }
      }
      if ((message as { type?: unknown } | null)?.type === 'comment:activate') {
        await activateCurrentTab()
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
})
