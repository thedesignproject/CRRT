import { useEffect, useRef, useState } from 'react'

export function usePillDrag() {
  const [pillPos, setPillPos] = useState({ x: window.innerWidth - 72, y: window.innerHeight - 200 })
  const dragging = useRef(false)
  const didDrag = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const pillRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return
      didDrag.current = true
      const x = Math.max(0, Math.min(window.innerWidth - 48, e.clientX - dragOffset.current.x))
      const y = Math.max(0, Math.min(window.innerHeight - 160, e.clientY - dragOffset.current.y))
      setPillPos({ x, y })
    }
    function onUp() {
      dragging.current = false
    }
    function onResize() {
      setPillPos(prev => ({
        x: Math.max(0, Math.min(window.innerWidth - 48, prev.x)),
        y: Math.max(0, Math.min(window.innerHeight - 160, prev.y)),
      }))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true
    didDrag.current = false
    dragOffset.current = { x: e.clientX - pillPos.x, y: e.clientY - pillPos.y }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  return { pillRef, pillPos, draggingRef: dragging, didDragRef: didDrag, onPointerDown }
}
