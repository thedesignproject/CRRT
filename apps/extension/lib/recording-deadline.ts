import { MAX_RECORDING_DURATION_MS } from '../../../shared/record/limits'

// Count recorded time only: permission prompts, countdown and pauses are free.
export function recordingDeadline(onLimit: () => void) {
  let remaining = MAX_RECORDING_DURATION_MS
  let startedAt: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const pause = () => {
    clearTimeout(timer)
    if (startedAt !== null) remaining = Math.max(0, remaining - (performance.now() - startedAt))
    startedAt = null
  }
  return {
    pause,
    resume() {
      if (startedAt !== null || remaining === 0) return
      startedAt = performance.now()
      timer = setTimeout(() => { pause(); remaining = 0; onLimit() }, remaining)
    },
  }
}
