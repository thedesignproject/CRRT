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
  return { fixedX: pageX - window.scrollX, fixedY: pageY - window.scrollY }
}
