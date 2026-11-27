import { layoutViewportOrigin } from '../../lib/layoutViewport'

export function elementOffset(rect: DOMRect, clientX: number, clientY: number) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  return {
    elementX: rect.width ? clamp((clientX - rect.left) / rect.width) : .5,
    elementY: rect.height ? clamp((clientY - rect.top) / rect.height) : .5,
  }
}

export function findPinElement(selector: string) {
  try { return document.querySelector(selector) } catch { return null }
}

function clipsOverflow(value: string) {
  return value !== '' && value !== 'visible'
}

export function pinTargetVisible(element: Element, { fixedX, fixedY }: { fixedX: number; fixedY: number }) {
  const rect = element.getBoundingClientRect()
  if (!rect.width && !rect.height) return false
  // Closed <details> content keeps a box but is skipped by the browser; checkVisibility sees that.
  if (element.checkVisibility?.() === false) return false
  const style = getComputedStyle(element)
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false

  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.scrollingElement) continue
    const { overflowX, overflowY } = getComputedStyle(parent)
    const clipsX = clipsOverflow(overflowX)
    const clipsY = clipsOverflow(overflowY)
    if (!clipsX && !clipsY) continue
    const bounds = parent.getBoundingClientRect()
    const left = bounds.left + parent.clientLeft
    const top = bounds.top + parent.clientTop
    const right = left + parent.clientWidth
    const bottom = top + parent.clientHeight
    if ((clipsX && (fixedX < left || fixedX >= right || rect.right <= left || rect.left >= right))
      || (clipsY && (fixedY < top || fixedY >= bottom || rect.bottom <= top || rect.top >= bottom))) {
      // Positioned descendants can escape an ancestor's overflow clip.
      return document.elementsFromPoint(fixedX, fixedY).some(hit => element.contains(hit))
    }
  }
  return true
}

export function toPagePercent(pageX: number, pageY: number) {
  const { scrollWidth, scrollHeight } = document.documentElement
  return {
    x: (pageX / scrollWidth) * 100,
    y: (pageY / scrollHeight) * 100,
  }
}

export function clientToPagePercent(clientX: number, clientY: number) {
  const origin = layoutViewportOrigin()
  return toPagePercent(clientX + origin.x, clientY + origin.y)
}

export function fromPagePercent(x: number, y: number) {
  const { scrollWidth, scrollHeight } = document.documentElement
  if (x > 100 || y > 100) {
    return { pageX: x, pageY: y }
  }
  return {
    pageX: (x / 100) * scrollWidth,
    pageY: (y / 100) * scrollHeight,
  }
}

export function fromPagePercentFixed(x: number, y: number) {
  const { pageX, pageY } = fromPagePercent(x, y)
  const origin = layoutViewportOrigin()
  return { fixedX: pageX - origin.x, fixedY: pageY - origin.y }
}
