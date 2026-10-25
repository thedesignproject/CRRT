import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listener: undefined as ((message: any) => void) | undefined,
  sendMessage: vi.fn(),
  startCapture: vi.fn(),
  saveRecording: vi.fn(),
}))

vi.mock('wxt/browser', () => ({ browser: { runtime: {
  sendMessage: mocks.sendMessage,
  onMessage: { addListener: (listener: (message: any) => void) => { mocks.listener = listener } },
} } }))
vi.mock('../../lib/recording-capture', () => ({ startRecordingCapture: mocks.startCapture }))
vi.mock('../../lib/recording-store', () => ({ saveLocalRecording: mocks.saveRecording }))

function capture() {
  return {
    screenStream: {} as MediaStream, cameraStream: null, previewStream: {} as MediaStream,
    pause: vi.fn(), resume: vi.fn(),
    stop: vi.fn().mockResolvedValue({ screenBlob: new Blob(['screen']) }),
  }
}

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.startCapture.mockResolvedValue(capture())
  mocks.saveRecording.mockResolvedValue('saved')
  mocks.sendMessage.mockResolvedValue({ ok: true })
})

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('records offscreen, applies commands, and saves a finished capture', async () => {
  await import('./main')
  mocks.listener!({
    type: 'record:offscreen-start', target: 'offscreen', sessionId: 'session-1', tabStreamId: 'stream-1',
    pageUrl: 'https://example.com', pageTitle: 'Checkout',
    snapshot: { status: 'setup', source: 'tab', cameraEnabled: false, microphoneEnabled: true, countdown: 3, durationMs: 0, tool: 'pointer', marks: [], error: null },
  })
  await waitFor(() => expect(mocks.startCapture).toHaveBeenCalledWith(expect.objectContaining({ source: 'tab', tabStreamId: 'stream-1' })))
  await act(async () => { await vi.advanceTimersByTimeAsync(3_200) })
  const activeCapture = await mocks.startCapture.mock.results[0]!.value
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'pause.toggle' } })
  await waitFor(() => expect(activeCapture.pause).toHaveBeenCalledTimes(2))
  mocks.listener!({ type: 'record:offscreen-command', target: 'offscreen', command: { kind: 'pause.toggle' } })
  await waitFor(() => expect(activeCapture.resume).toHaveBeenCalledTimes(2))
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
  await waitFor(() => expect(mocks.saveRecording).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pay button', source: 'tab' })))
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
  await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'record:offscreen-error', error: 'Could not start recording.' })))
  mocks.listener!({ type: 'ignored', target: 'page' })
})
