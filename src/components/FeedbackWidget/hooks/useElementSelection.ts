import { useEffect, useState } from 'react'
import { getSelector } from '../../../lib/getSelector'
import { WIDGET_ATTR } from '../constants'
import { toPagePercent } from '../coords'
import type { ClickTarget, Mode } from '../types'

interface UseElementSelectionArgs {
  mode: Mode
  onPick: (target: ClickTarget, el: HTMLElement) => void
}

export function useElementSelection({ mode, onPick }: UseElementSelectionArgs) {
  const [hovered, setHovered] = useState<Element | null>(null)

  useEffect(() => {
    if (mode !== 'selecting') return
    const prev = document.body.style.cursor
    document.body.style.cursor = 'crosshair'
    return () => {
      document.body.style.cursor = prev
    }
  }, [mode])

  useEffect(() => {
    if (mode !== 'selecting') {
      setHovered(null)
      return
    }

    function onMove(e: MouseEvent) {
      const el = e.target as HTMLElement
      if (el && !el.closest?.(`[${WIDGET_ATTR}]`)) {
        setHovered(el)
      } else {
        setHovered(null)
      }
    }

    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [mode])

  useEffect(() => {
    if (!hovered) return
    const el = hovered as HTMLElement
    const prev = el.style.outline
    const prevOffset = el.style.outlineOffset
    el.style.outline = '2px solid rgba(59, 130, 246, 0.6)'
    el.style.outlineOffset = '2px'
    return () => {
      el.style.outline = prev
      el.style.outlineOffset = prevOffset
    }
  }, [hovered])

  useEffect(() => {
    if (mode !== 'selecting') return

    function onClick(e: MouseEvent) {
      const el = e.target as HTMLElement
      if (el.closest?.(`[${WIDGET_ATTR}]`)) return

      e.preventDefault()
      e.stopPropagation()

      const pct = toPagePercent(e.pageX, e.pageY)
      onPick({
        selector: getSelector(el),
        x: pct.x,
        y: pct.y,
        url: window.location.href,
      }, el)
    }

    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [mode, onPick])
}
