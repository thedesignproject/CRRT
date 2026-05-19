import { useEffect, useState } from 'react'
import { CRRT_CARROT_LOGO_URL } from '@widget/components/FeedbackWidget/constants'

/**
 * Konami-style easter egg — type "crrt" anywhere on the page and a matrix
 * rain of pixel carrots showers down for 3 seconds.
 *
 * Listens for keydown at the window level (skips typing in inputs/textareas),
 * keeps a small rolling buffer of recent keys, and fires when the buffer ends
 * with the trigger sequence.
 */
const TRIGGER = 'crrt'
const RAIN_DURATION_MS = 3000
const CARROT_COUNT = 36

type Drop = {
  id: number
  left: number       // viewport % horizontal
  delay: number      // ms before this carrot starts falling
  duration: number   // ms total fall time
  size: number       // px width/height
  drift: number      // px horizontal sway target
  spin: number       // degrees of total rotation
}

function generateDrops(): Drop[] {
  return Array.from({ length: CARROT_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 800,
    duration: 1800 + Math.random() * 1400,
    size: 28 + Math.floor(Math.random() * 36),
    drift: (Math.random() - 0.5) * 80,
    spin: (Math.random() - 0.5) * 720,
  }))
}

export function EasterEgg() {
  const [active, setActive] = useState(false)
  const [drops, setDrops] = useState<Drop[]>([])

  useEffect(() => {
    let buffer = ''
    let timer = 0
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return
      if (e.key.length !== 1) return
      buffer = (buffer + e.key.toLowerCase()).slice(-TRIGGER.length)
      if (buffer === TRIGGER) {
        setDrops(generateDrops())
        setActive(true)
        if (timer) window.clearTimeout(timer)
        timer = window.setTimeout(() => setActive(false), RAIN_DURATION_MS)
        buffer = ''
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  if (!active) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {drops.map((d) => (
        <img
          key={d.id}
          src={CRRT_CARROT_LOGO_URL}
          alt=""
          style={{
            position: 'absolute',
            top: -80,
            left: `${d.left}vw`,
            width: d.size,
            height: d.size,
            imageRendering: 'pixelated',
            // Custom property pipes the drift + spin values into the keyframe.
            // (Set as CSS vars so we can declare the keyframe once globally.)
            ['--drift' as string]: `${d.drift}px`,
            ['--spin' as string]: `${d.spin}deg`,
            animation: `crrt-rain ${d.duration}ms cubic-bezier(0.55, 0.06, 0.68, 0.19) ${d.delay}ms forwards`,
            filter: 'drop-shadow(0 4px 8px rgba(232, 133, 61, 0.35))',
          }}
        />
      ))}
    </div>
  )
}
