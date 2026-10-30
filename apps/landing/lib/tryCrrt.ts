import type { MouseEvent } from 'react'

export function tryCrrt(event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
  const demo = document.getElementById('try-crrt')
  if (!demo) return
  event.preventDefault()
  demo.scrollIntoView({ behavior: 'instant', block: 'start' })
  demo.focus({ preventScroll: true })
  // Activate after the CTA click has finished, so it cannot become the target.
  window.setTimeout(() => window.dispatchEvent(new Event('crrt:activate')), 0)
}
