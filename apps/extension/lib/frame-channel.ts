import { browser } from 'wxt/browser'

export async function sendFrameMessage<T = unknown>(to: number, payload: unknown): Promise<T> {
  const response = await browser.runtime.sendMessage({ type: 'private:relay', to, payload })
  if (!response?.ok) throw new Error(response?.error || 'CRRT frame disconnected; reload this page')
  return response.data as T
}

export function receiveFrameMessages(handle: (payload: any, from: number) => unknown) {
  const listener = (message: any, sender: any, respond: (value: unknown) => void) => {
    if (sender.id !== browser.runtime.id || message?.type !== 'private:deliver') return false
    Promise.resolve().then(() => handle(message.payload, message.from)).then(
      (data) => respond({ ok: true, data }),
      (error) => respond({ ok: false, error: String(error.message) }),
    )
    return true
  }
  browser.runtime.onMessage.addListener(listener)
  return () => browser.runtime.onMessage.removeListener(listener)
}

// Called only by the service worker. Web pages cannot use this internal channel.
export async function relayFrameMessage(message: any, sender: any) {
  if (sender.id !== browser.runtime.id || !sender.tab?.id) throw new Error('Invalid frame sender')
  const from = sender.frameId
  if (from === 0) {
    if (!Number.isInteger(message.to) || message.to < 1) throw new Error('Invalid frame destination')
  } else if (message.to !== 0 || sender.url !== browser.runtime.getURL('/private.html')) {
    throw new Error('Invalid private frame')
  }
  const response = await browser.tabs.sendMessage(sender.tab.id, {
    type: 'private:deliver', from, payload: message.payload,
  }, { frameId: message.to })
  if (!response?.ok) throw new Error(response?.error || 'CRRT frame unavailable')
  return response.data
}
