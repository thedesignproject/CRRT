import { useState } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpeechInputButton, getSpeechRecognition } from '../components/FeedbackWidget/voice'

type RecognitionResultEvent = Event & {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript: string } }>
}

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = []
  static throwOnStart = false
  continuous = false
  interimResults = false
  lang = ''
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  onresult: ((event: RecognitionResultEvent) => void) | null = null
  start = vi.fn(() => {
    if (FakeSpeechRecognition.throwOnStart) throw new Error('not allowed')
    this.onstart?.()
  })
  stop = vi.fn()
  abort = vi.fn()

  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }
}

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <SpeechInputButton value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  )
}

function resultEvent(
  results: Array<{ isFinal: boolean; transcript?: string }>,
  resultIndex = 0,
): RecognitionResultEvent {
  return {
    resultIndex,
    results: results.map(({ isFinal, transcript }) => ({
      isFinal,
      ...(transcript === undefined ? {} : { 0: { transcript } }),
    })),
  } as unknown as RecognitionResultEvent
}

describe('<SpeechInputButton />', () => {
  beforeEach(() => {
    FakeSpeechRecognition.instances = []
    FakeSpeechRecognition.throwOnStart = false
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('lang')
  })

  it('does not render when the browser has no speech recognition API', () => {
    expect(getSpeechRecognition(undefined)).toBeNull()
    const { container } = render(<Harness />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('uses browser recognition to append final and interim speech to the draft', () => {
    document.documentElement.lang = 'en-GB'
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    const { getByRole } = render(<Harness initial="Typed first" />)

    const start = getByRole('button', { name: 'Start voice input' })
    fireEvent.mouseEnter(start)
    expect(start.style.color).toBe('var(--fw-foreground)')
    fireEvent.mouseLeave(start)
    expect(start.style.color).toBe('var(--fw-foreground-muted)')
    fireEvent.click(start)

    const recognition = FakeSpeechRecognition.instances[0]
    expect(recognition.continuous).toBe(true)
    expect(recognition.interimResults).toBe(true)
    expect(recognition.lang).toBe('en-GB')
    expect(recognition.start).toHaveBeenCalledOnce()

    act(() => recognition.onresult?.(resultEvent([
      { isFinal: true, transcript: 'spoken words' },
      { isFinal: false, transcript: 'in progress' },
      { isFinal: false },
    ])))
    expect(getByRole('status').textContent).toBe('Typed first spoken words in progress')

    act(() => recognition.onresult?.(resultEvent([
      { isFinal: true, transcript: 'ignored earlier result' },
      { isFinal: true, transcript: 'finished phrase' },
    ], 1)))
    expect(getByRole('status').textContent).toBe('Typed first spoken words finished phrase')

    const stop = getByRole('button', { name: 'Stop voice input' })
    expect(stop).toHaveAttribute('aria-pressed', 'true')
    fireEvent.mouseEnter(stop)
    expect(stop.style.color).toBe('#FFFFFF')
    fireEvent.mouseLeave(stop)
    expect(stop.style.color).toBe('#FFFFFF')
    fireEvent.click(stop)
    expect(recognition.stop).toHaveBeenCalledOnce()
    expect(getByRole('button', { name: 'Start voice input' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('falls back to the prefixed API and navigator language', () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeSpeechRecognition)
    const { getByRole } = render(<Harness />)
    fireEvent.click(getByRole('button', { name: 'Start voice input' }))
    expect(FakeSpeechRecognition.instances[0].lang).toBe(navigator.language)
  })

  it('uses the default locale when the document and browser do not provide one', () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('')
    const { getByRole } = render(<Harness />)
    fireEvent.click(getByRole('button', { name: 'Start voice input' }))
    expect(FakeSpeechRecognition.instances[0].lang).toBe('en-US')
  })

  it('does nothing if browser support disappears before the user starts', () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    const { getByRole } = render(<Harness />)
    vi.stubGlobal('SpeechRecognition', undefined)
    fireEvent.click(getByRole('button', { name: 'Start voice input' }))
    expect(FakeSpeechRecognition.instances).toHaveLength(0)
  })

  it('returns to idle when recognition ends or errors and ignores stale callbacks', () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    const { getByRole } = render(<Harness />)
    fireEvent.click(getByRole('button', { name: 'Start voice input' }))
    const first = FakeSpeechRecognition.instances[0]
    act(() => first.onend?.())
    expect(getByRole('button', { name: 'Start voice input' })).not.toBeNull()

    fireEvent.click(getByRole('button', { name: 'Start voice input' }))
    const second = FakeSpeechRecognition.instances[1]
    act(() => first.onerror?.())
    expect(getByRole('button', { name: 'Stop voice input' })).not.toBeNull()
    act(() => second.onerror?.())
    expect(getByRole('button', { name: 'Start voice input' })).not.toBeNull()
  })

  it('handles a synchronous start failure and aborts active recognition on unmount', () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    FakeSpeechRecognition.throwOnStart = true
    const firstRender = render(<Harness />)
    fireEvent.click(firstRender.getByRole('button', { name: 'Start voice input' }))
    expect(firstRender.getByRole('button', { name: 'Start voice input' })).not.toBeNull()
    firstRender.unmount()

    FakeSpeechRecognition.throwOnStart = false
    const secondRender = render(<Harness />)
    fireEvent.click(secondRender.getByRole('button', { name: 'Start voice input' }))
    const active = FakeSpeechRecognition.instances[FakeSpeechRecognition.instances.length - 1]
    secondRender.unmount()
    expect(active.abort).toHaveBeenCalledOnce()
  })
})
