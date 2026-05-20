import { useEffect } from 'react'

/**
 * Writes scroll progress to CSS custom properties on the document root so any
 * element can react to scroll via `var()` without re-rendering. Single
 * listener for the whole page; throttled by `requestAnimationFrame` so we
 * don't thrash style on every wheel tick.
 *
 * Exposes:
 *   --scroll-y           — raw scrollY in pixels (unitless number)
 *   --scroll-progress    — 0..1 fraction across the doc
 *   --scroll-rotate      — derived rotation (deg), 0.4° per scrolled pixel
 *   --hero-fade          — 1..0 opacity for hero, fades over first 480px
 *   --hero-blur          — 0..8 blur amount for hero, same window
 */
export function useScrollProgress() {
  useEffect(() => {
    let raf = 0
    let lastY = -1
    // scrollHeight triggers layout if read inside the scroll handler. Cache
    // it and refresh on resize/ResizeObserver only.
    let maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)

    function update() {
      const y = window.scrollY
      if (y === lastY) return
      lastY = y
      const progress = Math.min(1, y / maxScroll)
      const heroFade = Math.max(0, 1 - y / 480)
      const heroBlur = Math.min(8, y / 60)
      const root = document.documentElement.style
      root.setProperty('--scroll-y', `${y}`)
      root.setProperty('--scroll-progress', `${progress}`)
      root.setProperty('--scroll-rotate', `${y * 0.4}deg`)
      root.setProperty('--hero-fade', `${heroFade}`)
      root.setProperty('--hero-blur', `${heroBlur}px`)
    }
    function onScroll() {
      if (raf) return
      raf = requestAnimationFrame(() => {
        update()
        raf = 0
      })
    }
    function onResize() {
      maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      lastY = -1  // force a recompute since progress depends on maxScroll
      onScroll()
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(document.body)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
    }
  }, [])
}
