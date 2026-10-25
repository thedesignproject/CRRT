import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  listeners: new Set<(message: unknown) => unknown>(),
  getUserMedia: vi.fn(),
  play: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('wxt/browser', () => ({ browser: { runtime: {
  sendMessage: mocks.sendMessage,
  onMessage: { addListener: (listener: any) => mocks.listeners.add(listener), removeListener: (listener: any) => mocks.listeners.delete(listener) },
} } }))

const snapshot = (changes: Record<string, unknown> = {}) => ({
  status: 'countdown', source: 'tab', cameraEnabled: true, microphoneEnabled: true,
  countdown: 3, durationMs: 0, tool: 'pointer', marks: [], error: null, ...changes,
})

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mocks.listeners.clear(); vi.useFakeTimers({ shouldAdvanceTime: true })
  history.replaceState(null, '', '/record-controls.html?session=s')
  document.body.innerHTML = '<div id="root"></div>'
  mocks.sendMessage.mockImplementation(async (message: { type: string }) => ({ ok: true, ...(message.type === 'record:surface-ready' ? { data: snapshot() } : {}) }))
  const track = { stop: vi.fn() }
  mocks.getUserMedia.mockResolvedValue({ getTracks: () => [track] })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: mocks.getUserMedia } })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: mocks.play })
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, writable: true, value: null })
  Object.defineProperty(SVGElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(window, 'prompt', { configurable: true, value: vi.fn(() => 'Make this clearer') })
})

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = '' })

it('renders the live tab surface and emits structured recording commands', async () => {
  const module = await import('./main')
  expect(module.surfacePoint({ clientX: 50, clientY: 25, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 50 }) } as SVGSVGElement })).toEqual({ x: 50, y: 50 })
  expect(await screen.findByText('Get ready')).toBeInTheDocument()
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, durationMs: 4_200 }) })
  })
  expect(screen.getByText('“Show the part you want to change.”')).toBeInTheDocument()
  expect(mocks.getUserMedia).toHaveBeenCalledWith({ video: true, audio: false })
  fireEvent.mouseMove(document, { clientX: 12, clientY: 24 })
  expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'record:surface-pointer', sessionId: 's', x: 12, y: 24 })

  fireEvent.click(screen.getByRole('button', { name: 'Draw' }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'tool.changed', tool: 'draw' } })))
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', tool: 'draw', durationMs: 4_200 }) })
  })
  const overlay = document.querySelector('.annotation-layer') as SVGSVGElement
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 500 } as DOMRect)
  fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 300, clientY: 200 })
  fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 300, clientY: 200 })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ kind: 'mark.added', mark: expect.objectContaining({ type: 'draw' }) }) })))

  fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'pause.toggle' } }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'restart' } }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'finish' } }))
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:surface-layout', sessionId: 's' }))
})

it('renders paused state, warnings, existing marks, and editing actions', async () => {
  await import('./main')
  await screen.findByText('Get ready')
  const mark = { id: 'pin', type: 'pin', atMs: 1_000, points: [{ x: 20, y: 30 }], pinNumber: 1 }
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'paused', countdown: 0, marks: [mark], warning: 'Limited navigation', cameraEnabled: false }) })
  })
  expect(screen.getByText('Paused')).toBeInTheDocument()
  expect(screen.getByText('Limited navigation')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'mark.undone' } }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'marks.cleared' } }))
})
