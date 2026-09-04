import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'

type SpeechAlternative = { transcript: string }
type SpeechResult = { readonly isFinal: boolean; readonly 0?: SpeechAlternative }
type SpeechResultEvent = Event & {
  readonly resultIndex: number
  readonly results: ArrayLike<SpeechResult>
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance
type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export function getSpeechRecognition(speechWindow: SpeechWindow | undefined): SpeechRecognitionConstructor | null {
  if (!speechWindow) return null
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

function currentWindow() {
  return (globalThis as { window?: SpeechWindow }).window
}

function joinTranscript(...parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join(' ')
}

export function SpeechInputButton({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [supported] = useState(() => getSpeechRecognition(currentWindow()) !== null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const valueRef = useRef(value)
  const baseTextRef = useRef('')
  const finalTextRef = useRef('')

  useEffect(() => {
    valueRef.current = value
  }, [value])

  const release = useCallback((recognition: SpeechRecognitionInstance) => {
    if (recognitionRef.current !== recognition) return
    recognitionRef.current = null
    setListening(false)
  }, [])

  const stop = useCallback(() => {
    const recognition = recognitionRef.current!
    recognition.stop()
    release(recognition)
  }, [release])

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition(currentWindow())
    if (!Recognition) return

    const recognition = new Recognition()
    recognitionRef.current = recognition
    baseTextRef.current = valueRef.current
    finalTextRef.current = ''
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = document.documentElement.lang || navigator.language || 'en-US'
    recognition.onstart = () => setListening(true)
    recognition.onend = () => release(recognition)
    recognition.onerror = () => release(recognition)
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result?.[0]?.transcript ?? ''
        if (result?.isFinal) finalText = joinTranscript(finalText, transcript)
        else interimText = joinTranscript(interimText, transcript)
      }
      finalTextRef.current = joinTranscript(finalTextRef.current, finalText)
      onChange(joinTranscript(baseTextRef.current, finalTextRef.current, interimText))
    }

    try {
      recognition.start()
      setListening(true)
    } catch {
      release(recognition)
    }
  }, [onChange, release])

  useEffect(() => () => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
  }, [])

  if (!supported) return null

  const label = listening ? 'Stop voice input' : 'Start voice input'
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={listening}
      title={label}
      onClick={listening ? stop : start}
      style={{
        width: 28,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9999,
        border: `1px solid ${listening ? '#B85F1F' : 'var(--fw-contrast-09)'}`,
        background: listening ? '#E8853D' : 'var(--fw-contrast-05)',
        color: listening ? '#FFFFFF' : 'var(--fw-foreground-muted)',
        cursor: 'pointer',
        transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
      }}
      onMouseEnter={(event) => {
        if (!listening) event.currentTarget.style.color = 'var(--fw-foreground)'
      }}
      onMouseLeave={(event) => {
        if (!listening) event.currentTarget.style.color = 'var(--fw-foreground-muted)'
      }}
    >
      <Mic size={14} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
