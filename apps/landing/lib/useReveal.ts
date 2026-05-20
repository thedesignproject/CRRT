import { useEffect, useRef, useState } from 'react'

/**
 * Adds `is-revealed` to an element the first time it crosses ~20% into the
 * viewport. Pair with `.reveal-on-scroll` in globals.css for a fade + slide-up
 * entrance.
 *
 * Returns: { ref, revealed } — attach ref to the element, the class is also
 * surfaced via `revealed` if you'd rather conditionally apply it inline.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true)
            io.disconnect()
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return { ref, revealed, className: `reveal-on-scroll${revealed ? ' is-revealed' : ''}` }
}
