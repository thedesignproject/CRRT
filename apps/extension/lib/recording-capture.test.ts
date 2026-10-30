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
  await expect(capture.stop()).rejects.toThrow('No video was captured')
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

function captureEnvironment(display: MediaStream, recorder = FakeRecorder) {
  const mixed = stream(0, 0)
  const close = vi.fn()
  class Context {
    destination = {}
    createMediaStreamDestination() { return { stream: mixed } }
    createMediaStreamSource() { return { connect: vi.fn() } }
    close = close
  }
  return {
    mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(display), getUserMedia: vi.fn() } as unknown as MediaDevices,
    MediaRecorder: recorder as unknown as typeof MediaRecorder,
    AudioContext: Context as unknown as typeof AudioContext,
    MediaStream: FakeMediaStream as unknown as typeof MediaStream,
  }
}

it('releases screen sharing when camera permission is rejected during startup', async () => {
  const display = stream(0, 1)
  const environment = captureEnvironment(display)
  vi.mocked(environment.mediaDevices.getUserMedia).mockRejectedValue(new Error('Permission dismissed'))
  await expect(startRecordingCapture({ source: 'window', cameraEnabled: true, microphoneEnabled: true }, environment)).rejects.toThrow('Permission dismissed')
  expect(display.getVideoTracks()[0]!.stop).toHaveBeenCalledOnce()
})

it('starts recorders after the countdown instead of pausing and losing a static window frame', async () => {
  const recorders: FakeRecorder[] = []
  class DeferredRecorder extends FakeRecorder {
    start = vi.fn(() => { this.state = 'recording' })
    constructor(stream: MediaStream, options?: MediaRecorderOptions) { super(stream, options); recorders.push(this) }
  }
  const display = stream(0, 1)
  const capture = await startRecordingCapture({ source: 'window', cameraEnabled: false, microphoneEnabled: false, deferRecording: true }, captureEnvironment(display, DeferredRecorder))
  expect(recorders[0]!.state).toBe('inactive')
  capture.pause()
  capture.resume()
  expect(recorders[0]!.start).toHaveBeenCalledOnce()
  capture.pause(); capture.pause(); capture.resume(); capture.resume()
  const firstStop = capture.stop()
  expect(capture.stop()).toBe(firstStop)
  expect((await firstStop).screenBlob.size).toBeGreaterThan(0)
  expect(display.getTracks()[0]!.stop).toHaveBeenCalledOnce()
})

it('can cancel before the countdown finishes without leaving a stream or pending stop', async () => {
  const display = stream(0, 1)
  const capture = await startRecordingCapture({ source: 'screen', cameraEnabled: false, microphoneEnabled: false, deferRecording: true }, captureEnvironment(display))
  await expect(capture.stop()).rejects.toThrow('No video was captured')
  expect(display.getTracks()[0]!.stop).toHaveBeenCalledOnce()
})

it('cleans up streams and the audio context even when an encoder fails', async () => {
  let recorder: FakeRecorder
  class BrokenRecorder extends FakeRecorder {
    constructor(stream: MediaStream, options?: MediaRecorderOptions) { super(stream, options); recorder = this }
    stop() { this.state = 'inactive'; this.onerror?.() }
  }
  const display = stream(0, 1)
  const capture = await startRecordingCapture({ source: 'screen', cameraEnabled: false, microphoneEnabled: false }, captureEnvironment(display, BrokenRecorder))
  await expect(capture.stop()).rejects.toThrow('could not finish')
  expect(recorder!.state).toBe('inactive')
  expect(display.getTracks()[0]!.stop).toHaveBeenCalledOnce()
})

it('releases acquired media if constructing the encoder fails', async () => {
  class BrokenRecorder extends FakeRecorder {
    constructor(stream: MediaStream, options?: MediaRecorderOptions) { super(stream, options); throw new Error('Encoder unavailable') }
  }
  const display = stream(0, 1)
  const environment = captureEnvironment(display, BrokenRecorder)
  await expect(startRecordingCapture({ source: 'screen', cameraEnabled: false, microphoneEnabled: false }, environment)).rejects.toThrow('Encoder unavailable')
  expect(display.getTracks()[0]!.stop).toHaveBeenCalledOnce()
})

it('finishes an encoder that has already stopped without stopping it twice', async () => {
  let recorder!: FakeRecorder
  class EndedRecorder extends FakeRecorder {
    constructor(stream: MediaStream, options?: MediaRecorderOptions) { super(stream, options); recorder = this }
  }
  const capture = await startRecordingCapture({ source: 'screen', cameraEnabled: false, microphoneEnabled: false }, captureEnvironment(stream(0, 1), EndedRecorder))
  recorder.stop()
  expect((await capture.stop()).screenBlob.size).toBeGreaterThan(0)
})

it('stops earlier encoders if a later encoder cannot be constructed', async () => {
  let count = 0
  const instances: FakeRecorder[] = []
  class PartiallyBrokenRecorder extends FakeRecorder {
    constructor(stream: MediaStream, options?: MediaRecorderOptions) {
      super(stream, options)
      if (++count === 2) throw new Error('Camera encoder unavailable')
      instances.push(this)
    }
  }
  const environment = captureEnvironment(stream(0, 1), PartiallyBrokenRecorder)
  vi.mocked(environment.mediaDevices.getUserMedia).mockResolvedValue(stream(0, 1))
  await expect(startRecordingCapture({ source: 'window', cameraEnabled: true, microphoneEnabled: false }, environment)).rejects.toThrow('Camera encoder unavailable')
  expect(instances[0]!.state).toBe('inactive')
})

it('records video only when neither the window nor microphone supplies audio', async () => {
  const display = stream(0, 1), silentDestination = stream(1, 0)
  const environment = captureEnvironment(display)
  class SilentContext {
    destination = {}
    createMediaStreamDestination() { return { stream: silentDestination } }
    createMediaStreamSource() { throw new Error('There is no audio input') }
    close = vi.fn()
  }
  environment.AudioContext = SilentContext as unknown as typeof AudioContext
  const capture = await startRecordingCapture({ source: 'window', cameraEnabled: false, microphoneEnabled: false, deferRecording: true }, environment)
  expect(capture.previewStream.getAudioTracks()).toHaveLength(0)
  capture.resume()
  const result = await capture.stop()
  expect(result.screenBlob.size).toBeGreaterThan(0)
  expect(result.audioBlob).toBeUndefined()
  expect(silentDestination.getAudioTracks()[0]!.stop).toHaveBeenCalledOnce()
})
