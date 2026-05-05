import { useEffect, useRef, useState } from 'react'

export function usePositionSync(active: boolean): void {
  const [, forceUpdate] = useState(0)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    let raf = 0
    const bump = () => {
      if (!activeRef.current) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => forceUpdate(n => n + 1))
    }

    window.addEventListener('scroll', bump, { passive: true })
    window.addEventListener('resize', bump)

    const ro = new ResizeObserver(bump)
    ro.observe(document.body)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', bump)
      window.removeEventListener('resize', bump)
      ro.disconnect()
    }
  }, [])
}
