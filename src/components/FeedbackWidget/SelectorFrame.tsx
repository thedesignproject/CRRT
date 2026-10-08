import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { WIDGET_ATTR } from './constants'

type SelectorFrameState = {
  element: Element | null
  left: number
  top: number
  width: number
  height: number
  visible: boolean
  animateGeometry: boolean
}

const EMPTY_FRAME: SelectorFrameState = {
  element: null,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  visible: false,
  animateGeometry: false,
}

type CaretPositionDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

function textNodeAtPoint(x: number, y: number): Node | null {
  const doc = document as CaretPositionDocument
  if (typeof doc.caretPositionFromPoint === 'function') {
    return doc.caretPositionFromPoint(x, y)?.offsetNode ?? null
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y)?.startContainer ?? null
  }
  return null
}

function isTextAtPoint(x: number, y: number): boolean {
  const node = textNodeAtPoint(x, y)
  if (!node || node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? '').trim()) return false
  const range = document.createRange()
  range.selectNodeContents(node)
  return Array.from(range.getClientRects()).some((rect) => (
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  ))
}

function sameGeometry(previous: SelectorFrameState, element: Element, rect: DOMRect) {
  return previous.visible
    && previous.element === element
    && previous.left === rect.left - 2
    && previous.top === rect.top - 2
    && previous.width === rect.width + 4
    && previous.height === rect.height + 4
}

export function SelectorFrame({ active, onTextHover }: { active: boolean; onTextHover(value: boolean): void }) {
  const [frame, setFrame] = useState<SelectorFrameState>(EMPTY_FRAME)
  const currentFrame = useRef<SelectorFrameState>(EMPTY_FRAME)
  const candidate = useRef<Element | null>(null)
  const point = useRef({ x: 0, y: 0 })
  const pendingGeometryMotion = useRef(false)

  useEffect(() => {
    if (!active) {
      candidate.current = null
      pendingGeometryMotion.current = false
      onTextHover(false)
      if (currentFrame.current.visible || currentFrame.current.element) {
        currentFrame.current = EMPTY_FRAME
        setFrame(EMPTY_FRAME)
      }
      return
    }

    let raf = 0
    const candidateResize = new ResizeObserver(() => schedule(false))
    const pageResize = new ResizeObserver(() => schedule(false))

    function hide() {
      candidateResize.disconnect()
      candidate.current = null
      pendingGeometryMotion.current = false
      onTextHover(false)
      if (currentFrame.current.visible) {
        const next = { ...currentFrame.current, element: null, visible: false, animateGeometry: false }
        currentFrame.current = next
        setFrame(next)
      }
    }

    function measure() {
      raf = 0
      const element = candidate.current
      if (!element || !element.isConnected || element.closest(`[${WIDGET_ATTR}]`)) {
        hide()
        return
      }
      const visibility = getComputedStyle(element).visibility
      if (visibility === 'hidden' || visibility === 'collapse') {
        hide()
        return
      }
      const rect = element.getBoundingClientRect()
      onTextHover(isTextAtPoint(point.current.x, point.current.y))
      if (rect.width <= 0 || rect.height <= 0) {
        hide()
        return
      }
      const animateGeometry = pendingGeometryMotion.current
      pendingGeometryMotion.current = false
      // ResizeObserver misses transforms and position-only layout changes.
      // Track the hovered target each frame, without committing unchanged geometry.
      schedule(false)
      if (sameGeometry(currentFrame.current, element, rect)) return
      const next = {
        element,
        left: rect.left - 2,
        top: rect.top - 2,
        width: rect.width + 4,
        height: rect.height + 4,
        visible: true,
        animateGeometry,
      }
      currentFrame.current = next
      setFrame(next)
    }

    function schedule(animateGeometry: boolean) {
      pendingGeometryMotion.current ||= animateGeometry
      if (!raf) raf = requestAnimationFrame(measure)
    }

    function onMove(event: MouseEvent) {
      const element = event.target instanceof Element && !event.target.closest(`[${WIDGET_ATTR}]`)
        ? event.target
        : null
      point.current = { x: event.clientX, y: event.clientY }
      if (element !== candidate.current) {
        const animateGeometry = candidate.current !== null && element !== null
        candidate.current = element
        candidateResize.disconnect()
        if (element) candidateResize.observe(element)
        schedule(animateGeometry)
      } else {
        schedule(false)
      }
    }

    const syncGeometry = () => schedule(false)
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('resize', syncGeometry, { passive: true })
    document.addEventListener('scroll', syncGeometry, { passive: true, capture: true })
    window.visualViewport?.addEventListener('resize', syncGeometry, { passive: true })
    window.visualViewport?.addEventListener('scroll', syncGeometry, { passive: true })
    pageResize.observe(document.body)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', syncGeometry)
      document.removeEventListener('scroll', syncGeometry, { capture: true })
      window.visualViewport?.removeEventListener('resize', syncGeometry)
      window.visualViewport?.removeEventListener('scroll', syncGeometry)
      candidateResize.disconnect()
      pageResize.disconnect()
    }
  }, [active, onTextHover])

  const transition = frame.animateGeometry
    ? 'transform var(--crrt-selector-motion-duration) var(--crrt-selector-motion-easing), width var(--crrt-selector-motion-duration) var(--crrt-selector-motion-easing), height var(--crrt-selector-motion-duration) var(--crrt-selector-motion-easing), opacity var(--crrt-selector-opacity-duration) ease'
    : 'opacity var(--crrt-selector-opacity-duration) ease'
  const style: CSSProperties = {
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 2147483645,
    width: frame.width,
    height: frame.height,
    transform: `translate3d(${frame.left}px, ${frame.top}px, 0)`,
    opacity: frame.visible ? 1 : 0,
    boxSizing: 'border-box',
    border: '2px solid rgba(232, 133, 61, 0.72)',
    borderRadius: 'var(--crrt-radius-sm, 4px)',
    boxShadow: '0 0 0 1px rgba(10, 10, 10, 0.18), 0 8px 24px rgba(232, 133, 61, 0.10)',
    transition,
    pointerEvents: 'none',
    willChange: 'transform, width, height, opacity',
  }

  return <div {...{ [WIDGET_ATTR]: '' }} className="fw-selector-frame" data-fw-selector-frame="" aria-hidden="true" style={style} />
}
