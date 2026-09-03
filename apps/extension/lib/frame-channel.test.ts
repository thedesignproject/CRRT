import { beforeEach, expect, it, vi } from 'vitest'
const browser = vi.hoisted(() => ({ runtime: { id: 'ours', getURL: (path: string) => `chrome-extension://ours${path}`,
  sendMessage: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } }, tabs: { sendMessage: vi.fn() } }))
vi.mock('wxt/browser', () => ({ browser }))
import { receiveFrameMessages, relayFrameMessage, sendFrameMessage } from './frame-channel'
beforeEach(() => vi.clearAllMocks())
it('relays only internal messages between a tab and its extension frame', async () => {
  browser.tabs.sendMessage.mockResolvedValue({ ok: true, data: 'result' })
  const parent = { id: 'ours', tab: { id: 7 }, frameId: 0 }
  const frame = { ...parent, frameId: 3, url: 'chrome-extension://ours/private.html' }
  await expect(relayFrameMessage({ to: 3, payload: 'geometry' }, parent)).resolves.toBe('result')
  expect(browser.tabs.sendMessage).toHaveBeenLastCalledWith(7, { type: 'private:deliver', from: 0, payload: 'geometry' }, { frameId: 3 })
  await expect(relayFrameMessage({ to: 0, payload: 'capture' }, frame)).resolves.toBe('result')
  for (const sender of [{ ...parent, id: 'external' }, { ...parent, tab: undefined }, { ...parent, tab: { id: 0 } }])
    await expect(relayFrameMessage({ to: 3 }, sender)).rejects.toThrow('Invalid frame sender')
  for (const to of [undefined, 0, -1]) await expect(relayFrameMessage({ to }, parent)).rejects.toThrow('destination')
  await expect(relayFrameMessage({ to: 2 }, frame)).rejects.toThrow('Invalid private frame')
  await expect(relayFrameMessage({ to: 0 }, { ...frame, url: 'https://site.test' })).rejects.toThrow('Invalid private frame')
  for (const response of [undefined, { ok: false, error: 'detached' }]) {
    browser.tabs.sendMessage.mockResolvedValueOnce(response)
    await expect(relayFrameMessage({ to: 3 }, parent)).rejects.toThrow(response?.error ?? 'unavailable')
  }
})
it('wraps requests and rejects failed delivery', async () => {
  browser.runtime.sendMessage.mockResolvedValueOnce({ ok: true, data: 4 })
  await expect(sendFrameMessage(0, 'ready')).resolves.toBe(4)
  expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'private:relay', to: 0, payload: 'ready' })
  for (const response of [undefined, { ok: false, error: 'closed' }]) {
    browser.runtime.sendMessage.mockResolvedValueOnce(response)
    await expect(sendFrameMessage(0, 'ready')).rejects.toThrow(response?.error ?? 'disconnected')
  }
})
it('uses Chrome callback responses and ignores unrelated or foreign messages', async () => {
  const handle = vi.fn().mockResolvedValueOnce('answer').mockRejectedValueOnce(new Error('bad request'))
  const stop = receiveFrameMessages(handle), listener = browser.runtime.onMessage.addListener.mock.calls[0][0]
  const reply = vi.fn()
  expect(listener({}, { id: 'external' }, reply)).toBe(false)
  expect(listener(null, { id: 'ours' }, reply)).toBe(false)
  expect(listener({ type: 'other' }, { id: 'ours' }, reply)).toBe(false)
  for (const expected of [{ ok: true, data: 'answer' }, { ok: false, error: 'bad request' }]) {
    expect(listener({ type: 'private:deliver', payload: 'request', from: 0 }, { id: 'ours' }, reply)).toBe(true)
    await vi.waitFor(() => expect(reply).toHaveBeenLastCalledWith(expected))
  }
  expect(handle).toHaveBeenCalledWith('request', 0)
  stop(); expect(browser.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener)
})
