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
  return {
    screenStream: {} as MediaStream, cameraStream: null, previewStream: {} as MediaStream,
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
