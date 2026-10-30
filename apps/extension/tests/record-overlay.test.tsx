import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listeners: new Set<(message: unknown) => unknown>(),
  sendMessage: vi.fn(),
}))

vi.mock('wxt/browser', () => ({ browser: { runtime: {
  sendMessage: mocks.sendMessage,
  onMessage: {
    addListener: (listener: (message: unknown) => unknown) => mocks.listeners.add(listener),
    removeListener: (listener: (message: unknown) => unknown) => mocks.listeners.delete(listener),
  },
} } }))
vi.mock('wxt/utils/define-unlisted-script', () => ({ defineUnlistedScript: (main: unknown) => main }))
vi.mock('../entrypoints/record-controls/main', () => ({ RecordControls: ({ id }: { id: string }) => <div>{id}</div> }))

import recordOverlayMain, { mountActiveRecording, mountRecordingSurface } from '../entrypoints/record-overlay'

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>'
  mocks.listeners.clear(); mocks.sendMessage.mockReset()
})

it('mounts, replaces, and removes the tab-native recording surface', () => {
  const first = mountRecordingSurface('first')
  expect(first.dataset.crrtRecording).toBe('true')
  expect(first.style.zIndex).toBe('2147483647')
  expect(mountRecordingSurface('first')).toBe(first)
  const second = mountRecordingSurface('second')
  expect(first.isConnected).toBe(false)
  for (const listener of mocks.listeners) listener({ type: 'other', sessionId: 'second' })
  expect(second.isConnected).toBe(true)
  for (const listener of mocks.listeners) listener({ type: 'record:overlay-remove', sessionId: 'second' })
  expect(second.isConnected).toBe(false)
  expect(mocks.listeners.size).toBe(0)
})

it('mounts the active background session and ignores absent or inaccessible sessions', async () => {
  mocks.sendMessage.mockResolvedValueOnce({ ok: true, data: { sessionId: 'active' } })
  await mountActiveRecording()
  expect(document.querySelector('[data-session-id="active"]')).toBeTruthy()
  mocks.sendMessage.mockResolvedValueOnce({ ok: true })
  await expect(mountActiveRecording()).resolves.toBeUndefined()
  mocks.sendMessage.mockRejectedValueOnce(new Error('restricted'))
  await expect(mountActiveRecording()).resolves.toBeUndefined()
  for (const listener of mocks.listeners) listener({ type: 'record:overlay-remove', sessionId: 'active' })
})

it('runs the WXT entrypoint', async () => {
  mocks.sendMessage.mockResolvedValueOnce({ ok: true })
  ;(recordOverlayMain as unknown as () => void)()
  await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'record:surface-mount' }))
})
