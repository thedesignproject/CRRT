/** Browser-only recording adapter. No audio leaves the tab. */
export type VoiceRecording = { finish: () => Promise<Blob>; discard: () => void }
export type RecordingSample = { seconds: number; levels: number[] }

export async function startRecording(
  signal: AbortSignal,
  onSample: (sample: RecordingSample) => void,
  onFailure: () => void,
): Promise<VoiceRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Recording is unavailable here. Open this page in a browser with microphone support, or type a comment.')
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const stopTracks = () => stream.getTracks().forEach(track => track.stop())
  if (signal.aborted) {
    stopTracks()
    throw new DOMException('Recording cancelled', 'AbortError')
  }
  let context: AudioContext | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let recorder: MediaRecorder | undefined
  let discarded = false
  let resolveBlob: (blob: Blob) => void
  let rejectBlob: (error: Error) => void
  const result = new Promise<Blob>((resolve, reject) => { resolveBlob = resolve; rejectBlob = reject })
  // A device error can arrive before the user checks the recording.
  void result.catch(() => {})
  const release = () => {
    clearInterval(timer)
    stopTracks()
    if (context) void context.close().catch(() => {})
    signal.removeEventListener('abort', discard)
  }
  const discard = () => {
    discarded = true
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    release()
  }
  try {
    recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.onstop = () => {
      release()
      const blob = new Blob(chunks, { type: recorder!.mimeType })
      if (discarded) return
      if (!blob.size) rejectBlob(new Error('No audio was captured. Please try recording again.'))
      else resolveBlob(blob)
    }
    recorder.onerror = () => {
      rejectBlob(new Error('The microphone stopped working. Please try recording again.'))
      discard()
      onFailure()
    }
    context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    context.createMediaStreamSource(stream).connect(analyser)
    void context.resume().catch(() => {})
    const values = new Uint8Array(analyser.frequencyBinCount)
    const started = performance.now()
    timer = setInterval(() => {
      analyser.getByteFrequencyData(values)
      onSample({ seconds: (performance.now() - started) / 1000,
        levels: Array.from({ length: 24 }, (_, i) => values[i * 2] / 255) })
    }, 100)
    signal.addEventListener('abort', discard, { once: true })
    recorder.start(250)
    return {
      finish: () => {
        if (recorder!.state !== 'inactive') recorder!.stop()
        return result
      },
      discard,
    }
  } catch (error) {
    discard()
    throw error
  }
}

export function recordingError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was blocked. Allow it in your browser’s site settings and try again, or type a comment.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone was found. Connect one and try again, or type a comment.'
  }
  return error instanceof Error ? error.message : 'Could not record audio. Please try again, or type a comment.'
}
