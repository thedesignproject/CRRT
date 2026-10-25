import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RecordingCapture } from '../../lib/recording-capture'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  startCapture: vi.fn(),
  getRecording: vi.fn(),
  saveRecording: vi.fn(),
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  requestPermission: vi.fn(),
  withTranscript: vi.fn(),
  extensionSession: vi.fn(),
  listeners: new Set<(message: unknown) => unknown>(),
}))

vi.mock('wxt/browser', () => ({ browser: { runtime: {
  sendMessage: mocks.sendMessage,
  getURL: (path: string) => `chrome-extension://test${path}`,
  onMessage: { addListener: (listener: any) => mocks.listeners.add(listener), removeListener: (listener: any) => mocks.listeners.delete(listener) },
}, permissions: { request: mocks.requestPermission }, tabs: { update: vi.fn() } } }))
vi.mock('../../lib/recording-capture', () => ({ startRecordingCapture: mocks.startCapture }))
vi.mock('../../lib/recording-store', () => ({
  getLocalRecording: mocks.getRecording,
  saveLocalRecording: mocks.saveRecording,
}))
vi.mock('../../lib/recording-transcription', () => ({ withRecordingTranscript: mocks.withTranscript }))
vi.mock('../../lib/comments-api', () => ({ extensionSession: mocks.extensionSession }))

function mediaStream() {
  const track = { addEventListener: vi.fn(), stop: vi.fn(), kind: 'video' }
  return { getVideoTracks: () => [track], getAudioTracks: () => [], getTracks: () => [track] }
}

function capture(): RecordingCapture {
  return {
    screenStream: mediaStream() as unknown as MediaStream, cameraStream: mediaStream() as unknown as MediaStream, previewStream: mediaStream() as unknown as MediaStream,
    pause: vi.fn(), resume: vi.fn(), stop: vi.fn().mockResolvedValue({ screenBlob: new Blob(['screen']), cameraBlob: new Blob(['camera']), audioBlob: new Blob(['audio']) }),
  }
}

async function load(search = '?tabId=7&pageUrl=https%3A%2F%2Facme.test%2Fcheckout&pageTitle=Acme+checkout') {
  history.replaceState(null, '', `/record.html${search}`)
  document.body.innerHTML = '<div id="root"></div>'
  const module = await import('./main')
  await screen.findByRole('heading', { name: /Show it once/ })
  return module
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.listeners.clear()
  mocks.requestPermission.mockResolvedValue(true)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.sendMessage.mockImplementation(async (message: { type: string }) => message.type === 'record:tab-stream'
    ? { ok: true, data: 'stream-7' }
    : message.type === 'record:resolve-target'
      ? { ok: true, data: { selector: 'button.pay', pageUrl: 'https://acme.test/checkout', tagName: 'button' } }
      : { ok: true })
  mocks.startCapture.mockResolvedValue(capture())
  mocks.getRecording.mockResolvedValue(undefined)
  mocks.saveRecording.mockResolvedValue('saved')
  mocks.withTranscript.mockImplementation(async (recording) => ({
    ...recording, status: 'ready', transcriptionStatus: 'ready',
    transcript: [{ id: 'speech', startMs: 1_000, endMs: 2_500, text: 'This is the actual narration.' }],
  }))
  mocks.extensionSession.mockResolvedValue({ accessToken: 'token', email: 'u@example.com' })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: mocks.play })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: mocks.pause })
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, writable: true, value: null })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:recording') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  Object.defineProperty(SVGElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(window, 'prompt', { configurable: true, value: vi.fn(() => 'Needs more contrast') })
})

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = '' })

it('records, annotates, pauses, finishes, and exposes human and agent review', async () => {
  const helpers = await load()
  expect(helpers.sourceLabel('window')).toBe('Window')
  expect(helpers.sourceLabel('screen')).toBe('Entire screen')
  expect(helpers.sourceLabel('tab')).toBe('This tab')
  expect(helpers.canResolveDomTarget('tab', 7)).toBe(true)
  expect(helpers.canResolveDomTarget('window', 7)).toBe(false)
  expect(helpers.canResolveDomTarget('tab', null)).toBe(false)
  mocks.sendMessage.mockResolvedValueOnce({ ok: false, error: 'Background offline' })
  await expect(helpers.send({ type: 'test' })).rejects.toThrow('Background offline')
  mocks.sendMessage.mockResolvedValueOnce({ ok: false })
  await expect(helpers.send({ type: 'test' })).rejects.toThrow('CRRT Record is unavailable')
  helpers.revokeRecordingUrls('', '')
  helpers.revokeRecordingUrls('blob:screen', 'blob:camera')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:screen')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:camera')
  expect(helpers.recordingTitle([], undefined)).toBe('Untitled recording')
  expect(helpers.recordingTitle([], 'Checkout')).toBe('Checkout')
  expect(helpers.recordingTitle([{ id: 'note', type: 'text', atMs: 0, points: [], text: 'Title note' }], 'Checkout')).toBe('Title note')
  const legacyRecording = {
    id: 'legacy', title: 'Legacy', source: 'tab' as const, status: 'ready' as const, durationMs: 1_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', marks: [], transcript: [],
  }
  expect(helpers.normalizeStoredRecording(legacyRecording).transcriptionStatus).toBe('failed')
  expect(helpers.normalizeStoredRecording({ ...legacyRecording, transcript: [{ id: 'line', startMs: 0, endMs: 500, text: 'Hello' }] }).transcriptionStatus).toBe('ready')
  const currentRecording = { ...legacyRecording, transcriptionStatus: 'processing' as const }
  expect(helpers.normalizeStoredRecording(currentRecording)).toStrictEqual(currentRecording)
  expect(helpers.normalizeStoredRecording({
    ...legacyRecording,
    transcriptionStatus: 'failed',
    transcriptionError: 'Sign in to CRRT to transcribe this recording.',
  })).toMatchObject({ transcriptionError: 'Transcript is ready to retry.', transcriptionErrorCode: 'request-failed' })
  expect(helpers.normalizeStoredRecording({
    ...legacyRecording,
    transcriptionError: 'Sign in to CRRT to transcribe this recording.',
  })).toMatchObject({ transcriptionStatus: 'failed', transcriptionError: 'Transcript is ready to retry.', transcriptionErrorCode: 'request-failed' })
  const drawImage = vi.fn()
  expect(helpers.captureThumbnail(null)).toBeUndefined()
  expect(helpers.captureThumbnail({ videoWidth: 10, videoHeight: 0 } as HTMLVideoElement)).toBeUndefined()
  const originalCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => tag === 'canvas'
    ? { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL: () => 'data:image/jpeg;base64,eA==' }
    : originalCreate(tag)) as typeof document.createElement)
  expect(helpers.captureThumbnail({ videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement)).toContain('data:image/jpeg')
  expect(drawImage).toHaveBeenCalled()
  vi.mocked(document.createElement).mockRestore()
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => tag === 'canvas'
    ? { width: 0, height: 0, getContext: () => null, toDataURL: () => { throw new Error('tainted') } }
    : originalCreate(tag)) as typeof document.createElement)
  expect(helpers.captureThumbnail({ videoWidth: 10, videoHeight: 10 } as HTMLVideoElement)).toBeUndefined()
  vi.mocked(document.createElement).mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Camera' }))
  fireEvent.click(screen.getByRole('button', { name: 'Microphone' }))
  fireEvent.click(screen.getByRole('button', { name: 'Camera' }))
  fireEvent.click(screen.getByRole('button', { name: 'Microphone' }))
  fireEvent.click(screen.getByRole('radio', { name: /Window/ }))
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalled())
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  expect(screen.getByText(/Transcribed after Done/)).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(4_200) })
  expect(screen.getByText(/Voice recording/)).toBeInTheDocument()

  const overlay = document.querySelector('.record-overlay') as SVGSVGElement
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 600 } as DOMRect)
  fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 50, clientY: 50 })
  fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 50, clientY: 50 })
  fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 50, clientY: 50 })
  for (const tool of ['Draw', 'Arrow', 'Box', 'Text', 'Pin']) {
    fireEvent.click(screen.getByRole('button', { name: tool }))
    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 300, clientY: 240 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 300, clientY: 240 })
    await act(async () => {})
  }
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Text' }))
  vi.mocked(window.prompt).mockReturnValueOnce(null)
  fireEvent.pointerDown(overlay, { pointerId: 2, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(overlay, { pointerId: 2, clientX: 300, clientY: 240 })
  expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
  fireEvent.pointerDown(overlay, { pointerId: 2, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(overlay, { pointerId: 2, clientX: 300, clientY: 240 })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Clear' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
  expect(screen.getByText('Recording paused')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))

  await screen.findByText('Capture ready')
  expect(screen.getByText('This is the actual narration.')).toBeInTheDocument()
  expect(mocks.saveRecording).toHaveBeenCalled()
  expect(mocks.saveRecording.mock.calls[0]?.[0]).toMatchObject({ title: 'Needs more contrast' })
  const videos = document.querySelectorAll('video')
  Object.defineProperty(videos[0], 'currentTime', { configurable: true, writable: true, value: 2 })
  Object.defineProperty(videos[1], 'currentTime', { configurable: true, writable: true, value: 0 })
  fireEvent.timeUpdate(videos[0])
  expect(videos[1].currentTime).toBe(2)
  fireEvent.play(videos[0]); fireEvent.pause(videos[0])
  fireEvent.click(screen.getByRole('button', { name: 'For agents' }))
  expect(await screen.findByText('Ready for Claude Code')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Copy for Claude Code/ }))
  fireEvent.click(screen.getByRole('button', { name: /Copy link/ }))
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2))
})

it('moves tab recording controls to the injected surface and accepts its commands', async () => {
  await load()
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:session-create' })))
  const create = mocks.sendMessage.mock.calls.find(([message]) => message.type === 'record:session-create')?.[0]
  expect(create.snapshot).toMatchObject({ status: 'countdown', source: 'tab' })
  expect(await screen.findByRole('heading', { name: 'Controls are on the page.' })).toBeInTheDocument()
  const earlyDeliver = async (command: unknown) => {
    await act(async () => { for (const listener of mocks.listeners) listener({ type: 'record:controller-command', sessionId: create.sessionId, command }) })
  }
  await earlyDeliver({ kind: 'pause.toggle' })
  await earlyDeliver({ kind: 'finish' })
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  const deliver = async (command: unknown) => {
    await act(async () => { for (const listener of mocks.listeners) listener({ type: 'record:controller-command', sessionId: create.sessionId, command }) })
  }
  await act(async () => { for (const listener of mocks.listeners) listener({ type: 'record:controller-command', sessionId: 'other', command: { kind: 'finish' } }) })
  await act(async () => { for (const listener of mocks.listeners) listener({ type: 'unrelated', sessionId: create.sessionId }) })
  await act(async () => { for (const listener of mocks.listeners) listener({ type: 'record:controller-command', sessionId: create.sessionId, command: { kind: 'future.command' } }) })
  await deliver({ kind: 'pause.toggle' })
  await deliver({ kind: 'tool.changed', tool: 'box' })
  await deliver({ kind: 'mark.added', mark: { id: 'empty', type: 'box', atMs: 900, points: [] } })
  await deliver({ kind: 'mark.added', mark: { id: 'box', type: 'box', atMs: 1_000, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] } })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:resolve-target' })))
  await act(async () => { for (const listener of mocks.listeners) listener({ type: 'record:controller-warning', sessionId: create.sessionId, warning: 'Limited navigation' }) })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:session-sync', snapshot: expect.objectContaining({ warning: 'Limited navigation' }) })))
  const implementation = mocks.sendMessage.getMockImplementation()!
  mocks.sendMessage.mockImplementation(async (message: { type: string }) => message.type === 'record:resolve-target'
    ? Promise.reject(new Error('target unavailable'))
    : implementation(message))
  await deliver({ kind: 'mark.added', mark: { id: 'draw', type: 'draw', atMs: 1_200, points: [{ x: 5, y: 6 }] } })
  await act(async () => {})
  await deliver({ kind: 'pause.toggle' })
  await deliver({ kind: 'pause.toggle' })
  await deliver({ kind: 'mark.undone' })
  await deliver({ kind: 'marks.cleared' })
  await deliver({ kind: 'finish' })
  expect(await screen.findByText('Capture ready')).toBeInTheDocument()
  expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'record:session-stop', sessionId: create.sessionId })
})

it('restarts an active recording and handles a share ending during countdown', async () => {
  await load()
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalledOnce())
  await screen.findByRole('heading', { name: 'Controls are on the page.' })
  const first = await mocks.startCapture.mock.results[0]!.value
  const ended = first.screenStream.getVideoTracks()[0].addEventListener.mock.calls[0][1] as () => void
  await act(async () => { ended() })
  expect(await screen.findByRole('alert', {}, { timeout: 5_000 })).toHaveTextContent('ended before recording started')

  const create = mocks.sendMessage.mock.calls.find(([message]) => message.type === 'record:session-create')?.[0]
  if (create) await act(async () => { for (const listener of mocks.listeners) listener({ type: 'record:controller-command', sessionId: create.sessionId, command: { kind: 'restart' } }) })

  fireEvent.click(screen.getByRole('radio', { name: /Window/ }))
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
  expect(await screen.findByRole('heading', { name: /Show it once/ })).toBeInTheDocument()
})

it('finishes automatically when the shared surface ends after recording starts', async () => {
  await load()
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalledOnce())
  const active = await mocks.startCapture.mock.results[0]!.value
  const ended = active.screenStream.getVideoTracks()[0].addEventListener.mock.calls[0][1] as () => void
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  ended()
  expect(await screen.findByText('Capture ready')).toBeInTheDocument()
})

it('reports target lookup, saved-recording, and finalization failures safely', async () => {
  mocks.getRecording.mockRejectedValueOnce(new Error('missing'))
  const broken = capture()
  vi.mocked(broken.stop).mockRejectedValueOnce('disk full')
  mocks.startCapture.mockResolvedValueOnce(broken)
  await load('?recording=missing&tabId=7&pageUrl=https%3A%2F%2Facme.test')
  fireEvent.click(screen.getByRole('radio', { name: /Window/ }))
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not finish this recording')
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(close).toHaveBeenCalled()
})

it('surfaces an Error thrown while finalizing', async () => {
  const broken = capture()
  vi.mocked(broken.stop).mockRejectedValueOnce(new Error('Encoder failed'))
  mocks.startCapture.mockResolvedValueOnce(broken)
  await load()
  fireEvent.click(screen.getByRole('radio', { name: /Window/ }))
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Encoder failed')
})

it('stops an acquired capture when preview setup fails', async () => {
  const acquired = capture()
  mocks.startCapture.mockResolvedValueOnce(acquired)
  mocks.play.mockRejectedValueOnce('preview failed')
  await load()
  fireEvent.click(screen.getByRole('radio', { name: /Window/ }))
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not start recording')
  expect(acquired.stop).toHaveBeenCalled()
})

it('finishes a camera-free capture without a camera recording', async () => {
  const screenOnly = capture()
  screenOnly.cameraStream = null
  vi.mocked(screenOnly.stop).mockResolvedValue({ screenBlob: new Blob(['screen']) })
  mocks.startCapture.mockResolvedValueOnce(screenOnly)
  await load()
  fireEvent.click(screen.getByRole('radio', { name: /Entire screen/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Camera' }))
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(await screen.findByText('Capture ready')).toBeInTheDocument()
  expect(mocks.saveRecording.mock.calls[mocks.saveRecording.mock.calls.length - 1]?.[0].cameraBlob).toBeUndefined()
})

it('recovers from denied capture and lets the user choose another source', async () => {
  mocks.requestPermission.mockResolvedValueOnce(false)
  mocks.startCapture.mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce(capture())
  await load()
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  fireEvent.click(screen.getByRole('radio', { name: /Entire screen/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Camera' }))
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalledTimes(2))
})

it('returns a tab recording to setup when the injected surface requests restart', async () => {
  await load()
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:session-create' })))
  const create = mocks.sendMessage.mock.calls.find(([message]) => message.type === 'record:session-create')![0]
  await act(async () => { for (const listener of mocks.listeners) listener({ type: 'record:controller-command', sessionId: create.sessionId, command: { kind: 'restart' } }) })
  expect(await screen.findByRole('heading', { name: /Show it once/ })).toBeInTheDocument()
  expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'record:session-stop', sessionId: create.sessionId })
})

it('disables This tab when no recordable page context is available', async () => {
  await load('?pageUrl=chrome%3A%2F%2Fextensions')
  expect(screen.getByRole('radio', { name: /This tab/ })).toBeDisabled()
})

it('opens a locally stored recording directly in review', async () => {
  mocks.getRecording.mockResolvedValue({
    id: 'saved', title: 'Saved review', source: 'screen', status: 'ready', durationMs: 12_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', pageTitle: 'Checkout',
    marks: [{ id: 'pin', type: 'pin', atMs: 3_000, points: [{ x: 20, y: 20 }], pinNumber: 1 }],
    transcript: [{ id: 'line', startMs: 2_000, endMs: 4_000, text: 'Change this.' }],
    transcriptionStatus: 'ready',
    screenBlob: new Blob(['screen']), cameraBlob: new Blob(['camera']),
  })
  history.replaceState(null, '', '/record.html?recording=saved')
  document.body.innerHTML = '<div id="root"></div>'
  await import('./main')
  expect(await screen.findByRole('heading', { name: 'Saved review' })).toBeInTheDocument()
  fireEvent.click(screen.getByText('Change this.'))
  fireEvent.click(document.querySelector('.timeline-markers button')!)
})

it('ignores a missing local recording', async () => {
  mocks.getRecording.mockResolvedValue(undefined)
  await load('?recording=absent')
  expect(screen.getByRole('heading', { name: /Show it once/ })).toBeInTheDocument()
})

it('opens a stored recording without media blobs and renders an empty text mark safely', async () => {
  mocks.getRecording.mockResolvedValue({
    id: 'saved-lite', title: 'Notes only', source: 'tab', status: 'ready', durationMs: 1_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', marks: [{ id: 'text', type: 'text', atMs: 0, points: [{ x: 5, y: 5 }] }], transcript: [],
  })
  history.replaceState(null, '', '/record.html?recording=saved-lite')
  document.body.innerHTML = '<div id="root"></div>'
  await import('./main')
  expect(await screen.findByRole('heading', { name: 'Notes only' })).toBeInTheDocument()
  expect(screen.getByText('Transcript unavailable')).toBeInTheDocument()
})

it('retries a failed transcript from the locally retained audio', async () => {
  const stored = {
    id: 'retry', title: 'Retry review', source: 'tab', status: 'ready', durationMs: 1_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', marks: [], transcript: [],
    transcriptionStatus: 'failed', transcriptionError: 'Provider unavailable',
    screenBlob: new Blob(['screen']), audioBlob: new Blob(['audio']),
  }
  mocks.getRecording.mockResolvedValue(stored)
  mocks.withTranscript.mockResolvedValue({ ...stored, transcriptionStatus: 'ready', transcriptionError: undefined, transcript: [{ id: 's', startMs: 0, endMs: 500, text: 'Recovered speech.' }] })
  history.replaceState(null, '', '/record.html?recording=retry')
  document.body.innerHTML = '<div id="root"></div>'
  await import('./main')
  expect(await screen.findByText('Provider unavailable')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry transcription' }))
  expect(await screen.findByText('Recovered speech.')).toBeInTheDocument()
  expect(mocks.saveRecording).toHaveBeenCalledWith(expect.objectContaining({ transcriptionStatus: 'processing' }))
  expect(mocks.saveRecording).toHaveBeenCalledWith(expect.objectContaining({ transcriptionStatus: 'ready' }))
})

it('keeps transcripts account-free and gates the agent payload behind sign-in', async () => {
  mocks.getRecording.mockResolvedValue({
    id: 'free-transcript', title: 'Free transcript', source: 'tab', status: 'ready', durationMs: 1_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', marks: [],
    transcript: [{ id: 'line', startMs: 0, endMs: 500, text: 'Visible without an account.' }],
    transcriptionStatus: 'ready', screenBlob: new Blob(['screen']), audioBlob: new Blob(['audio']),
  })
  mocks.extensionSession.mockResolvedValueOnce(null)
  history.replaceState(null, '', '/record.html?recording=free-transcript')
  document.body.innerHTML = '<div id="root"></div>'
  await import('./main')
  expect(await screen.findByText('Visible without an account.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'For agents' }))
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'auth:open-popup' }))
  expect(screen.getByText('Visible without an account.')).toBeInTheDocument()
})

it('renders a processing transcript state honestly', async () => {
  mocks.getRecording.mockResolvedValue({
    id: 'processing', title: 'Processing', source: 'tab', status: 'processing', durationMs: 1_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', marks: [], transcript: [], transcriptionStatus: 'processing',
  })
  history.replaceState(null, '', '/record.html?recording=processing')
  document.body.innerHTML = '<div id="root"></div>'
  await import('./main')
  expect(await screen.findByText('Transcribing voice…')).toBeInTheDocument()
})

it('renders a successful silent transcript without treating it as an error', async () => {
  mocks.getRecording.mockResolvedValue({
    id: 'silent', title: 'Silent', source: 'tab', status: 'ready', durationMs: 1_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', marks: [], transcript: [], transcriptionStatus: 'ready',
  })
  history.replaceState(null, '', '/record.html?recording=silent')
  document.body.innerHTML = '<div id="root"></div>'
  await import('./main')
  expect(await screen.findByText('No speech detected')).toBeInTheDocument()
})
