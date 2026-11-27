import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clientToPagePercent, elementOffset, findPinElement, fromPagePercent, fromPagePercentFixed, pinTargetVisible, toPagePercent } from '../components/FeedbackWidget/coords'

describe('coords', () => {
  let originalScrollWidth: PropertyDescriptor | undefined
  let originalScrollHeight: PropertyDescriptor | undefined

  beforeEach(() => {
    originalScrollWidth = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollWidth')
    originalScrollHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight')
    Object.defineProperty(document.documentElement, 'scrollWidth', { configurable: true, value: 1000 })
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 })
    window.scrollX = 0
    window.scrollY = 0
  })

  afterEach(() => {
    if (originalScrollWidth) Object.defineProperty(document.documentElement, 'scrollWidth', originalScrollWidth)
    if (originalScrollHeight) Object.defineProperty(document.documentElement, 'scrollHeight', originalScrollHeight)
  })

  it('toPagePercent converts pixels to percent of document', () => {
    expect(toPagePercent(250, 500)).toEqual({ x: 25, y: 25 })
  })

  it('fromPagePercent converts percent back to pixels', () => {
    expect(fromPagePercent(25, 25)).toEqual({ pageX: 250, pageY: 500 })
  })

  it('fromPagePercent falls back to pixel coords for legacy rows (>100)', () => {
    expect(fromPagePercent(800, 1500)).toEqual({ pageX: 800, pageY: 1500 })
    expect(fromPagePercent(150, 50)).toEqual({ pageX: 150, pageY: 50 })
    expect(fromPagePercent(50, 150)).toEqual({ pageX: 50, pageY: 150 })
  })

  it('fromPagePercentFixed subtracts current scroll offsets', () => {
    window.scrollX = 100
    window.scrollY = 200
    expect(fromPagePercentFixed(50, 50)).toEqual({ fixedX: 400, fixedY: 800 })
  })

  it('round-trips client coordinates relative to the layout viewport on Safari', () => {
    const viewport = { offsetLeft: 30, offsetTop: 45, pageLeft: 130, pageTop: 445 } as VisualViewport
    vi.stubGlobal('visualViewport', viewport)
    window.scrollX = 130
    window.scrollY = 445
    try {
      expect(clientToPagePercent(150, 100)).toEqual({ x: 25, y: 25 })
      expect(fromPagePercentFixed(25, 25)).toEqual({ fixedX: 150, fixedY: 100 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('computes bounded offsets in the element box', () => {
    const rect = new DOMRect(50, 75, 200, 400)
    expect(elementOffset(rect, 100, 175)).toEqual({ elementX: .25, elementY: .25 })
    expect(elementOffset(new DOMRect(), 0, 0)).toEqual({ elementX: .5, elementY: .5 })
    expect(elementOffset(rect, 0, 999)).toEqual({ elementX: 0, elementY: 1 })
  })

  it('handles an invalid stored selector', () => {
    const query = vi.spyOn(document, 'querySelector').mockImplementation(() => { throw new DOMException() })
    try { expect(findPinElement('[')).toBeNull() } finally { query.mockRestore() }
  })

  it('uses the target box and both axes of overflow clips', () => {
    const panel = document.createElement('div')
    const target = document.createElement('button')
    panel.append(target)
    document.body.append(panel)
    const scrolling = vi.spyOn(document, 'scrollingElement', 'get').mockReturnValue(document.documentElement)
    const hit = vi.fn().mockReturnValue([])
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: hit })
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 100, 100))
    Object.defineProperties(panel, {
      clientWidth: { value: 90 }, clientHeight: { value: 80 }, clientLeft: { value: 5 }, clientTop: { value: 7 },
    })
    const rect = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 40, 40, 40))
    const visible = (fixedX: number, fixedY: number) => pinTargetVisible(target, { fixedX, fixedY })
    try {
      panel.style.overflowX = 'hidden'
      panel.style.overflowY = 'auto'
      expect(visible(40, 50)).toBe(true)
      for (const [x, y] of [[14, 50], [105, 50], [40, 26], [40, 107]]) expect(visible(x, y)).toBe(false)
      for (const [x, y] of [[0, 50], [160, 50], [40, 0], [40, 160]]) {
        rect.mockReturnValue(new DOMRect(x, y, 10, 10))
        expect(visible(40, 50)).toBe(false)
      }
      // Fixed descendants can be hit-tested outside a non-containing ancestor.
      hit.mockReturnValue([target])
      expect(visible(40, 125)).toBe(true)
      rect.mockReturnValue(new DOMRect(30, 40, 40, 40))
      panel.style.overflowX = 'visible'
      panel.style.overflowY = 'visible'
      expect(visible(40, 50)).toBe(true)
      target.style.visibility = 'collapse'
      expect(visible(40, 50)).toBe(false)
      target.style.visibility = 'hidden'
      expect(visible(40, 50)).toBe(false)
      target.style.visibility = 'visible'
      rect.mockReturnValue(new DOMRect())
      expect(visible(40, 50)).toBe(false)
    } finally {
      Reflect.deleteProperty(document, 'elementsFromPoint')
      scrolling.mockRestore()
      panel.remove()
    }
  })
})
