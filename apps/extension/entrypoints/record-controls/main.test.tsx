import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const track = { enabled: true, stop: vi.fn() }
  mocks.getUserMedia.mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: mocks.getUserMedia } })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: mocks.play })
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, writable: true, value: null })
  Object.defineProperty(SVGElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(window, 'prompt', { configurable: true, value: vi.fn(() => 'Make this clearer') })
  Object.defineProperty(window, 'confirm', { configurable: true, value: vi.fn(() => true) })
})

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = '' })

it('keeps setup in the page and starts with one click', async () => {
  mocks.sendMessage.mockImplementation(async (message: { type: string }) => ({ ok: true, ...(message.type === 'record:surface-ready' ? { data: snapshot({ status: 'setup' }) } : {}) }))
  const module = await import('./main')
  render(<module.RecordControls />)
  expect(await screen.findByLabelText('CRRT Record setup')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Window/ }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'source.changed', source: 'window' } })))
  const start = screen.getByRole('button', { name: /Start recording/ })
  await waitFor(() => expect(start).not.toBeDisabled())
  fireEvent.click(start)
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'start' } })))
  expect(mocks.sendMessage.mock.calls.filter(([message]) => message.command?.kind === 'start')).toHaveLength(1)
})

it('shows setup failures and lets the user change devices or close the launcher', async () => {
  mocks.sendMessage.mockImplementation(async (message: { type: string }) => ({ ok: true, ...(message.type === 'record:surface-ready' ? { data: snapshot({ status: 'failed', error: 'Permission denied', cameraEnabled: false, microphoneEnabled: false }) } : {}) }))
  const module = await import('./main')
  render(<module.RecordControls />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  fireEvent.click(screen.getByRole('button', { name: /No camera OFF/ }))
  fireEvent.click(screen.getByRole('button', { name: /Microphone Off/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Close recorder' }))
  await waitFor(() => {
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'camera.toggled' } }))
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'microphone.toggled' } }))
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'cancel' } }))
  })
})

it('renders the live tab surface and emits structured recording commands', async () => {
  const module = await import('./main')
  render(<module.RecordControls />)
  expect(module.surfacePoint({ clientX: 50, clientY: 25, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 50 }) } as SVGSVGElement })).toEqual({ x: 50, y: 50 })
  expect(await screen.findByText('Get ready')).toBeInTheDocument()
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, durationMs: 4_200 }) })
  })
  expect(screen.getByText('Voice recording')).toBeInTheDocument()
  expect(screen.getByText('Transcribed after Done')).toBeInTheDocument()
  expect(mocks.getUserMedia).toHaveBeenCalledWith({ video: true, audio: false })
  fireEvent.click(screen.getByRole('button', { name: 'Draw' }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'tool.changed', tool: 'draw' } })))
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', tool: 'draw', durationMs: 4_200 }) })
  })
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'tool.changed', tool: 'pointer' } })))
  const overlay = document.querySelector('.annotation-layer') as SVGSVGElement
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 500 } as DOMRect)
  fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 300, clientY: 200 })
  fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 300, clientY: 200 })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ kind: 'mark.added', mark: expect.objectContaining({ type: 'draw' }) }) })))

  fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'pause.toggle' } }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'restart' } }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'finish' } }))
})

it('keeps recording controls available when camera preview permission is rejected', async () => {
  mocks.getUserMedia.mockRejectedValueOnce(new Error('camera denied'))
  const module = await import('./main')
  render(<module.RecordControls />)
  expect(await screen.findByText('Get ready')).toBeInTheDocument()
  await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalled())
})

it('renders paused state, warnings, existing marks, and editing actions', async () => {
  const module = await import('./main')
  render(<module.RecordControls />)
  await screen.findByText('Get ready')
  const mark = { id: 'pin', type: 'pin', atMs: 0, points: [{ x: 20, y: 30 }], pinNumber: 1 }
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'paused', countdown: 0, marks: [mark], warning: 'Limited navigation', cameraEnabled: false }) })
  })
  expect(screen.getByText('Paused')).toBeInTheDocument()
  expect(screen.getByText('Limited navigation')).toBeInTheDocument()
  expect(document.querySelector('.annotation-layer circle')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'pause.toggle' } })))
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'mark.undone' } })))
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'mark.undone' } }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'marks.cleared' } }))
})

it('keeps a recording when discard or restart confirmation is declined', async () => {
  Object.defineProperty(window, 'confirm', { configurable: true, value: vi.fn(() => false) })
  const module = await import('./main')
  render(<module.RecordControls />)
  await screen.findByText('Get ready')
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0 }) })
  })

  fireEvent.click(screen.getByRole('button', { name: 'Discard recording' }))
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }))

  expect(mocks.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'cancel' } }))
  expect(mocks.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'restart' } }))
})

it('renders all mark types, creates text notes, and confirms discard', async () => {
  const module = await import('./main')
  render(<module.RecordControls />)
  await screen.findByText('Get ready')
  const marks = [
    { id: 'arrow', type: 'arrow', atMs: 1, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
    { id: 'box', type: 'box', atMs: 1, points: [{ x: 5, y: 6 }, { x: 7, y: 8 }] },
    { id: 'text', type: 'text', atMs: 1, points: [{ x: 9, y: 10 }], text: 'Fix this' },
  ]
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, durationMs: 1, tool: 'text', marks }) })
  })
  expect(screen.getByText('Fix this')).toBeInTheDocument()
  const overlay = document.querySelector('.annotation-layer') as SVGSVGElement
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect)
  fireEvent.pointerDown(overlay, { pointerId: 2, clientX: 20, clientY: 30 })
  fireEvent.pointerUp(overlay, { pointerId: 2, clientX: 20, clientY: 30 })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    command: expect.objectContaining({ kind: 'mark.added', mark: expect.objectContaining({ type: 'text', text: 'Make this clearer' }) }),
  })))
  fireEvent.click(screen.getByRole('button', { name: 'Discard recording' }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'cancel' } })))
})

it('fades completed marks and lets the user resize, hide, and restore the camera preview', async () => {
  const module = await import('./main')
  render(<module.RecordControls />)
  await screen.findByText('Get ready')
  const mark = { id: 'draw', type: 'draw', atMs: 1_000, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, durationMs: 1_000, marks: [mark] }) })
  })
  expect(document.querySelector('.annotation-layer polyline')).toHaveAttribute('opacity', '1')
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, durationMs: 3_875, marks: [mark] }) })
  })
  expect(document.querySelector('.annotation-layer polyline')).toHaveAttribute('opacity', '0.5')
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, durationMs: 4_000, marks: [mark] }) })
  })
  expect(document.querySelector('.annotation-layer polyline')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Large camera' }))
  expect(document.querySelector('.recording-camera')).toHaveClass('camera-size-large')
  await waitFor(() => expect((document.querySelector('.recording-camera video') as HTMLVideoElement).srcObject).not.toBeNull())
  const cameraTrack = ((document.querySelector('.recording-camera video') as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0]!
  fireEvent.click(screen.getByRole('button', { name: 'Close camera' }))
  expect(cameraTrack.enabled).toBe(false)
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, durationMs: 4_000, marks: [mark], cameraEnabled: false }) })
  })
  expect(screen.queryByRole('button', { name: 'Camera preview settings' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }))
  expect(cameraTrack.enabled).toBe(true)
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, durationMs: 4_000, marks: [mark], cameraEnabled: true }) })
  })
  expect(screen.getByRole('button', { name: 'Camera preview settings' })).toBeInTheDocument()
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'camera.toggled' } }))
})

it('shows command errors in setup and while recording', async () => {
  mocks.sendMessage.mockImplementation(async (message: { type: string }) => ({ ok: true, ...(message.type === 'record:surface-ready' ? { data: snapshot({ status: 'setup' }) } : {}) }))
  const module = await import('./main')
  render(<module.RecordControls />)
  await screen.findByLabelText('CRRT Record setup')
  mocks.sendMessage.mockResolvedValueOnce({ ok: false, error: 'Invalid recording command' })
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid recording command')
  await act(async () => { for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording' }) }) })
  mocks.sendMessage.mockRejectedValueOnce('worker disconnected')
  fireEvent.click(screen.getByRole('button', { name: 'Draw' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Reopen the recorder to reconnect')
})
