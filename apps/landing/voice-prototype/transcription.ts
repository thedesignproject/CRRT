export type Transcript = { text: string; status: 'ready' | 'partial' | 'unavailable'; reason: string }
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void; stop(): void; abort(): void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

/** Transcribes live speech alongside MediaRecorder using the browser's speech service. */
export function startTranscription(signal: AbortSignal): { finish(): Promise<Transcript> } {
  const speechWindow = window as SpeechWindow
  const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  if (!Constructor) return { finish: async () => ({ text: '', status: 'unavailable',
    reason: 'This browser does not support transcription. Your voice recording is still available.' }) }
  let recognition: Recognition
  try { recognition = new Constructor() }
  catch { return { finish: async () => ({ text: '', status: 'unavailable', reason: 'Speech recognition could not start. Your voice recording is still available.' }) } }
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = document.documentElement.lang || navigator.language
  let previous = ''
  let current = ''
  let failure = ''
  let finishing = false
  let resolve: ((value: Transcript) => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const text = () => [previous, current].filter(Boolean).join(' ').trim()
  const cleanup = () => {
    clearTimeout(timer)
    recognition.onend = null
    recognition.onerror = null
    recognition.onresult = null
    signal.removeEventListener('abort', cancel)
    try { recognition.abort() } catch { /* Some engines reject abort after ending. */ }
  }
  const settle = () => {
    const value = text()
    cleanup()
    resolve?.({ text: value, status: value ? (failure ? 'partial' : 'ready') : 'unavailable',
      reason: failure || (value ? '' : 'No speech was recognized. You can still listen to the recording.') })
  }
  const cancel = () => { failure = 'Transcription was cancelled.'; settle() }
  recognition.onresult = event => {
    current = Array.from(event.results, result => result[0].transcript.trim()).filter(Boolean).join(' ')
  }
  recognition.onerror = event => {
    failure = event.error === 'not-allowed' || event.error === 'service-not-allowed'
      ? 'Speech recognition was blocked. Allow it in your browser settings for your next recording.'
      : 'Speech recognition could not complete. Your voice recording is still available.'
    if (finishing) settle()
  }
  recognition.onend = () => {
    if (finishing) { settle(); return }
    if (failure) return
    previous = text(); current = ''
    try { recognition.start() }
    catch { failure = 'Speech recognition stopped early. The transcript may be incomplete.' }
  }
  signal.addEventListener('abort', cancel, { once: true })
  try { recognition.start() }
  catch { failure = 'Speech recognition could not start. Your voice recording is still available.' }
  return {
    finish: () => new Promise<Transcript>(done => {
      resolve = done
      finishing = true
      if (failure || signal.aborted) { settle(); return }
      // Allow the service to return the last spoken words before attaching the take.
      timer = setTimeout(settle, 2000)
      try { recognition.stop() }
      catch { settle() }
    }),
  }
}
