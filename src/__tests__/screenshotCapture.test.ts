import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import html2canvas from 'html2canvas-pro'
import {
  calculateCaptureRegion,
  captureViewport,
  calculateCaptureScale,
  useScreenshotCapture,
} from '../lib/screenshotCapture'

vi.mock('html2canvas-pro', () => ({
  default: vi.fn(),
}))

function canvasReturning(blob: Blob | null) {
  return {
    toBlob: (callback: BlobCallback) => callback(blob),
  } as HTMLCanvasElement
}

describe('screenshot capture', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.mocked(html2canvas).mockReset()
  })

  it('shares the output cap without upscaling source pixels', () => {
    expect(calculateCaptureScale(400, 200)).toBe(1)
    expect(calculateCaptureScale(1440, 900, 2)).toBeCloseTo(1920 / 1440)
    expect(calculateCaptureScale(900, 2400, 2)).toBe(0.8)
  })

  it('paints the sampled live CSS animation and transition values in the clone', async () => {
    class TestEffect {
      constructor(readonly target: Element | null, readonly pseudoElement: string | null, private readonly frame: object) {}
      getKeyframes() { return [{ offset: 0, computedOffset: 0, easing: 'ease', composite: 'replace', ...this.frame }] }
    }
    const host = document.createElement('div')
    host.innerHTML = '<div id="motion" style="opacity:.55; background-color: red; --phase:.3"></div><div id="widget" data-fw></div><div id="shadow"></div>'
    document.body.append(host)
    const live = host.querySelector<HTMLElement>('#motion')!
    const shadowChild = document.createElement('i')
    host.querySelector('#shadow')!.attachShadow({ mode: 'open' }).append(shadowChild)
    const clone = document.implementation.createHTMLDocument()
    clone.body.innerHTML = '<div id="motion" style="opacity:0; animation: enter 1s"></div><div id="widget"></div>'
    vi.stubGlobal('KeyframeEffect', TestEffect)
    const original = Object.getOwnPropertyDescriptor(document, 'getAnimations')
    Object.defineProperty(document, 'getAnimations', { configurable: true, value: () => [
      { effect: new TestEffect(live, null, { opacity: 0, '--phase': 0 }) },
      { effect: new TestEffect(live, null, { backgroundColor: 'blue' }) },
      { effect: new TestEffect(document.body, null, { opacity: 0 }) },
      { effect: new TestEffect(host.querySelector('#widget'), null, { opacity: 0 }) },
      { effect: new TestEffect(shadowChild, null, { opacity: 0 }) },
      { effect: new TestEffect(live, '::before', { color: 'blue' }) },
      { effect: new TestEffect(null, null, { opacity: 0 }) },
      { effect: null },
    ] })
    // A source element can disappear from the renderer's clone.
    vi.spyOn(clone, 'querySelector').mockImplementation(((selector: string) =>
      selector === 'body' ? null : clone.body.querySelector(selector)) as Document['querySelector'])
    vi.mocked(html2canvas).mockImplementation(async (_root, options) => {
      live.style.opacity = '1'
      await options?.onclone?.(clone, clone.documentElement)
      return canvasReturning(new Blob(['ok']))
    })
    try {
      expect(await captureViewport()).toBeInstanceOf(Blob)
      const copy = clone.querySelector<HTMLElement>('#motion')!
      expect(Number(copy.style.opacity)).toBe(.55)
      expect(copy.style.backgroundColor).toBe('red')
      expect(copy.style.getPropertyValue('--phase')).toBe('.3')
      expect(copy.style.getPropertyPriority('opacity')).toBe('important')
      expect(copy.style.animation).toBe('none')
      expect(copy.style.transition).toBe('none')
      expect(copy.style.color).toBe('')
      expect(clone.querySelector<HTMLElement>('#widget')!.style.opacity).toBe('')
      expect(live.style.opacity).toBe('1')
      expect(live.style.animation).toBe('')
    } finally {
      if (original) Object.defineProperty(document, 'getAnimations', original)
      else Reflect.deleteProperty(document, 'getAnimations')
      host.remove()
    }
  })

  it('uses the full viewport when there is no focused element', () => {
    expect(calculateCaptureRegion(null, 1440, 900)).toEqual({
      left: 0,
      top: 0,
      width: 1440,
      height: 900,
    })
  })

  it('adds a small contextual crop around the focused target', () => {
    expect(calculateCaptureRegion(
      { left: 620, top: 390, width: 200, height: 120 },
      1440,
      900,
    )).toEqual({
      left: 610,
      top: 380,
      width: 220,
      height: 140,
    })
  })

  it('keeps a crop inside the viewport when the target reaches an edge', () => {
    expect(calculateCaptureRegion(
      { left: 1100, top: 700, width: 300, height: 180 },
      1200,
      800,
    )).toEqual({
      left: 1080,
      top: 680,
      width: 120,
      height: 120,
    })
  })

  it('anchors the crop to the nearest edge for an offscreen focus rect', () => {
    expect(calculateCaptureRegion(
      { left: -100, top: 1000, width: 20, height: 20 },
      800,
      600,
    )).toEqual({
      left: 0,
      top: 580,
      width: 20,
      height: 20,
    })
  })

  it('keeps padding around a target in a small viewport', () => {
    expect(calculateCaptureRegion(
      { left: 120, top: 80, width: 20, height: 20 },
      300,
      200,
    )).toEqual({
      left: 110,
      top: 70,
      width: 40,
      height: 40,
    })
  })

  it('captures a padded focus region with page-aware coordinates', async () => {
    const screenshot = new Blob(['x'], { type: 'image/png' })
    vi.mocked(html2canvas).mockResolvedValue(canvasReturning(screenshot))
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1440)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(24)
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(640)
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)

    const blob = await captureViewport({ left: 620, top: 390, width: 200, height: 120 })

    expect(blob).toBeInstanceOf(Blob)
    expect(vi.mocked(html2canvas)).toHaveBeenCalledWith(document.documentElement, expect.objectContaining({
      x: 634,
      y: 1020,
      width: 220,
      height: 140,
      scrollX: 24,
      scrollY: 640,
      windowWidth: 1440,
      windowHeight: 900,
      scale: 2,
    }))
    const options = vi.mocked(html2canvas).mock.calls[0][1]!
    const overlay = document.createElement('div')
    overlay.setAttribute('data-fw', '')
    expect(options.ignoreElements!(overlay)).toBe(true)
    expect(options.ignoreElements!(document.createElement('div'))).toBe(false)
    expect(options.onclone).toBeTypeOf('function')
  })

  it('snapshots crop and scroll before the lazy renderer resolves', async () => {
    let scrollY = 640
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
    vi.mocked(html2canvas).mockResolvedValue(canvasReturning(new Blob(['x'])))

    const pending = captureViewport({ left: 40, top: 100, width: 80, height: 60 })
    scrollY = 990
    await pending

    expect(html2canvas).toHaveBeenCalledWith(document.documentElement, expect.objectContaining({
      scrollY: 640,
      y: 730,
    }))
  })

  it('uses the visible crop bounds while keeping clone layout and scroll coordinates', async () => {
    const viewport = { width: 320, height: 300, offsetLeft: 90, offsetTop: 80, pageLeft: 98, pageTop: 640 } as VisualViewport
    vi.stubGlobal('visualViewport', viewport)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
    vi.mocked(html2canvas).mockResolvedValue(canvasReturning(new Blob(['x'])))

    await captureViewport(new DOMRect(50, 100, 110, 60))

    expect(html2canvas).toHaveBeenCalledWith(document.documentElement, expect.objectContaining({
      x: 98, y: 650, width: 90, height: 80,
      scrollX: 8, scrollY: 560, windowWidth: 390, windowHeight: 844,
    }))
  })

  it('restores smooth and snapped scroll in the clone and scopes flattened shadow CSS', async () => {
    const source = document.createElement('div')
    source.id = 'nested-source'
    const target = document.createElement('span')
    source.appendChild(target)
    document.body.appendChild(source)
    Object.defineProperties(source, {
      scrollHeight: { value: 950 },
      clientHeight: { value: 400 },
      scrollTop: { value: 72 },
    })
    const host = document.createElement('div')
    host.id = 'shadow-host'
    host.attachShadow({ mode: 'open' })
    document.body.appendChild(host)
    const existingRoot = document.createElement('div')
    existingRoot.id = 'existing-root'
    existingRoot.attachShadow({ mode: 'open' })
    const removedScroller = document.createElement('div')
    removedScroller.id = 'removed-scroller'
    Object.defineProperty(removedScroller, 'scrollLeft', { value: 23 })
    document.body.append(existingRoot, removedScroller)
    const detachedScroller = document.createElement('div')
    Object.defineProperty(detachedScroller, 'scrollTop', { value: 31 })
    const scrollingRoot = document.createElement('div')
    Object.defineProperty(scrollingRoot, 'scrollTop', { value: 43 })
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: scrollingRoot })
    const clone = document.implementation.createHTMLDocument()
    clone.body.innerHTML = '<div id="nested-source"></div><div id="shadow-host"><style>p { color: red }</style><p>Shadow</p></div><div id="existing-root"></div>'
    clone.querySelector('#existing-root')!.attachShadow({ mode: 'open' }).textContent = 'Preserved'
    const scroller = clone.querySelector<HTMLElement>('#nested-source')!
    const scrollTo = vi.spyOn(scroller, 'scrollTo').mockImplementation(() => {})
    const windowScroll = vi.fn()
    Object.defineProperty(clone, 'defaultView', { value: { scrollTo: windowScroll, getComputedStyle } })
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(40)
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(170)
    vi.mocked(html2canvas).mockImplementation(async (_, options) => {
      options!.ignoreElements!(source)
      options!.ignoreElements!(host)
      options!.ignoreElements!(existingRoot)
      options!.ignoreElements!(removedScroller)
      options!.ignoreElements!(detachedScroller)
      options!.ignoreElements!(scrollingRoot)
      await options!.onclone!(clone, clone.documentElement)
      return canvasReturning(new Blob(['x']))
    })

    try {
      await captureViewport(target.getBoundingClientRect(), target)
      expect(clone.documentElement.style.scrollBehavior).toBe('auto')
      expect(clone.body.style.scrollSnapType).toBe('none')
      expect(windowScroll).toHaveBeenCalledWith({ left: 40, top: 170, behavior: 'instant' })
      expect(scroller.style.scrollSnapType).toBe('none')
      expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 72, behavior: 'instant' })
      expect(clone.querySelector('style')).toBeNull()
      expect(clone.querySelector('#shadow-host')?.shadowRoot?.querySelector('p')?.textContent).toBe('Shadow')
      expect(clone.querySelector('#existing-root')?.shadowRoot?.textContent).toBe('Preserved')
    } finally {
      Reflect.deleteProperty(document, 'scrollingElement')
      source.remove()
      host.remove()
      existingRoot.remove()
      removedScroller.remove()
    }
  })

  it('normalizes computed multi-keyword ligatures from CSS and inline styles only in the clone', async () => {
    const clone = document.implementation.createHTMLDocument()
    clone.head.innerHTML = '<style>.combined { font-variant-ligatures: common-ligatures contextual }</style>'
    clone.body.innerHTML = [
      '<p class="combined">Office</p>',
      '<p id="inline" style="font-variant-ligatures:no-common-ligatures no-contextual">Office</p>',
      '<p id="single" style="font-variant-ligatures:none">Office</p>',
      '<div id="with-shadow"></div>',
    ].join('')
    clone.querySelector('#with-shadow')!.attachShadow({ mode: 'open' }).innerHTML =
      '<b style="font-variant-ligatures:historical-ligatures contextual">Office</b>'
    clone.body.append(clone.createElementNS('urn:capture-fixture', 'foreign'))
    Object.defineProperty(clone, 'defaultView', { value: { getComputedStyle, scrollTo: vi.fn() } })
    vi.mocked(html2canvas).mockImplementation(async (_, options) => {
      await options!.onclone!(clone, clone.documentElement)
      return canvasReturning(new Blob(['ok']))
    })

    expect(await captureViewport()).toBeInstanceOf(Blob)
    const value = (element: Element) => (element as HTMLElement).style.getPropertyValue('font-variant-ligatures')
    expect(value(clone.querySelector('.combined')!)).toBe('normal')
    expect(value(clone.querySelector('#inline')!)).toBe('no-common-ligatures')
    expect(value(clone.querySelector('#single')!)).toBe('none')
    expect(value(clone.querySelector('#with-shadow')!.shadowRoot!.querySelector('b')!)).toBe('historical-ligatures')
    expect(clone.head.textContent).toContain('common-ligatures contextual')
  })

  it('removes hidden slot content from the clone and preserves visible assignments, fallback and scoped CSS', async () => {
    const live = document.createElement('section')
    live.id = 'slot-fixture'
    live.innerHTML = [
      '<div id="plain-host"></div>',
      '<slot-menu>bare hidden text<span slot="label">Label</span><aside slot="menu">Hidden menu</aside></slot-menu>',
      '<slot-menu id="different-copy"></slot-menu>',
      '<aside><slot-menu></slot-menu></aside>',
    ].join('')
    const host = live.querySelector('slot-menu')!
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = [
      '<style>aside { color: red }</style>',
      '<video></video>',
      '<slot name="menu" style="display:none"></slot>',
      '<slot style="visibility:hidden"></slot>',
      '<slot name="label"></slot>',
      '<slot name="fallback"><b>Fallback</b></slot>',
      '<slot name="hidden-fallback" style="opacity:0">Hidden fallback</slot>',
      '<slot name="ignored" style="content-visibility:hidden"><i data-fw>Widget</i><i data-html2canvas-ignore>Ignored</i><script></script>Hidden</slot>',
      '<div><slot name="nested" style="visibility:collapse">Hidden nested fallback</slot><slot name="visible-nested" style="display:contents"></slot></div>',
    ].join('')
    live.querySelector('#plain-host')!.attachShadow({ mode: 'open' })
    live.querySelector('#different-copy')!.attachShadow({ mode: 'open' }).innerHTML =
      '<slot style="display:none"><em>Hidden</em></slot>'
    const absent = live.querySelector('aside > slot-menu')!
    absent.attachShadow({ mode: 'open' })
    document.body.append(live)
    const clone = document.implementation.createHTMLDocument()
    clone.body.innerHTML = '<section id="slot-fixture"><div id="plain-host"><style>em { color: red }</style><em>Scoped</em></div><div id="cloned-menu">light children</div><div id="different-copy"><strong>Other content</strong></div></section>'
    const copy = clone.querySelector('#cloned-menu')!.attachShadow({ mode: 'open' })
    copy.innerHTML = [
      '<style>aside { color:red }</style>',
      '<canvas></canvas>',
      '<aside slot="menu">Hidden menu</aside>',
      'bare hidden text',
      '<span slot="label">Label</span>',
      '<b>Fallback</b>',
      '<!-- separate adjacent text nodes -->',
      '<div><slot name="nested" style="visibility:collapse">Hidden nested fallback</slot><slot name="visible-nested" style="display:contents"></slot></div>',
    ].join('')
    const comment = copy.childNodes[6]
    comment.before(clone.createTextNode('Hidden fallback'), clone.createTextNode('Hidden'))
    comment.remove()
    Object.defineProperty(clone, 'defaultView', { value: { getComputedStyle, scrollTo: vi.fn() } })
    vi.mocked(html2canvas).mockImplementation(async (_, options) => {
      options!.ignoreElements!(live.querySelector('#plain-host')!)
      options!.ignoreElements!(host)
      options!.ignoreElements!(live.querySelector('#different-copy')!)
      options!.ignoreElements!(absent)
      await options!.onclone!(clone, clone.documentElement)
      return canvasReturning(new Blob(['ok']))
    })
    try {
      expect(await captureViewport()).toBeInstanceOf(Blob)
      expect(copy.querySelector('[slot="menu"]')).toBeNull()
      expect(copy.textContent).not.toMatch(/bare hidden text|Hidden fallback|Hidden nested fallback/)
      expect(copy.querySelector('[slot="label"]')?.textContent).toBe('Label')
      expect(copy.querySelector('b')?.textContent).toBe('Fallback')
      expect(copy.querySelector('slot[name="visible-nested"]')).not.toBeNull()
      expect(copy.querySelector('style')).not.toBeNull()
      expect(copy.querySelector('canvas')).not.toBeNull()
      expect(clone.querySelector('#different-copy')?.shadowRoot?.textContent).toBe('Other content')
      expect(clone.querySelector('#plain-host')?.shadowRoot?.querySelector('em')?.textContent).toBe('Scoped')
      expect(clone.querySelector('style')).toBeNull()
      expect(host.querySelector('aside')?.textContent).toBe('Hidden menu')
    } finally {
      live.remove()
    }
  })

  it('recomputes a moved selection before retrying the screenshot', async () => {
    const element = document.createElement('p')
    let top = 100
    const focus = () => ({ rect: { left: 80, top, width: 90, height: 25 }, element })
    vi.mocked(html2canvas).mockResolvedValue(canvasReturning(new Blob(['x'])))
    const { result } = renderHook(() => useScreenshotCapture())

    await act(async () => { await result.current.capture(focus) })
    top = 240
    await act(async () => { await result.current.capture() })

    expect(html2canvas).toHaveBeenNthCalledWith(1, document.documentElement, expect.objectContaining({ y: 90 }))
    expect(html2canvas).toHaveBeenNthCalledWith(2, document.documentElement, expect.objectContaining({ y: 230 }))
  })

  it.each([
    [80, 30, 750],
    [860, 30, 810],
    [80, 150, 810],
  ])('rebases only a matching clone box (%s × %s)', async (width, height, cropY) => {
    const element = document.createElement('p')
    element.id = 'below-lazy-section'
    document.body.append(element)
    const rect = new DOMRect(40, 120, 80, 30)
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect)
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(700)
    const clone = document.implementation.createHTMLDocument()
    clone.body.innerHTML = '<p id="below-lazy-section"></p>'
    Object.defineProperty(clone, 'defaultView', { value: { scrollX: 0, scrollY: 660, scrollTo: vi.fn(), getComputedStyle } })
    vi.spyOn(clone.querySelector('#below-lazy-section')!, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(40, 100, width, height))
    vi.mocked(html2canvas).mockImplementation(async (_, options) => {
      await options!.onclone!(clone, clone.documentElement)
      expect(options!.y).toBe(cropY)
      return canvasReturning(new Blob(['x']))
    })
    try {
      expect(await captureViewport(rect, element)).toBeInstanceOf(Blob)
    } finally {
      element.remove()
    }
  })

  it('skips a crop when the selected element moves entirely offscreen or disappears', async () => {
    const element = document.createElement('p')
    const focus = vi.fn<() => { rect: DOMRect; element: Element } | null>()
      .mockReturnValueOnce({ rect: new DOMRect(4000, 80, 100, 40), element })
      .mockReturnValueOnce(null)
    const { result } = renderHook(() => useScreenshotCapture())

    await act(async () => { expect(await result.current.capture(focus)).toBeNull() })
    await act(async () => { expect(await result.current.capture()).toBeNull() })
    expect(result.current.status).toBe('failed')
    expect(html2canvas).not.toHaveBeenCalled()
  })

  it('returns null and warns when canvas encoding produces no blob', async () => {
    vi.mocked(html2canvas).mockResolvedValue(canvasReturning(null))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(captureViewport()).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith(
      '[FeedbackWidget] Screenshot capture failed: canvas.toBlob() returned null',
    )
  })

  it('returns null and warns when rendering rejects', async () => {
    const error = new Error('render failed')
    vi.mocked(html2canvas).mockRejectedValue(error)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(captureViewport()).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith('[FeedbackWidget] Screenshot capture failed:', error)
  })

  it('tracks a successful capture and clears it', async () => {
    const screenshot = new Blob(['viewport'], { type: 'image/png' })
    vi.mocked(html2canvas).mockResolvedValue(canvasReturning(screenshot))
    const { result } = renderHook(() => useScreenshotCapture())

    expect(result.current.status).toBe('idle')
    await act(async () => {
      await result.current.capture({ left: 10, top: 20, width: 30, height: 40 })
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.image).toBe(screenshot)

    act(() => result.current.clear())
    expect(result.current.status).toBe('idle')
    expect(result.current.image).toBeNull()
  })

  it('uses an injected capture source for extension screenshots', async () => {
    const screenshot = new Blob(['extension'], { type: 'image/png' })
    const captureSource = vi.fn().mockResolvedValue(screenshot)
    const { result } = renderHook(() => useScreenshotCapture(captureSource))
    const focus = { left: 10, top: 20, width: 30, height: 40 }
    await act(async () => { await result.current.capture(focus) })
    expect(captureSource).toHaveBeenCalledWith(focus)
    expect(result.current.image).toBe(screenshot)
    expect(html2canvas).not.toHaveBeenCalled()
  })

  it('reports a failed capture', async () => {
    vi.mocked(html2canvas).mockResolvedValue(canvasReturning(null))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useScreenshotCapture())

    await act(async () => {
      await result.current.capture()
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.image).toBeNull()
  })

  it('ignores a capture that finishes after it was cleared', async () => {
    const screenshot = new Blob(['late'], { type: 'image/png' })
    let resolveRenderer!: (canvas: HTMLCanvasElement) => void
    vi.mocked(html2canvas).mockReturnValue(new Promise((resolve) => {
      resolveRenderer = resolve
    }))
    const { result } = renderHook(() => useScreenshotCapture())

    let capturePromise!: Promise<Blob | null>
    act(() => {
      capturePromise = result.current.capture()
    })
    expect(result.current.status).toBe('capturing')

    act(() => result.current.clear())
    await act(async () => {
      resolveRenderer(canvasReturning(screenshot))
      await capturePromise
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.image).toBeNull()
  })
})
