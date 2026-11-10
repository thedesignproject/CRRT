import { afterEach, expect, it, vi } from 'vitest'
import { recordingDeadline } from './recording-deadline'
import { MAX_RECORDING_DURATION_MS } from '../../../shared/record/limits'
import { initialRecorderState, recorderReducer } from './recording'
import { manifestSchema } from '../../../shared/record/contracts'

afterEach(() => vi.useRealTimers())

it('expires once at five minutes of active recording, excluding countdown and pauses', () => {
  vi.useFakeTimers()
  const limit = vi.fn(), deadline = recordingDeadline(limit)
  vi.advanceTimersByTime(10_000)
  deadline.pause()
  deadline.resume(); deadline.resume()
  vi.advanceTimersByTime(120_000)
  deadline.pause()
  vi.advanceTimersByTime(600_000)
  expect(limit).not.toHaveBeenCalled()
  deadline.resume()
  vi.advanceTimersByTime(179_999)
  expect(limit).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(limit).toHaveBeenCalledOnce()
  deadline.resume()
  vi.advanceTimersByTime(300_000)
  expect(limit).toHaveBeenCalledOnce()
})

it('cancels the deadline when capture stops early', () => {
  vi.useFakeTimers()
  const limit = vi.fn(), deadline = recordingDeadline(limit)
  deadline.resume(); deadline.pause()
  vi.advanceTimersByTime(MAX_RECORDING_DURATION_MS)
  expect(limit).not.toHaveBeenCalled()
})

it('keeps the final timeline inside the upload limit even if a timer callback is late', () => {
  let state = recorderReducer(initialRecorderState, { type: 'countdown.started' })
  state = recorderReducer(state, { type: 'recording.started', now: 0 })
  state = recorderReducer(state, { type: 'recording.finished', now: MAX_RECORDING_DURATION_MS + 123 })
  expect(state.durationMs).toBe(300_000)
  const manifest = { version: 'record.v1', durationMs: state.durationMs, artifacts: [{ id: crypto.randomUUID(), kind: 'screen', mime: 'video/webm', bytes: 1, sha256: 'a'.repeat(64), offsetMs: 0 }], events: [] }
  expect(manifestSchema.safeParse(manifest).success).toBe(true)
  expect(manifestSchema.safeParse({ ...manifest, durationMs: 300_001 }).success).toBe(false)
})

it.each(['pause', 'resume'] as const)('expires when %s discovers the limit before a delayed timer fires', action => {
  vi.useFakeTimers()
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  const limit = vi.fn(), deadline = recordingDeadline(limit)
  expect(deadline.resume()).toBe(true)
  now.mockReturnValue(MAX_RECORDING_DURATION_MS + 1)
  deadline[action]()
  expect(limit).toHaveBeenCalledOnce()
  expect(deadline.resume()).toBe(false)
  deadline.pause()
  vi.advanceTimersByTime(MAX_RECORDING_DURATION_MS)
  expect(limit).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  now.mockRestore()
})

it('stops without invoking limit recovery and cannot restart after stopping', () => {
  vi.useFakeTimers()
  const limit = vi.fn(), deadline = recordingDeadline(limit)
  deadline.resume()
  deadline.stop()
  expect(deadline.resume()).toBe(false)
  vi.advanceTimersByTime(MAX_RECORDING_DURATION_MS)
  expect(limit).not.toHaveBeenCalled()
})
