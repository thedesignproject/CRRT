import { expect, it, vi } from 'vitest'
import { startRecordingCapture } from './recording-capture'

class FakeRecorder {
  static isTypeSupported = vi.fn(() => true)
  state: RecordingState = 'inactive'
  mimeType = 'video/webm'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public stream: MediaStream, public options?: MediaRecorderOptions) {}
  start() { this.state = 'recording' }
  pause() { this.state = 'paused' }
  resume() { this.state = 'recording' }
  stop() { this.ondataavailable?.({ data: new Blob(['video']) } as BlobEvent); this.state = 'inactive'; this.onstop?.() }
}

function track(kind: 'audio' | 'video') { return { kind, enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack }
function stream(audio = 0, video = 0) {
  const audioTracks = Array.from({ length: audio }, () => track('audio'))
  const videoTracks = Array.from({ length: video }, () => track('video'))
  return { getAudioTracks: () => audioTracks, getVideoTracks: () => videoTracks, getTracks: () => [...audioTracks, ...videoTracks] } as unknown as MediaStream
}

class FakeMediaStream {
  constructor(private tracks: MediaStreamTrack[] = []) {}
  getAudioTracks() { return this.tracks.filter((value) => value.kind === 'audio') }
  getVideoTracks() { return this.tracks.filter((value) => value.kind === 'video') }
  getTracks() { return this.tracks }
}

it('captures a tab with microphone and camera and stops every stream', async () => {
  const tab = stream(1, 1), devices = stream(1, 1), mixed = stream(1, 0)
  const getUserMedia = vi.fn().mockResolvedValueOnce(tab).mockResolvedValueOnce(devices)
  const close = vi.fn()
  class FakeAudioContext {
    destination = {}
    createMediaStreamDestination() { return { stream: mixed } }
    createMediaStreamSource() { return { connect: vi.fn() } }
    close = close
  }
  const capture = await startRecordingCapture({ source: 'tab', tabStreamId: 'stream-id', cameraEnabled: true, microphoneEnabled: true }, {
    mediaDevices: { getUserMedia } as unknown as MediaDevices,
    MediaRecorder: FakeRecorder as unknown as typeof MediaRecorder,
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    MediaStream: FakeMediaStream as unknown as typeof MediaStream,
  })
  expect(getUserMedia).toHaveBeenNthCalledWith(1, expect.objectContaining({ video: expect.anything() }))
  expect(capture.setCameraEnabled(false)).toBe(true)
  expect(capture.cameraStream?.getVideoTracks()[0]?.enabled).toBe(false)
  expect(capture.setCameraEnabled(true)).toBe(true)
  expect(capture.cameraStream?.getVideoTracks()[0]?.enabled).toBe(true)
  capture.pause(); capture.resume()
  const result = await capture.stop()
  expect(result.screenBlob.size).toBeGreaterThan(0)
  expect(result.cameraBlob?.size).toBeGreaterThan(0)
  expect(result.audioBlob?.size).toBeGreaterThan(0)
  expect(close).toHaveBeenCalledOnce()
})

it('requires a stream id for tab recording', async () => {
  await expect(startRecordingCapture({ source: 'tab', cameraEnabled: false, microphoneEnabled: false }, {
    mediaDevices: {} as MediaDevices,
    MediaRecorder: FakeRecorder as unknown as typeof MediaRecorder,
    AudioContext: class {} as unknown as typeof AudioContext,
    MediaStream: FakeMediaStream as unknown as typeof MediaStream,
  })).rejects.toThrow('selected tab')
})

it('captures a chosen window through the browser display picker', async () => {
  const display = stream(1, 1), mixed = stream(1, 0)
  const getDisplayMedia = vi.fn().mockResolvedValue(display)
  class FakeAudioContext {
    destination = {}
    createMediaStreamDestination() { return { stream: mixed } }
    createMediaStreamSource() { return { connect: vi.fn() } }
    close = vi.fn()
  }
  const capture = await startRecordingCapture({ source: 'window', cameraEnabled: false, microphoneEnabled: false }, {
    mediaDevices: { getDisplayMedia } as unknown as MediaDevices,
    MediaRecorder: FakeRecorder as unknown as typeof MediaRecorder,
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    MediaStream: FakeMediaStream as unknown as typeof MediaStream,
  })
  expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: true, video: expect.objectContaining({ displaySurface: 'window' }) }))
  expect(capture.setCameraEnabled(false)).toBe(false)
  capture.pause(); capture.resume()
  await capture.stop()
})

it('falls back when media types and recorder metadata are unavailable', async () => {
  const display = stream(0, 1), mixed = stream(0, 0)
  class SparseRecorder extends FakeRecorder {
    static isTypeSupported = vi.fn(() => false)
    mimeType = ''
    stop() { this.ondataavailable?.({ data: new Blob() } as BlobEvent); this.state = 'inactive'; this.onstop?.() }
  }
  class FakeAudioContext {
    destination = {}
    createMediaStreamDestination() { return { stream: mixed } }
    createMediaStreamSource() { return { connect: vi.fn() } }
    close = vi.fn()
  }
  const capture = await startRecordingCapture({ source: 'screen', cameraEnabled: false, microphoneEnabled: false }, {
    mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(display) } as unknown as MediaDevices,
    MediaRecorder: SparseRecorder as unknown as typeof MediaRecorder,
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    MediaStream: FakeMediaStream as unknown as typeof MediaStream,
  })
  const result = await capture.stop()
  expect(result.screenBlob.type).toBe('video/webm')
  expect(result.screenBlob.size).toBe(0)
})

it('falls back to the standard audio WebM type when codec metadata is unavailable', async () => {
  const display = stream(1, 1), mixed = stream(1, 0)
  class SparseRecorder extends FakeRecorder {
    static isTypeSupported = vi.fn(() => false)
    mimeType = ''
  }
  class FakeAudioContext {
    destination = {}
    createMediaStreamDestination() { return { stream: mixed } }
    createMediaStreamSource() { return { connect: vi.fn() } }
    close = vi.fn()
  }
  const capture = await startRecordingCapture({ source: 'screen', cameraEnabled: false, microphoneEnabled: false }, {
    mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(display) } as unknown as MediaDevices,
    MediaRecorder: SparseRecorder as unknown as typeof MediaRecorder,
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    MediaStream: FakeMediaStream as unknown as typeof MediaStream,
  })
  const result = await capture.stop()
  expect(result.audioBlob).toMatchObject({ type: 'audio/webm' })
})

it('reports browsers without media capture', async () => {
  await expect(startRecordingCapture({ source: 'screen', cameraEnabled: false, microphoneEnabled: false }, {
    mediaDevices: undefined as unknown as MediaDevices,
    MediaRecorder: FakeRecorder as unknown as typeof MediaRecorder,
    AudioContext: class {} as unknown as typeof AudioContext,
    MediaStream: FakeMediaStream as unknown as typeof MediaStream,
  })).rejects.toThrow('Media capture is unavailable')
})

it('uses browser media globals by default', async () => {
  const display = stream(0, 1), mixed = stream(0, 0)
  class FakeAudioContext {
    destination = {}
    createMediaStreamDestination() { return { stream: mixed } }
    createMediaStreamSource() { return { connect: vi.fn() } }
    close = vi.fn()
  }
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: vi.fn().mockResolvedValue(display) } })
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('MediaStream', FakeMediaStream)
  const capture = await startRecordingCapture({ source: 'screen', cameraEnabled: false, microphoneEnabled: false })
  await capture.stop()
  vi.unstubAllGlobals()
})
