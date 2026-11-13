import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startTranscription } from './transcription'
let recognition: MockSpeech
let failConstruction = false
class MockSpeech {
  continuous = false; interimResults = false; lang = ''
  onresult: ((event: { results: { 0: { transcript: string } }[] }) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
  constructor() { if (failConstruction) throw new Error('unavailable'); recognition = this }
}
beforeEach(() => {
  vi.useFakeTimers(); failConstruction = false
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: MockSpeech })
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })
})
afterEach(() => { vi.useRealTimers(); Reflect.deleteProperty(window, 'SpeechRecognition'); Reflect.deleteProperty(window, 'webkitSpeechRecognition') })
const results = (...phrases: string[]) => recognition.onresult!({ results: phrases.map(transcript => ({ 0: { transcript } })) })
it('returns the actual recognized words and accepts corrected interim results without duplicating text', async () => {
  const session = startTranscription(new AbortController().signal)
  expect(recognition.continuous).toBe(true)
  results('Make this heading'); results('Make this heading shorter.', ' Please.')
  const result = await session.finish()
  expect(result).toEqual({ text: 'Make this heading shorter. Please.', status: 'ready', reason: '' })
  expect(recognition.abort).toHaveBeenCalled()
  expect(recognition.onresult).toBeNull()
})
it('restarts after natural speech-service pauses and retains earlier sentences', async () => {
  const session = startTranscription(new AbortController().signal)
  results('First sentence.'); recognition.onend!()
  results('Second sentence.')
  expect(recognition.start).toHaveBeenCalledTimes(2)
  expect((await session.finish()).text).toBe('First sentence. Second sentence.')
})
it('returns unavailable instead of invented words when the browser lacks recognition', async () => {
  Reflect.deleteProperty(window, 'SpeechRecognition')
  expect((await startTranscription(new AbortController().signal).finish()).status).toBe('unavailable')
})
it('supports WebKit recognition and the browser language fallback', async () => {
  Reflect.deleteProperty(window, 'SpeechRecognition')
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: MockSpeech })
  document.documentElement.lang = ''
  const session = startTranscription(new AbortController().signal)
  expect(recognition.lang).toBe(navigator.language)
  document.documentElement.lang = 'en'
  expect((await session.finish()).reason).toContain('No speech was recognized')
})
it('does not break audio capture if recognition cannot be constructed', async () => {
  failConstruction = true
  expect((await startTranscription(new AbortController().signal).finish()).status).toBe('unavailable')
})
it.each(['not-allowed', 'service-not-allowed', 'network'])('reports %s errors without inventing a transcript', async error => {
  const session = startTranscription(new AbortController().signal)
  recognition.onerror!({ error }); recognition.onend!()
  expect(recognition.start).toHaveBeenCalledOnce()
  expect((await session.finish()).status).toBe('unavailable')
})
it('keeps partial recognized text when the service fails', async () => {
  const session = startTranscription(new AbortController().signal)
  results('The part that was recognized.')
  recognition.onerror!({ error: 'network' })
  const result = await session.finish()
  expect(result.status).toBe('partial'); expect(result.text).toBe('The part that was recognized.')
})
it('settles errors that arrive while finalizing', async () => {
  const session = startTranscription(new AbortController().signal)
  recognition.stop.mockImplementation(() => {})
  const promise = session.finish()
  recognition.onerror!({ error: 'network' })
  expect((await promise).status).toBe('unavailable')
})
it('handles a failure restarting recognition', async () => {
  const session = startTranscription(new AbortController().signal)
  results('Recognized words.')
  recognition.start.mockImplementation(() => { throw new Error('busy') })
  recognition.onend!()
  expect((await session.finish()).reason).toContain('stopped early')
})
it('handles a failure starting recognition', async () => {
  class CannotStart extends MockSpeech { start = vi.fn(() => { throw new Error('blocked') }) }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: CannotStart })
  expect((await startTranscription(new AbortController().signal).finish()).reason).toContain('could not start')
})
it('settles if stop throws or abort rejects after ending', async () => {
  const session = startTranscription(new AbortController().signal)
  recognition.stop.mockImplementation(() => { throw new Error('ended') })
  recognition.abort.mockImplementation(() => { throw new Error('ended') })
  expect((await session.finish()).status).toBe('unavailable')
})
it('waits for final speech results but bounds the wait to two seconds', async () => {
  const session = startTranscription(new AbortController().signal)
  recognition.stop.mockImplementation(() => {})
  const promise = session.finish()
  results('Last words.')
  vi.advanceTimersByTime(2000)
  expect((await promise).text).toBe('Last words.')
})
it('aborts the speech service when the take is discarded', async () => {
  const controller = new AbortController()
  const session = startTranscription(controller.signal)
  controller.abort()
  expect(recognition.abort).toHaveBeenCalled()
  expect((await session.finish()).reason).toContain('cancelled')
})
