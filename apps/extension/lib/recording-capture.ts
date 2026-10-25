import type { RecordingSource } from './recording'

export type RecordingCaptureOptions = {
  source: RecordingSource
  cameraEnabled: boolean
  microphoneEnabled: boolean
  tabStreamId?: string
}

export type RecordingCapture = {
  screenStream: MediaStream
  cameraStream: MediaStream | null
  previewStream: MediaStream
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

function recorderFor(stream: MediaStream, MediaRecorderType: typeof MediaRecorder, kind: 'audio' | 'video' = 'video') {
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
  recorder.start(1_000)
  return { recorder, stopped }
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

  const screenStream = options.source === 'tab'
    ? await tabStream(environment.mediaDevices, options.tabStreamId!)
    : await displayStream(environment.mediaDevices, options.source)
  const auxiliary = options.cameraEnabled || options.microphoneEnabled
    ? await environment.mediaDevices.getUserMedia({ video: options.cameraEnabled, audio: options.microphoneEnabled })
    : null
  const cameraStream = auxiliary && options.cameraEnabled
    ? new environment.MediaStream(auxiliary.getVideoTracks())
    : null

  const audioContext = new environment.AudioContext()
  const destination = audioContext.createMediaStreamDestination()
  const audioStreams = [screenStream, auxiliary].filter((stream): stream is MediaStream => Boolean(stream?.getAudioTracks().length))
  for (const stream of audioStreams) {
    const audioOnly = new environment.MediaStream(stream.getAudioTracks())
    const node = audioContext.createMediaStreamSource(audioOnly)
    node.connect(destination)
    if (stream === screenStream) node.connect(audioContext.destination)
  }
  const previewStream = new environment.MediaStream([
    ...screenStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ])
  const primary = recorderFor(previewStream, environment.MediaRecorder)
  const camera = cameraStream?.getVideoTracks().length ? recorderFor(cameraStream, environment.MediaRecorder) : null
  const audio = destination.stream.getAudioTracks().length
    ? recorderFor(new environment.MediaStream(destination.stream.getAudioTracks()), environment.MediaRecorder, 'audio')
    : null
  let stopping: Promise<{ screenBlob: Blob; cameraBlob?: Blob; audioBlob?: Blob }> | null = null

  function apply(method: 'pause' | 'resume') {
    for (const recorder of [primary.recorder, camera?.recorder, audio?.recorder]) {
      if (!recorder) continue
      if (method === 'pause' && recorder.state === 'recording') recorder.pause()
      if (method === 'resume' && recorder.state === 'paused') recorder.resume()
    }
  }

  return {
    screenStream,
    cameraStream,
    previewStream,
    pause: () => apply('pause'),
    resume: () => apply('resume'),
    stop: () => stopping ??= (async () => {
      for (const recorder of [primary.recorder, camera?.recorder, audio?.recorder]) {
        if (recorder && recorder.state !== 'inactive') recorder.stop()
      }
      const [screenBlob, cameraBlob, audioBlob] = await Promise.all([primary.stopped, camera?.stopped, audio?.stopped])
      for (const stream of [screenStream, auxiliary, previewStream, cameraStream]) stream?.getTracks().forEach((track) => track.stop())
      await audioContext.close()
      return { screenBlob, ...(cameraBlob ? { cameraBlob } : {}), ...(audioBlob?.size ? { audioBlob } : {}) }
    })(),
  }
}
