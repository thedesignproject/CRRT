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
    vi.mocked(html2canvas).mockReset()
  })

  it('shares the output cap without upscaling source pixels', () => {
    expect(calculateCaptureScale(400, 200)).toBe(1)
    expect(calculateCaptureScale(1440, 900, 2)).toBeCloseTo(1920 / 1440)
    expect(calculateCaptureScale(900, 2400, 2)).toBe(0.8)
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
    expect(options.onclone).toBeUndefined()
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
