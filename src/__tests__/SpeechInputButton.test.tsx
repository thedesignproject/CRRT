import { useState } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpeechInputButton, getSpeechSupport } from '../components/FeedbackWidget/voice'

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
  onerror: ((event: Event & { error?: string }) => void) | null = null
  onresult: ((event: RecognitionResultEvent) => void) | null = null
  start = vi.fn(() => {
    if (FakeSpeechRecognition.throwOnStart) throw new Error('not allowed')
    this.onstart?.()
  })
  stop = vi.fn()
  abort = vi.fn()
  constructor() { FakeSpeechRecognition.instances.push(this) }
}

const track = { stop: vi.fn() }
const getTracks = vi.fn(() => [track] as unknown as MediaStreamTrack[])
const stream = { getTracks } as unknown as MediaStream
const analyser = {
  fftSize: 0,
  smoothingTimeConstant: 0,
  frequencyBinCount: 4,
  getByteFrequencyData: vi.fn((samples: Uint8Array) => samples.fill(96)),
}
const source = { connect: vi.fn() }
class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  createAnalyser = vi.fn(() => analyser)
  createMediaStreamSource = vi.fn(() => source)
  close = vi.fn(async () => {})
  constructor() { FakeAudioContext.instances.push(this) }
}

const getUserMedia = vi.fn(async () => stream)
let originalMediaDevices: PropertyDescriptor | undefined
let animationCallback: FrameRequestCallback | undefined

function installSupport(prefixed = false) {
  if (prefixed) {
    vi.stubGlobal('webkitSpeechRecognition', FakeSpeechRecognition)
    vi.stubGlobal('webkitAudioContext', FakeAudioContext)
  } else {
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    vi.stubGlobal('AudioContext', FakeAudioContext)
  }
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
}

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return <><SpeechInputButton value={value} onChange={setValue} /><output>{value}</output></>
}

function resultEvent(results: Array<{ isFinal: boolean; transcript?: string }>, resultIndex = 0) {
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
    originalMediaDevices = Object.getOwnPropertyDescriptor(window.navigator, 'mediaDevices')
    FakeSpeechRecognition.instances = []
    FakeSpeechRecognition.throwOnStart = false
    FakeAudioContext.instances = []
    getUserMedia.mockClear().mockResolvedValue(stream)
    track.stop.mockClear(); getTracks.mockClear()
    analyser.getByteFrequencyData.mockClear(); source.connect.mockClear()
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    animationCallback = undefined
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationCallback = callback
      return 42
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers()
    document.documentElement.removeAttribute('lang')
    if (originalMediaDevices) Object.defineProperty(window.navigator, 'mediaDevices', originalMediaDevices)
    else Reflect.deleteProperty(window.navigator, 'mediaDevices')
  })

  it('hides the control unless speech, audio analysis, and microphone capture are available', () => {
    expect(getSpeechSupport(undefined, undefined)).toBeNull()
    expect(getSpeechSupport(window as never, undefined)).toBeNull()
    Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    expect(getSpeechSupport(window as never, window.navigator.mediaDevices)).toBeNull()
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
    expect(getSpeechSupport(window as never, window.navigator.mediaDevices)).toBeNull()
    expect(render(<Harness />).container.querySelector('button')).toBeNull()
  })

  it('shows requesting feedback, live volume, and appends recognized speech', async () => {
    document.documentElement.lang = 'en-GB'
    installSupport()
    const view = render(<Harness initial="Typed first" />)
    const start = view.getByRole('button', { name: 'Start voice input' })
    fireEvent.mouseEnter(start); expect(start.style.color).toBe('var(--fw-foreground)')
    fireEvent.mouseLeave(start); expect(start.style.color).toBe('var(--fw-foreground-muted)')
    await act(async () => { fireEvent.click(start) })

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    const recognition = FakeSpeechRecognition.instances[0]
    expect(recognition).toMatchObject({ continuous: true, interimResults: true, lang: 'en-GB' })
    expect(source.connect).toHaveBeenCalledWith(analyser)
    expect(analyser.fftSize).toBe(64)
    expect(analyser.smoothingTimeConstant).toBe(0.72)
    const stop = view.getByRole('button', { name: 'Stop voice input' })
    expect(stop).toHaveAttribute('aria-pressed', 'true')
    expect(stop.querySelectorAll('span span')).toHaveLength(4)
    await act(async () => animationCallback?.(1))
    expect(stop.querySelectorAll<HTMLElement>('span span')[2].style.height).toBe('16px')

    act(() => recognition.onresult?.(resultEvent([
      { isFinal: true, transcript: 'spoken words' },
      { isFinal: false, transcript: 'in progress' },
      { isFinal: false },
    ])))
    expect(view.getByRole('status')).toHaveTextContent('Typed first spoken words in progress')
    act(() => recognition.onresult?.(resultEvent([
      { isFinal: true, transcript: 'ignored' },
      { isFinal: true, transcript: 'finished phrase' },
    ], 1)))
    expect(view.getByRole('status')).toHaveTextContent('Typed first spoken words finished phrase')

    fireEvent.mouseEnter(stop); fireEvent.mouseLeave(stop)
    expect(stop.style.color).toBe('#FFFFFF')
    fireEvent.click(stop)
    expect(recognition.stop).toHaveBeenCalledOnce()
    expect(track.stop).toHaveBeenCalled()
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalled()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42)
  })

  it('renders requesting state immediately and cancels a pending permission request', async () => {
    let resolveStream!: (value: MediaStream) => void
    getUserMedia.mockReturnValueOnce(new Promise((resolve) => { resolveStream = resolve }))
    installSupport()
    const view = render(<Harness />)
    fireEvent.click(view.getByRole('button', { name: 'Start voice input' }))
    expect(view.getByRole('button', { name: 'Requesting microphone access' })).toBeVisible()
    fireEvent.click(view.getByRole('button', { name: 'Requesting microphone access' }))
    await act(async () => resolveStream(stream))
    expect(track.stop).toHaveBeenCalled()
    expect(FakeSpeechRecognition.instances).toHaveLength(0)

    let rejectStream!: (error: Error) => void
    getUserMedia.mockReturnValueOnce(new Promise((_, reject) => { rejectStream = reject }))
    fireEvent.click(view.getByRole('button', { name: 'Start voice input' }))
    fireEvent.click(view.getByRole('button', { name: 'Requesting microphone access' }))
    await act(async () => rejectStream(new Error('cancelled request')))
    expect(view.getByRole('button', { name: 'Start voice input' })).toBeVisible()
  })

  it('shows specific temporary feedback when microphone access is blocked', async () => {
    vi.useFakeTimers()
    getUserMedia.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
    installSupport()
    const view = render(<Harness />)
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Start voice input' })) })
    const error = view.getByRole('button', { name: 'Mic blocked here' })
    expect(error).toHaveTextContent('Mic blocked here')
    fireEvent.mouseEnter(error); fireEvent.mouseLeave(error)
    expect(error.style.color).toBe('#E8853D')
    act(() => vi.advanceTimersByTime(2200))
    expect(view.getByRole('button', { name: 'Start voice input' })).toBeVisible()
  })

  it('uses prefixed APIs, locale fallbacks, and handles a recognition start failure', async () => {
    installSupport(true)
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('')
    FakeSpeechRecognition.throwOnStart = true
    const view = render(<Harness />)
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Start voice input' })) })
    expect(FakeSpeechRecognition.instances[0].lang).toBe('en-US')
    expect(view.getByRole('button', { name: 'Mic unavailable' })).toBeVisible()
    expect(track.stop).toHaveBeenCalled()
  })

  it('does nothing if support disappears before start', async () => {
    installSupport()
    const view = render(<Harness />)
    vi.stubGlobal('SpeechRecognition', undefined)
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Start voice input' })) })
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('stops on an external submit signal and ignores stale start/result callbacks', async () => {
    installSupport()
    const onChange = vi.fn()
    const view = render(<SpeechInputButton value="Draft" onChange={onChange} />)
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Start voice input' })) })
    const recognition = FakeSpeechRecognition.instances[0]
    const staleStart = recognition.onstart
    const staleEnd = recognition.onend
    const staleError = recognition.onerror
    const staleResult = recognition.onresult

    view.rerender(<SpeechInputButton value="Draft" onChange={onChange} stopSignal={1} disabled />)
    expect(recognition.stop).toHaveBeenCalledOnce()
    expect(recognition.onstart).toBeNull()
    expect(recognition.onresult).toBeNull()
    expect(track.stop).toHaveBeenCalled()
    expect(view.getByRole('button', { name: 'Start voice input' })).toBeDisabled()

    act(() => {
      staleStart?.()
      staleEnd?.()
      staleError?.({ error: 'network' } as Event & { error: string })
      staleResult?.(resultEvent([{ isFinal: true, transcript: 'late words' }]))
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(view.getByRole('button', { name: 'Start voice input' })).toBeVisible()
  })

  it('releases media on recognition end/error, reports policy blocks, and detaches on unmount', async () => {
    installSupport()
    const view = render(<Harness />)
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Start voice input' })) })
    const first = FakeSpeechRecognition.instances[0]
    const firstStaleError = first.onerror
    act(() => first.onend?.())
    expect(view.getByRole('button', { name: 'Start voice input' })).toBeVisible()
    act(() => firstStaleError?.({ error: 'network' } as Event & { error: string }))
    expect(view.getByRole('button', { name: 'Start voice input' })).toBeVisible()

    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Start voice input' })) })
    const second = FakeSpeechRecognition.instances[1]
    expect(view.getByRole('button', { name: 'Stop voice input' })).toBeVisible()
    act(() => second.onerror?.({ error: 'not-allowed' } as Event & { error: string }))
    expect(view.getByRole('button', { name: 'Mic blocked here' })).toBeVisible()

    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Mic blocked here' })) })
    const active = FakeSpeechRecognition.instances[2]
    view.unmount()
    expect(active.abort).toHaveBeenCalledOnce()
    expect(active.onstart).toBeNull()
    expect(active.onend).toBeNull()
    expect(active.onerror).toBeNull()
    expect(active.onresult).toBeNull()
  })
})
