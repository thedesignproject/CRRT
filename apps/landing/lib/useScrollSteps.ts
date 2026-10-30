import { useEffect, useState, type RefObject } from 'react'

/**
 * Pinned scroll stories: measures how far the viewport has travelled through
 * a tall track and returns which of `steps` equal slices the reader is in.
 *
 * A hard flick can cross every slice in one frame, so the shown step walks
 * toward the scrolled one a single step at a time, holding each for `dwell`
 * ms: the story plays in order instead of jumping from the first beat to the
 * last. The 0..1 progress written to `property` is kept inside the shown
 * step's slice, so CSS that scrubs with it never runs ahead of the scene.
 *
 * The last step also owns `hold` extra slices at the end of the track, so it
 * stays pinned long enough to land and be seen before the section scrolls on.
 */
export function useScrollSteps(ref: RefObject<HTMLElement | null>, steps: number, property: string, dwell: number, hold: number) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const element = ref.current!
    let frame = 0
    let timer = 0
    let position = 0
    let target = 0
    let shown = -1
    const write = () => element.style.setProperty(property, (Math.min(Math.max(position, shown), shown + 1) / steps).toFixed(4))
    const show = (next: number) => {
      shown = next
      setStep(next)
      write()
    }
    const walk = () => {
      timer = 0
      if (shown === target) return
      show(shown + Math.sign(target - shown))
      timer = window.setTimeout(walk, dwell)
    }
    const update = () => {
      frame = 0
      const rect = element.getBoundingClientRect()
      const range = rect.height - window.innerHeight
      position = (steps + hold) * (range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0)
      target = Math.min(steps - 1, Math.floor(position))
      if (shown < 0) show(target)
      else if (!timer) walk()
      write()
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [ref, steps, property, dwell, hold])
  return step
}
