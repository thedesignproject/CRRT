import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listener: undefined as ((message: any, sender?: unknown, respond?: (response: unknown) => void) => void) | undefined,
  sendMessage: vi.fn(),
  startCapture: vi.fn(),
  permissions: vi.fn(),
  saveRecording: vi.fn(),
  withTranscript: vi.fn(),
}))

vi.mock('wxt/browser', () => ({ browser: { runtime: {
  sendMessage: mocks.sendMessage,
  onMessage: { addListener: (listener: (message: any) => void) => { mocks.listener = (message, sender = {}, respond = vi.fn()) => (listener as any)(message, sender, respond) } },
} } }))
vi.mock('../../lib/recording-permissions', () => ({ hasRecordingPermissions: mocks.permissions }))
vi.mock('../../lib/recording-capture', () => ({ startRecordingCapture: mocks.startCapture }))
vi.mock('../../lib/recording-store', () => ({ saveLocalRecording: mocks.saveRecording }))
vi.mock('../../lib/recording-transcription', () => ({ withRecordingTranscript: mocks.withTranscript }))

function capture() {
  const screenTrack = new EventTarget()
  return {
    screenTrack,
    screenStream: { getVideoTracks: () => [screenTrack] } as unknown as MediaStream, cameraStream: null, previewStream: {} as MediaStream,
    setCameraEnabled: vi.fn(() => true),
    pause: vi.fn(), resume: vi.fn(),
    stop: vi.fn().mockResolvedValue({ screenBlob: new Blob(['screen']), audioBlob: new Blob(['audio']) }),
  }
}

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.startCapture.mockResolvedValue(capture())
  mocks.saveRecording.mockResolvedValue('saved')
  mocks.sendMessage.mockResolvedValue({ ok: true })
  mocks.withTranscript.mockImplementation(async (recording) => ({
    ...recording, status: 'ready', transcriptionStatus: 'ready',
    transcript: [{ id: 'speech', startMs: 200, endMs: 1_400, text: 'This is the actual narration.' }],
  }))
})

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('records offscreen, applies commands, and saves a finished capture', async () => {
  await import('./main')
  mocks.listener!({
    type: 'record:offscreen-start', target: 'offscreen', sessionId: 'session-1', tabStreamId: 'stream-1',
    pageUrl: 'https://example.com', pageTitle: 'Checkout',
    snapshot: { status: 'setup', source: 'tab', cameraEnabled: true, microphoneEnabled: true, countdown: 3, durationMs: 0, tool: 'pointer', marks: [], error: null },
  })
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalledWith(expect.objectContaining({ source: 'tab', tabStreamId: 'stream-1' })))
  await act(async () => { await vi.advanceTimersByTimeAsync(3_200) })
  const activeCapture = await mocks.startCapture.mock.results[0]!.value
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'pause.toggle' } })
  await waitFor(() => expect(activeCapture.pause).toHaveBeenCalledTimes(2))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'pause.toggle' } })
  await waitFor(() => expect(activeCapture.resume).toHaveBeenCalledTimes(2))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'camera.toggled' } })
  await waitFor(() => expect(activeCapture.setCameraEnabled).toHaveBeenCalledWith(false))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'camera.toggled' } })
  await waitFor(() => expect(activeCapture.setCameraEnabled).toHaveBeenCalledWith(true))
  activeCapture.setCameraEnabled.mockReturnValueOnce(false)
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'camera.toggled' } })
  await waitFor(() => expect(activeCapture.setCameraEnabled).toHaveBeenCalledTimes(3))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'tool.changed', tool: 'box' } })
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'mark.added', mark: { id: 'box', type: 'box', atMs: 1_000, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } } })
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'mark.undone' } })
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'marks.cleared' } })
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'mark.added', mark: { id: 'note', type: 'text', atMs: 1_000, text: 'Pay button', points: [{ x: 1, y: 2 }] } } })
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'mark.added', mark: { id: 'target', type: 'box', atMs: 1_400, target: { selector: '#pay', pageUrl: 'https://example.com', tagName: 'button' }, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } } })
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'mark.added', mark: { id: 'area', type: 'arrow', atMs: 1_800, points: [{ x: 5, y: 6 }, { x: 7, y: 8 }] } } })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'record:offscreen-state', snapshot: expect.objectContaining({ tool: 'box', marks: expect.arrayContaining([expect.objectContaining({ id: 'note' }), expect.objectContaining({ id: 'target' }), expect.objectContaining({ id: 'area' })]) }),
  })))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'finish' } })
  await waitFor(() => expect(mocks.saveRecording).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Pay button', source: 'tab', transcript: [expect.objectContaining({ id: 'speech', text: 'This is the actual narration.' })], transcriptionStatus: 'ready',
  })))
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-finished', recordingId: expect.any(String) }))
})

it('discards, restarts, and reports capture failures', async () => {
  await import('./main')
  const start = (sessionId: string) => mocks.listener!({
    type: 'record:offscreen-start', target: 'offscreen', sessionId,
    snapshot: { status: 'setup', source: 'screen', cameraEnabled: false, microphoneEnabled: false, countdown: 3, durationMs: 0, tool: 'pointer', marks: [], error: null },
  })
  start('cancel'); await waitFor(() => expect(mocks.startCapture).toHaveBeenCalled())
  const cancelledCapture = await mocks.startCapture.mock.results[0]!.value
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'cancel' } })
  await waitFor(() => expect(cancelledCapture.stop).toHaveBeenCalled())
  start('restart'); await waitFor(() => expect(mocks.startCapture).toHaveBeenCalledTimes(2))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'restart' } })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-restart', sessionId: 'restart' })))
  mocks.startCapture.mockRejectedValueOnce(new Error('Permission denied'))
  start('failure')
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-error', error: 'Permission denied' })))
  mocks.startCapture.mockRejectedValueOnce('capture failed')
  start('non-error-failure')
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-error', error: 'Could not complete this recording.' })))
  mocks.listener!({ type: 'ignored', target: 'page' })
  const ignored = vi.fn()
  expect(mocks.listener!({ type: 'ignored', target: 'offscreen' }, {}, ignored)).toBeUndefined()
  expect(ignored).not.toHaveBeenCalled()
})

it('checks permissions without acquiring a capture stream and fails closed on query errors', async () => {
  await import('./main')
  const respond = vi.fn()
  mocks.permissions.mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('Permission query failed'))
  for (const granted of [false, true, false]) {
    mocks.listener!({ type: 'record:permissions-check', target: 'offscreen', devices: { cameraEnabled: true, microphoneEnabled: false } }, {}, respond)
    await waitFor(() => expect(respond).toHaveBeenLastCalledWith({ granted }))
  }
  expect(mocks.startCapture).not.toHaveBeenCalled()
})

it('starts a fresh countdown after permission failure and surfaces an empty capture instead of saving it', async () => {
  const recording = capture()
  mocks.startCapture.mockResolvedValue(recording)
  await import('./main')
  mocks.listener!({
    type: 'record:offscreen-start', target: 'offscreen', sessionId: 'retry', tabStreamId: 'tab-stream',
    snapshot: { status: 'failed', source: 'tab', cameraEnabled: false, microphoneEnabled: false, error: 'Permission dismissed' },
  })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'record:offscreen-state', snapshot: expect.objectContaining({ status: 'countdown', error: null }),
  })))
  expect(mocks.startCapture).toHaveBeenCalledWith(expect.objectContaining({ deferRecording: true }))
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  recording.stop.mockRejectedValueOnce(new Error('No video was captured. Start a new recording.'))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', sessionId: 'retry', command: { kind: 'finish' } })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-error', sessionId: 'retry', error: expect.stringContaining('No video was captured') })))
  expect(mocks.saveRecording).not.toHaveBeenCalled()
})

it('cleans up and leaves countdown when a deferred encoder cannot start', async () => {
  const recording = capture()
  recording.resume.mockImplementationOnce(() => { throw new Error('Encoder could not start') })
  mocks.startCapture.mockResolvedValue(recording)
  await import('./main')
  mocks.listener!({ type: 'record:offscreen-start', target: 'offscreen', sessionId: 'encoder-failure', snapshot: { status: 'setup', source: 'screen', cameraEnabled: false, microphoneEnabled: false } })
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalled())
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
  await waitFor(() => expect(recording.stop).toHaveBeenCalled())
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-error', error: 'Encoder could not start' }))
  expect(mocks.saveRecording).not.toHaveBeenCalled()
})

it('finalizes Stop sharing exactly once even when Done arrives simultaneously', async () => {
  const recording = capture()
  mocks.startCapture.mockResolvedValue(recording)
  await import('./main')
  mocks.listener!({ type: 'record:offscreen-start', target: 'offscreen', sessionId: 'ended', snapshot: { status: 'setup', source: 'window', cameraEnabled: true, microphoneEnabled: true } })
  await act(async () => { await vi.advanceTimersByTimeAsync(3_200) })
  recording.screenTrack.dispatchEvent(new Event('ended'))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', sessionId: 'ended', command: { kind: 'finish' } })
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-finished' })))
  expect(recording.stop).toHaveBeenCalledOnce()
  expect(mocks.withTranscript).toHaveBeenCalledOnce()
  expect(mocks.saveRecording).toHaveBeenCalledTimes(2)
  expect(mocks.sendMessage.mock.calls.filter(([message]) => message.type === 'record:offscreen-finished')).toHaveLength(1)
})

it('releases a capture ended during countdown and ignores ended events after cancellation', async () => {
  const recording = capture()
  mocks.startCapture.mockResolvedValue(recording)
  await import('./main')
  mocks.listener!({ type: 'record:offscreen-start', target: 'offscreen', sessionId: 'countdown-ended', snapshot: { status: 'setup', source: 'window' } })
  await waitFor(() => expect(recording.pause).toHaveBeenCalled())
  recording.screenTrack.dispatchEvent(new Event('ended'))
  await waitFor(() => expect(recording.stop).toHaveBeenCalled())
  await act(async () => { await vi.advanceTimersByTimeAsync(4_000) })
  expect(recording.resume).not.toHaveBeenCalled()
  expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-error', error: 'Screen sharing ended before recording started.' }))
  expect(mocks.saveRecording).not.toHaveBeenCalled()
  const next = capture(); mocks.startCapture.mockResolvedValue(next)
  mocks.listener!({ type: 'record:offscreen-start', target: 'offscreen', sessionId: 'cancelled', snapshot: { status: 'setup', source: 'tab' } })
  await waitFor(() => expect(next.pause).toHaveBeenCalled())
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', sessionId: 'cancelled', command: { kind: 'cancel' } })
  await waitFor(() => expect(next.stop).toHaveBeenCalled())
  next.screenTrack.dispatchEvent(new Event('ended'))
  expect(mocks.saveRecording).not.toHaveBeenCalled()
})

it('does not leak pending captures after cancel and refuses duplicate starts over an active session', async () => {
  let resolve!: (value: ReturnType<typeof capture>) => void
  const pending = new Promise<ReturnType<typeof capture>>((done) => { resolve = done })
  mocks.startCapture.mockReturnValueOnce(pending)
  await import('./main')
  const start = { type: 'record:offscreen-start', target: 'offscreen', sessionId: 'pending', snapshot: { status: 'setup', source: 'window' } }
  const respond = vi.fn()
  mocks.listener!(start, {}, respond)
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', sessionId: 'pending', command: { kind: 'cancel' } })
  const aborted = capture(); resolve(aborted)
  await waitFor(() => expect(aborted.stop).toHaveBeenCalledOnce())
  expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
  const recording = capture(); mocks.startCapture.mockResolvedValue(recording)
  mocks.listener!(start)
  await waitFor(() => expect(recording.pause).toHaveBeenCalled())
  mocks.listener!(start, {}, respond)
  await waitFor(() => expect(respond).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false })))
  expect(recording.stop).not.toHaveBeenCalled()
})

it('keeps the new capture active when an older transcription completes after cancellation', async () => {
  let complete!: () => void
  mocks.withTranscript.mockImplementationOnce((recording) => new Promise((resolve) => {
    complete = () => resolve({ ...recording, status: 'ready' })
  }))
  await import('./main')
  const start = (sessionId: string) => mocks.listener!({ type: 'record:offscreen-start', target: 'offscreen', sessionId, snapshot: { status: 'setup', source: 'tab' } })
  start('older')
  await act(async () => { await vi.advanceTimersByTimeAsync(3_200) })
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'finish' } })
  await waitFor(() => expect(mocks.withTranscript).toHaveBeenCalledOnce())
  const cancelled = vi.fn()
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'cancel' } }, {}, cancelled)
  await waitFor(() => expect(cancelled).toHaveBeenCalledWith({ ok: true }))
  const next = capture()
  mocks.startCapture.mockResolvedValue(next)
  start('newer')
  await act(async () => { await vi.advanceTimersByTimeAsync(3_200) })
  complete()
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-finished', sessionId: 'older' })))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'pause.toggle' } })
  await waitFor(() => expect(next.pause).toHaveBeenCalledTimes(2))
})
