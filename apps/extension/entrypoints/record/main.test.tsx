import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  startCapture: vi.fn(),
  getRecording: vi.fn(),
  saveRecording: vi.fn(),
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
}))

vi.mock('wxt/browser', () => ({ browser: { runtime: {
  sendMessage: mocks.sendMessage,
  getURL: (path: string) => `chrome-extension://test${path}`,
} } }))
vi.mock('../../lib/recording-capture', () => ({ startRecordingCapture: mocks.startCapture }))
vi.mock('../../lib/recording-store', () => ({
  getLocalRecording: mocks.getRecording,
  saveLocalRecording: mocks.saveRecording,
}))

function mediaStream() {
  const track = { addEventListener: vi.fn(), stop: vi.fn(), kind: 'video' }
  return { getVideoTracks: () => [track], getAudioTracks: () => [], getTracks: () => [track] }
}

function capture() {
  return {
    screenStream: mediaStream(), cameraStream: mediaStream(), previewStream: mediaStream(),
    pause: vi.fn(), resume: vi.fn(), stop: vi.fn().mockResolvedValue({ screenBlob: new Blob(['screen']), cameraBlob: new Blob(['camera']) }),
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
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.sendMessage.mockImplementation(async (message: { type: string }) => message.type === 'record:tab-stream'
    ? { ok: true, data: 'stream-7' }
    : message.type === 'record:resolve-target'
      ? { ok: true, data: { selector: 'button.pay', pageUrl: 'https://acme.test/checkout', tagName: 'button' } }
      : { ok: true })
  mocks.startCapture.mockResolvedValue(capture())
  mocks.getRecording.mockResolvedValue(undefined)
  mocks.saveRecording.mockResolvedValue('saved')
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
  expect(helpers.fixtureTranscript([
    { id: 'pin', type: 'pin', atMs: 2_000, points: [], pinNumber: 2 },
    { id: 'draw', type: 'draw', atMs: 3_000, points: [], target: { tagName: 'button' } },
  ], 8_000).map((line) => line.text)).toEqual(expect.arrayContaining([
    expect.stringContaining('item 2'), expect.stringContaining('button'),
  ]))
  expect(helpers.fixtureTranscriptText({ id: 'note', type: 'text', atMs: 0, points: [], text: 'Exact note' })).toBe('Exact note')
  expect(helpers.fixtureTranscriptText({ id: 'area', type: 'box', atMs: 0, points: [] })).toContain('area')
  expect(helpers.recordingTitle([], undefined)).toBe('Untitled recording')
  expect(helpers.recordingTitle([], 'Checkout')).toBe('Checkout')
  expect(helpers.recordingTitle([{ id: 'note', type: 'text', atMs: 0, points: [], text: 'Title note' }], 'Checkout')).toBe('Title note')
  expect([helpers.liveTranscriptText(0), helpers.liveTranscriptText(5_000), helpers.liveTranscriptText(12_000)]).toEqual([
    'Listening…', '“Okay, this is the flow we are reviewing today.”', '“Look here—this is the part that should change.”',
  ])
  const drawImage = vi.fn()
  const originalCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => tag === 'canvas'
    ? { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL: () => 'data:image/jpeg;base64,eA==' }
    : originalCreate(tag)) as typeof document.createElement)
  expect(helpers.captureThumbnail({ videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement)).toContain('data:image/jpeg')
  expect(drawImage).toHaveBeenCalled()
  vi.mocked(document.createElement).mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Camera' }))
  fireEvent.click(screen.getByRole('button', { name: 'Microphone' }))
  fireEvent.click(screen.getByRole('button', { name: 'Camera' }))
  fireEvent.click(screen.getByRole('button', { name: 'Microphone' }))
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalled())
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  expect(screen.getByText(/Live transcript preview/)).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(4_200) })
  expect(screen.getByText(/Okay, this is the flow/)).toBeInTheDocument()

  const overlay = document.querySelector('.record-overlay') as SVGSVGElement
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 600 } as DOMRect)
  for (const tool of ['Draw', 'Arrow', 'Box', 'Text', 'Pin']) {
    fireEvent.click(screen.getByRole('button', { name: tool }))
    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 300, clientY: 240 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 300, clientY: 240 })
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:resolve-target' })))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  fireEvent.click(screen.getByRole('button', { name: 'Text' }))
  fireEvent.pointerDown(overlay, { pointerId: 2, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(overlay, { pointerId: 2, clientX: 300, clientY: 240 })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Clear' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
  expect(screen.getByText('Recording paused')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))

  await screen.findByText('Capture ready')
  expect(mocks.saveRecording).toHaveBeenCalled()
  expect(mocks.saveRecording.mock.calls[0]?.[0]).toMatchObject({ title: 'Needs more contrast' })
  const videos = document.querySelectorAll('video')
  Object.defineProperty(videos[0], 'currentTime', { configurable: true, writable: true, value: 2 })
  Object.defineProperty(videos[1], 'currentTime', { configurable: true, writable: true, value: 0 })
  fireEvent.timeUpdate(videos[0])
  expect(videos[1].currentTime).toBe(2)
  fireEvent.play(videos[0]); fireEvent.pause(videos[0])
  fireEvent.click(screen.getByRole('button', { name: 'For agents' }))
  expect(screen.getByText('Ready for Claude Code')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Copy for Claude Code/ }))
  fireEvent.click(screen.getByRole('button', { name: /Copy link/ }))
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2))
})

it('restarts an active recording and handles a share ending during countdown', async () => {
  await load()
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalledOnce())
  const first = await mocks.startCapture.mock.results[0]!.value
  const ended = first.screenStream.getVideoTracks()[0].addEventListener.mock.calls[0][1] as () => void
  ended()
  expect(await screen.findByRole('alert')).toHaveTextContent('ended before recording started')

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
  broken.stop.mockRejectedValueOnce('disk full')
  mocks.startCapture.mockResolvedValueOnce(broken)
  await load('?recording=missing&tabId=7&pageUrl=https%3A%2F%2Facme.test')
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  mocks.sendMessage.mockRejectedValueOnce(new Error('target unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Box' }))
  const overlay = document.querySelector('.record-overlay') as SVGSVGElement
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect)
  fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 50, clientY: 50 })
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not finish this recording')
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(close).toHaveBeenCalled()
})

it('recovers from denied capture and lets the user choose another source', async () => {
  mocks.startCapture.mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce(capture())
  await load()
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  fireEvent.click(screen.getByRole('radio', { name: /Entire screen/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Camera' }))
  fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalledTimes(2))
})

it('opens a locally stored recording directly in review', async () => {
  mocks.getRecording.mockResolvedValue({
    id: 'saved', title: 'Saved review', source: 'screen', status: 'ready', durationMs: 12_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', pageTitle: 'Checkout',
    marks: [{ id: 'pin', type: 'pin', atMs: 3_000, points: [{ x: 20, y: 20 }], pinNumber: 1 }],
    transcript: [{ id: 'line', startMs: 2_000, endMs: 4_000, text: 'Change this.' }],
    screenBlob: new Blob(['screen']), cameraBlob: new Blob(['camera']),
  })
  history.replaceState(null, '', '/record.html?recording=saved')
  document.body.innerHTML = '<div id="root"></div>'
  await import('./main')
  expect(await screen.findByRole('heading', { name: 'Saved review' })).toBeInTheDocument()
  fireEvent.click(screen.getByText('Change this.'))
  fireEvent.click(document.querySelector('.timeline-markers button')!)
})
