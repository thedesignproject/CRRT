import { MAX_RECORDING_DURATION_MS } from '../../../shared/record/limits'

// Count recorded time only: permission prompts, countdown and pauses are free.
export function recordingDeadline(onLimit: () => void) {
  let remaining = MAX_RECORDING_DURATION_MS
  let startedAt: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let expired = false
  const expire = () => {
    if (expired) return
    expired = true
    remaining = 0
    onLimit()
  }
  const pause = () => {
    clearTimeout(timer)
    if (startedAt !== null) remaining = Math.max(0, remaining - (performance.now() - startedAt))
    startedAt = null
    if (remaining === 0) expire()
  }
  return {
    pause,
    resume() {
      pause()
      if (remaining === 0) return false
      startedAt = performance.now()
      timer = setTimeout(() => { pause(); expire() }, remaining)
      return true
    },
    stop() {
      clearTimeout(timer)
      startedAt = null
      remaining = 0
      expired = true
    },
  }
}
