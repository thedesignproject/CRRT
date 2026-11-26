import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clientToPage, fromPagePercent, fromPagePercentFixed, pageToFixed, toPagePercent } from '../components/FeedbackWidget/coords'

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
    vi.unstubAllGlobals()
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

  it('clientToPage and pageToFixed are inverse conversions through window scroll', () => {
    window.scrollX = 30
    window.scrollY = 400
    expect(clientToPage(10, 20)).toEqual({ pageX: 40, pageY: 420 })
    expect(pageToFixed(40, 420)).toEqual({ fixedX: 10, fixedY: 20 })
  })

  it('uses the layout viewport origin when the visual viewport is offset (iOS keyboard, zoom)', () => {
    // iOS Safari reports window.scroll* for the visual viewport.
    window.scrollX = 25
    window.scrollY = 400
    vi.stubGlobal('visualViewport', { pageLeft: 25, pageTop: 400, offsetLeft: 5, offsetTop: 150 })
    expect(clientToPage(10, 20)).toEqual({ pageX: 30, pageY: 270 })
    expect(pageToFixed(30, 270)).toEqual({ fixedX: 10, fixedY: 20 })
    expect(fromPagePercentFixed(50, 50)).toEqual({ fixedX: 480, fixedY: 750 })
  })
})
