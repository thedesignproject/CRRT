import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { recordingError, startRecording } from './recording'

let recorder: MockRecorder
let permission: ReturnType<typeof vi.fn>
let stopTrack: ReturnType<typeof vi.fn>
let close: ReturnType<typeof vi.fn>
let resume: ReturnType<typeof vi.fn>
let stream: MediaStream
let recorderThrows = false
let contextThrows = false
class MockRecorder {
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { if (recorderThrows) throw new Error('codec failed'); recorder = this }
  start() { this.state = 'recording' }
  stop() { this.state = 'inactive'; this.onstop?.() }
}
beforeEach(() => {
  vi.useFakeTimers()
  recorderThrows = false; contextThrows = false
  stopTrack = vi.fn()
  stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
  permission = vi.fn().mockResolvedValue(stream)
  close = vi.fn().mockResolvedValue(undefined)
  resume = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: permission } })
  vi.stubGlobal('MediaRecorder', MockRecorder)
  vi.stubGlobal('AudioContext', class {
    constructor() { if (contextThrows) throw new Error('audio context failed') }
    close = close
    resume = resume
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 128, getByteFrequencyData: (values: Uint8Array) => values.fill(128) } }
    createMediaStreamSource() { return { connect: vi.fn() } }
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('records audio, reports real analyser levels, and releases hardware when finished', async () => {
  const sample = vi.fn()
  const session = await startRecording(new AbortController().signal, sample, vi.fn())
  expect(permission).toHaveBeenCalledWith({ audio: true })
  vi.advanceTimersByTime(200)
  expect(sample).toHaveBeenCalledTimes(2)
  expect(sample.mock.calls[0][0].levels).toHaveLength(24)
  expect(sample.mock.calls[0][0].levels[0]).toBeCloseTo(128 / 255)
  recorder.ondataavailable!({ data: new Blob([]) })
  recorder.ondataavailable!({ data: new Blob(['voice']) })
  const result = await session.finish()
  expect(result.size).toBe(5)
  expect(result.type).toBe('audio/webm')
  expect(stopTrack).toHaveBeenCalled()
  expect(close).toHaveBeenCalled()
  vi.advanceTimersByTime(1000)
  expect(sample).toHaveBeenCalledTimes(2)
  expect(await session.finish()).toBe(result)
})
it('rejects empty recordings', async () => {
  const session = await startRecording(new AbortController().signal, vi.fn(), vi.fn())
  await expect(session.finish()).rejects.toThrow('No audio was captured')
})
it('discards a recording, including repeated discard calls', async () => {
  const controller = new AbortController()
  const session = await startRecording(controller.signal, vi.fn(), vi.fn())
  recorder.ondataavailable!({ data: new Blob(['discard']) })
  controller.abort()
  session.discard()
  expect(recorder.state).toBe('inactive')
  expect(close).toHaveBeenCalled()
})
it('stops tracks if permission arrives after cancellation', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(startRecording(controller.signal, vi.fn(), vi.fn())).rejects.toMatchObject({ name: 'AbortError' })
  expect(stopTrack).toHaveBeenCalledOnce()
})
it('surfaces device errors and frees resources before the user checks the take', async () => {
  const failed = vi.fn()
  const session = await startRecording(new AbortController().signal, vi.fn(), failed)
  recorder.onerror!()
  expect(failed).toHaveBeenCalledOnce()
  expect(stopTrack).toHaveBeenCalled()
  await expect(session.finish()).rejects.toThrow('microphone stopped working')
})
it.each(['mediaDevices', 'getUserMedia', 'MediaRecorder'])('explains unsupported %s environments', async missing => {
  if (missing === 'MediaRecorder') vi.stubGlobal('MediaRecorder', undefined)
  else vi.stubGlobal('navigator', missing === 'mediaDevices' ? {} : { mediaDevices: {} })
  await expect(startRecording(new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow('Recording is unavailable')
})
it('releases tracks if recorder construction fails', async () => {
  recorderThrows = true
  await expect(startRecording(new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow('codec failed')
  expect(stopTrack).toHaveBeenCalledOnce()
})
it('releases tracks if audio-context construction fails', async () => {
  contextThrows = true
  await expect(startRecording(new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow('audio context failed')
  expect(stopTrack).toHaveBeenCalledOnce()
})
it('tolerates a suspended or already closed audio context', async () => {
  resume.mockRejectedValueOnce(new Error('suspended'))
  close.mockRejectedValue(new Error('already closed'))
  const session = await startRecording(new AbortController().signal, vi.fn(), vi.fn())
  session.discard()
  await Promise.resolve()
  expect(stopTrack).toHaveBeenCalled()
})
it('propagates permission failure', async () => {
  permission.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
  await expect(startRecording(new AbortController().signal, vi.fn(), vi.fn())).rejects.toMatchObject({ name: 'NotAllowedError' })
})
it('gives actionable permission, missing-device, and generic errors', () => {
  expect(recordingError(new DOMException('', 'NotAllowedError'))).toContain('Microphone access was blocked')
  expect(recordingError(new DOMException('', 'NotFoundError'))).toContain('No microphone was found')
  expect(recordingError(new Error('codec'))).toBe('codec')
  expect(recordingError(null)).toContain('Could not record audio')
})
