// Pin coordinate model.
//
// Pins are stored as percentages of the document's scroll size. In memory a pin
// is a document ("page") point. Converting it for `position: fixed` happens once,
// at render, in `pageToFixed`. Pointer and rect readings (client coordinates) enter
// the page space through `clientToPage`. Nothing else should add or subtract
// scroll offsets.
//
// Both conversions use the layout viewport's page offset. `position: fixed` and
// client rects are relative to the layout viewport, but iOS Safari reports
// `window.scrollX/Y` for the visual viewport, which moves on its own when the
// keyboard opens or closes, the toolbar resizes, or the page is zoomed. Subtracting
// `window.scrollY` there draws pins off by `visualViewport.offsetTop`.
function layoutViewportOffset() {
  const viewport = window.visualViewport
  if (!viewport) return { x: window.scrollX, y: window.scrollY }
  return { x: viewport.pageLeft - viewport.offsetLeft, y: viewport.pageTop - viewport.offsetTop }
}

export function clientToPage(clientX: number, clientY: number) {
  const offset = layoutViewportOffset()
  return { pageX: clientX + offset.x, pageY: clientY + offset.y }
}

export function pageToFixed(pageX: number, pageY: number) {
  const offset = layoutViewportOffset()
  return { fixedX: pageX - offset.x, fixedY: pageY - offset.y }
}

export function toPagePercent(pageX: number, pageY: number) {
  const { scrollWidth, scrollHeight } = document.documentElement
  return {
    x: (pageX / scrollWidth) * 100,
    y: (pageY / scrollHeight) * 100,
  }
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
  return pageToFixed(pageX, pageY)
}
