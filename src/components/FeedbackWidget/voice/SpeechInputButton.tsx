import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'

type SpeechAlternative = { transcript: string }
type SpeechResult = { readonly isFinal: boolean; readonly 0?: SpeechAlternative }
type SpeechResultEvent = Event & { readonly resultIndex: number; readonly results: ArrayLike<SpeechResult> }
type SpeechRecognitionErrorEvent = Event & { readonly error?: string }
type SpeechRecognitionInstance = {
  continuous: boolean; interimResults: boolean; lang: string
  onstart: (() => void) | null; onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
  start(): void; stop(): void; abort(): void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance
type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
  webkitAudioContext?: typeof AudioContext
}
type SpeechSupport = {
  Recognition: SpeechRecognitionConstructor
  Audio: typeof AudioContext
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
}
type Phase = 'idle' | 'requesting' | 'listening' | 'error'

export function getSpeechSupport(speechWindow: SpeechWindow | undefined, mediaDevices: MediaDevices | undefined): SpeechSupport | null {
  if (!speechWindow || !mediaDevices?.getUserMedia) return null
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  const Audio = speechWindow.AudioContext ?? speechWindow.webkitAudioContext
  if (!Recognition || !Audio) return null
  return { Recognition, Audio, getUserMedia: mediaDevices.getUserMedia.bind(mediaDevices) }
}

function currentSupport() {
  const speechWindow = (globalThis as { window?: SpeechWindow }).window
  return getSpeechSupport(speechWindow, speechWindow?.navigator.mediaDevices)
}

function joinTranscript(...parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join(' ')
}

function detachRecognition(recognition: SpeechRecognitionInstance) {
  recognition.onstart = null
  recognition.onend = null
  recognition.onerror = null
  recognition.onresult = null
}

function isBlockedError(error: unknown) {
  const candidate = Object(error) as { name?: string; error?: string }
  return candidate.name === 'NotAllowedError' || candidate.name === 'SecurityError'
    || candidate.error === 'not-allowed' || candidate.error === 'service-not-allowed'
}

export function SpeechInputButton({ value, onChange, stopSignal = 0, disabled = false }: {
  value: string
  onChange: (value: string) => void
  stopSignal?: number
  disabled?: boolean
}) {
  const [supported] = useState(() => currentSupport() !== null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorLabel, setErrorLabel] = useState('Mic unavailable')
  const [level, setLevel] = useState(0)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const animationRef = useRef(0)
  const sessionRef = useRef(0)
  const errorTimerRef = useRef(0)
  const valueRef = useRef(value)
  const baseTextRef = useRef('')
  const finalTextRef = useRef('')

  useEffect(() => { valueRef.current = value }, [value])

  const stopMedia = useCallback(() => {
    window.cancelAnimationFrame(animationRef.current)
    animationRef.current = 0
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void audioRef.current?.close()
    audioRef.current = null
    setLevel(0)
  }, [])

  const release = useCallback((recognition?: SpeechRecognitionInstance, failed = false, error?: unknown) => {
    if (recognition) detachRecognition(recognition)
    recognitionRef.current = null
    stopMedia()
    window.clearTimeout(errorTimerRef.current)
    if (failed) {
      setErrorLabel(isBlockedError(error) ? 'Mic blocked here' : 'Mic unavailable')
      setPhase('error')
      errorTimerRef.current = window.setTimeout(() => setPhase('idle'), 2200)
    } else setPhase('idle')
  }, [stopMedia])

  const stop = useCallback(() => {
    sessionRef.current += 1
    const recognition = recognitionRef.current
    recognition?.stop()
    release(recognition ?? undefined)
  }, [release])

  const start = useCallback(async () => {
    const support = currentSupport()
    if (!support) return
    const session = ++sessionRef.current
    setPhase('requesting')
    window.clearTimeout(errorTimerRef.current)
    try {
      const stream = await support.getUserMedia({ audio: true })
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const audio = new support.Audio()
      const analyser = audio.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.72
      audio.createMediaStreamSource(stream).connect(analyser)
      audioRef.current = audio
      const samples = new Uint8Array(analyser.frequencyBinCount)
      const visualize = () => {
        analyser.getByteFrequencyData(samples)
        const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length
        setLevel(Math.min(1, average / 96))
        animationRef.current = window.requestAnimationFrame(visualize)
      }
      visualize()

      const recognition = new support.Recognition()
      recognitionRef.current = recognition
      baseTextRef.current = valueRef.current
      finalTextRef.current = ''
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = document.documentElement.lang || navigator.language || 'en-US'
      const isCurrent = () => session === sessionRef.current && recognitionRef.current === recognition
      recognition.onstart = () => { if (isCurrent()) setPhase('listening') }
      recognition.onend = () => { if (isCurrent()) release(recognition) }
      recognition.onerror = (event) => { if (isCurrent()) release(recognition, true, event) }
      recognition.onresult = (event) => {
        if (!isCurrent()) return
        let finalText = '', interimText = ''
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          const transcript = result?.[0]?.transcript ?? ''
          if (result?.isFinal) finalText = joinTranscript(finalText, transcript)
          else interimText = joinTranscript(interimText, transcript)
        }
        finalTextRef.current = joinTranscript(finalTextRef.current, finalText)
        onChange(joinTranscript(baseTextRef.current, finalTextRef.current, interimText))
      }
      recognition.start()
    } catch (error) {
      if (session === sessionRef.current) release(undefined, true, error)
    }
  }, [onChange, release])

  useEffect(() => {
    if (stopSignal > 0) stop()
  }, [stop, stopSignal])

  useEffect(() => () => {
    sessionRef.current += 1
    const recognition = recognitionRef.current
    if (recognition) {
      detachRecognition(recognition)
      recognition.abort()
    }
    window.clearTimeout(errorTimerRef.current)
    window.cancelAnimationFrame(animationRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    void audioRef.current?.close()
  }, [])

  if (!supported) return null
  const active = phase === 'requesting' || phase === 'listening'
  const label = phase === 'requesting' ? 'Requesting microphone access'
    : phase === 'listening' ? 'Stop voice input'
      : phase === 'error' ? errorLabel : 'Start voice input'
  const bars = [0.55, 0.85, 1, 0.7]
  return (
    <button
      type="button" aria-label={label} aria-pressed={phase === 'listening'} title={label}
      onClick={active ? stop : start}
      disabled={disabled}
      style={{
        width: active ? 62 : phase === 'error' ? 124 : 28, height: 28,
        padding: active || phase === 'error' ? '0 8px' : 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: 9999,
        border: `1px solid ${phase === 'error' || active ? '#B85F1F' : 'var(--fw-contrast-09)'}`,
        background: phase === 'listening' ? '#E8853D' : phase === 'error' ? 'rgba(184, 95, 31, 0.18)' : 'var(--fw-contrast-05)',
        color: phase === 'listening' ? '#FFFFFF' : phase === 'error' ? '#E8853D' : 'var(--fw-foreground-muted)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'width 220ms ease, padding 220ms ease, background 150ms ease, color 150ms ease, border-color 150ms ease',
      }}
      onMouseEnter={(event) => { if (!active && phase !== 'error') event.currentTarget.style.color = 'var(--fw-foreground)' }}
      onMouseLeave={(event) => { if (!active && phase !== 'error') event.currentTarget.style.color = 'var(--fw-foreground-muted)' }}
    >
      <Mic size={14} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
      {phase === 'error' ? (
        <span style={{ fontSize: 11, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{errorLabel}</span>
      ) : active && (
        <span aria-hidden="true" style={{ height: 16, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {bars.map((scale, index) => (
            <span key={index} style={{
              width: 2,
              height: phase === 'requesting' ? 4 + index * 2 : 3 + level * 13 * scale,
              minHeight: 3, maxHeight: 16, borderRadius: 9999, background: 'currentColor',
              opacity: phase === 'requesting' ? 0.45 + index * 0.12 : 1,
              transition: 'height 80ms linear',
            }} />
          ))}
        </span>
      )}
    </button>
  )
}
