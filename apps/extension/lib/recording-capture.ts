import type { RecordingSource } from './recording'

export type RecordingCaptureOptions = {
  source: RecordingSource
  cameraEnabled: boolean
  microphoneEnabled: boolean
  tabStreamId?: string
  deferRecording?: boolean
}

export type RecordingCapture = {
  screenStream: MediaStream
  cameraStream: MediaStream | null
  previewStream: MediaStream
  setCameraEnabled: (enabled: boolean) => boolean
  pause: () => void
  resume: () => void
  stop: () => Promise<{ screenBlob: Blob; cameraBlob?: Blob; audioBlob?: Blob }>
}

type CaptureEnvironment = {
  mediaDevices: MediaDevices
  MediaRecorder: typeof MediaRecorder
  AudioContext: typeof AudioContext
  MediaStream: typeof MediaStream
}

function supportedMime(MediaRecorderType: typeof MediaRecorder, kind: 'audio' | 'video') {
  const options = kind === 'audio'
    ? ['audio/webm;codecs=opus', 'audio/webm']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return options.find((value) => MediaRecorderType.isTypeSupported(value))
}

function recorderFor(stream: MediaStream, MediaRecorderType: typeof MediaRecorder, kind: 'audio' | 'video', deferred: boolean) {
  const mimeType = supportedMime(MediaRecorderType, kind)
  const recorder = new MediaRecorderType(stream, {
    ...(mimeType ? { mimeType } : {}),
    ...(kind === 'audio' ? { audioBitsPerSecond: 48_000 } : {}),
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('The browser could not finish this recording.'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || `${kind}/webm` }))
  })
  let started = false
  const start = () => { recorder.start(1_000); started = true }
  if (!deferred) start()
  return {
    recorder, start,
    stop: () => {
      if (!started) return Promise.resolve(new Blob())
      if (recorder.state !== 'inactive') recorder.stop()
      return stopped
    },
  }
}

async function tabStream(mediaDevices: MediaDevices, streamId: string) {
  return mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as MediaTrackConstraints,
    video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as MediaTrackConstraints,
  })
}

async function displayStream(mediaDevices: MediaDevices, source: Exclude<RecordingSource, 'tab'>) {
  return mediaDevices.getDisplayMedia({
    audio: true,
    video: {
      displaySurface: source === 'screen' ? 'monitor' : 'window',
      frameRate: { ideal: 30, max: 30 },
    },
    preferCurrentTab: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: 'include',
  } as DisplayMediaStreamOptions)
}

export async function startRecordingCapture(
  options: RecordingCaptureOptions,
  environment: CaptureEnvironment = {
    mediaDevices: navigator.mediaDevices,
    MediaRecorder,
    AudioContext,
    MediaStream,
  },
): Promise<RecordingCapture> {
  if (!environment.mediaDevices) throw new Error('Media capture is unavailable in this browser.')
  if (options.source === 'tab' && !options.tabStreamId) throw new Error('The selected tab is no longer available.')

  const streams: MediaStream[] = []
  const recorders: ReturnType<typeof recorderFor>[] = []
  let audioContext: AudioContext | undefined
  const cleanup = async () => {
    for (const stream of streams) stream.getTracks().forEach((track) => track.stop())
    await audioContext?.close()
  }
  try {
    const screenStream = options.source === 'tab'
      ? await tabStream(environment.mediaDevices, options.tabStreamId!)
      : await displayStream(environment.mediaDevices, options.source)
    streams.push(screenStream)
    const auxiliary = options.cameraEnabled || options.microphoneEnabled
      ? await environment.mediaDevices.getUserMedia({ video: options.cameraEnabled, audio: options.microphoneEnabled })
      : null
    if (auxiliary) streams.push(auxiliary)
    const cameraStream = auxiliary && options.cameraEnabled
      ? new environment.MediaStream(auxiliary.getVideoTracks())
      : null

    audioContext = new environment.AudioContext()
    const destination = audioContext.createMediaStreamDestination()
    streams.push(destination.stream)
    const audioStreams = [screenStream, auxiliary].filter((stream): stream is MediaStream => Boolean(stream?.getAudioTracks().length))
    for (const stream of audioStreams) {
      const audioOnly = new environment.MediaStream(stream.getAudioTracks())
      const node = audioContext.createMediaStreamSource(audioOnly)
      node.connect(destination)
      if (stream === screenStream) node.connect(audioContext.destination)
    }
    // A destination track without an input can stall WebM muxing while the
    // offscreen AudioContext is suspended. Video-only captures need no audio track.
    const mixedAudioTracks = audioStreams.length ? destination.stream.getAudioTracks() : []
    const previewStream = new environment.MediaStream([
      ...screenStream.getVideoTracks(),
      ...mixedAudioTracks,
    ])
    const createRecorder = (stream: MediaStream, kind: 'audio' | 'video') => {
      const recorder = recorderFor(stream, environment.MediaRecorder, kind, options.deferRecording === true)
      recorders.push(recorder)
      return recorder
    }
    const primary = createRecorder(previewStream, 'video')
    const camera = cameraStream?.getVideoTracks().length ? createRecorder(cameraStream, 'video') : null
    const audio = mixedAudioTracks.length
      ? createRecorder(new environment.MediaStream(mixedAudioTracks), 'audio')
      : null
    let stopping: Promise<{ screenBlob: Blob; cameraBlob?: Blob; audioBlob?: Blob }> | null = null

    function apply(method: 'pause' | 'resume') {
      for (const capture of recorders) {
        const recorder = capture.recorder
        if (method === 'pause' && recorder.state === 'recording') recorder.pause()
        if (method === 'resume' && recorder.state === 'paused') recorder.resume()
        else if (method === 'resume' && recorder.state === 'inactive') capture.start()
      }
    }

    return {
      screenStream,
      cameraStream,
      previewStream,
      setCameraEnabled: (enabled) => {
        const tracks = cameraStream?.getVideoTracks() ?? []
        for (const track of tracks) track.enabled = enabled
        return tracks.length > 0
      },
      pause: () => apply('pause'),
      resume: () => apply('resume'),
      stop: () => stopping ??= (async () => {
        try {
          const [screenBlob, cameraBlob, audioBlob] = await Promise.all([primary.stop(), camera?.stop(), audio?.stop()])
          if (!screenBlob.size) throw new Error('No video was captured. Start a new recording and keep the selected window visible.')
          return { screenBlob, ...(cameraBlob ? { cameraBlob } : {}), ...(audioBlob?.size ? { audioBlob } : {}) }
        } finally {
          await cleanup()
        }
      })(),
    }
  } catch (error) {
    await Promise.allSettled(recorders.map((capture) => capture.stop()))
    await cleanup()
    throw error
  }
}
