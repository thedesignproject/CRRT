export function layoutViewportOrigin() {
  const viewport = window.visualViewport
  return viewport
    ? { x: viewport.pageLeft - viewport.offsetLeft, y: viewport.pageTop - viewport.offsetTop }
    : { x: window.scrollX, y: window.scrollY }
}
