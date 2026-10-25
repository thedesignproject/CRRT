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
  const track = { stop: vi.fn() }
  mocks.getUserMedia.mockResolvedValue({ getTracks: () => [track] })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: mocks.getUserMedia } })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: mocks.play })
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, writable: true, value: null })
  Object.defineProperty(SVGElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(window, 'prompt', { configurable: true, value: vi.fn(() => 'Make this clearer') })
  Object.defineProperty(window, 'confirm', { configurable: true, value: vi.fn(() => true) })
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined })
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })
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
  fireEvent.click(screen.getByRole('button', { name: /Camera Off/ }))
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
  expect(screen.getByText('Live transcript unavailable in this browser')).toBeInTheDocument()
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

it('streams real Chrome speech segments on the recording clock', async () => {
  let recognition: {
    continuous: boolean; interimResults: boolean; lang: string
    onresult: ((event: any) => void) | null; onend: (() => void) | null; onerror: (() => void) | null
    start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>
  } | undefined
  class Recognition {
    continuous = false; interimResults = false; lang = ''
    onresult: ((event: any) => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null
    start = vi.fn(); stop = vi.fn()
    constructor() { recognition = this }
  }
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: Recognition })
  const module = await import('./main')
  const view = render(<module.RecordControls />)
  await screen.findByText('Get ready')
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, durationMs: 4_200 }) })
  })
  expect(recognition?.start).toHaveBeenCalled()
  await act(async () => {
    recognition?.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'Este botón' } }] })
  })
  expect(screen.getByText('Este botón')).toBeInTheDocument()
  await act(async () => {
    recognition?.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Este botón no se lee bien' } }] })
  })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    command: expect.objectContaining({ kind: 'transcript.segment-added', segment: expect.objectContaining({ text: 'Este botón no se lee bien', endMs: 4_200 }) }),
  })))
  await act(async () => { recognition?.onerror?.() })
  expect(screen.getByText('Live transcript unavailable')).toBeInTheDocument()
  recognition?.start.mockImplementationOnce(() => { throw new Error('restart rejected') })
  await act(async () => { recognition?.onend?.() })
  expect(screen.getByText('Listening…')).toBeInTheDocument()
  const ended = recognition?.onend
  view.unmount()
  expect(recognition?.stop).toHaveBeenCalled()
  ended?.()
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
  const mark = { id: 'pin', type: 'pin', atMs: 1_000, points: [{ x: 20, y: 30 }], pinNumber: 1 }
  await act(async () => {
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'paused', countdown: 0, marks: [mark], warning: 'Limited navigation', cameraEnabled: false }) })
  })
  expect(screen.getByText('Paused')).toBeInTheDocument()
  expect(screen.getByText('Limited navigation')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'pause.toggle' } })))
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'mark.undone' } })))
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'mark.undone' } }))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: { kind: 'marks.cleared' } }))
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
    for (const listener of mocks.listeners) listener({ type: 'record:surface-state', sessionId: 's', snapshot: snapshot({ status: 'recording', countdown: 0, tool: 'text', marks }) })
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
