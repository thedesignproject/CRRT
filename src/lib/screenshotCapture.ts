import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_CAPTURE_EDGE = 1920
const CAPTURE_PADDING = 10

function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export type ScreenshotCaptureStatus = 'idle' | 'capturing' | 'ready' | 'failed'

export interface ScreenshotFocusRect {
  left: number
  top: number
  width: number
  height: number
}

export interface ScreenshotCaptureRegion {
  left: number
  top: number
  width: number
  height: number
}

function centeredRegion(
  start: number,
  size: number,
  viewportSize: number,
) {
  const visibleStart = clamp(start, 0, viewportSize)
  const visibleEnd = clamp(start + size, 0, viewportSize)
  const visibleSize = Math.max(0, visibleEnd - visibleStart)
  const regionSize = Math.min(
    viewportSize,
    visibleSize + CAPTURE_PADDING * 2,
  )
  const center = visibleSize > 0
    ? visibleStart + visibleSize / 2
    : clamp(start, 0, viewportSize)

  return {
    start: clamp(center - regionSize / 2, 0, viewportSize - regionSize),
    size: regionSize,
  }
}

export function calculateCaptureRegion(
  focus: ScreenshotFocusRect | null,
  viewportWidth: number,
  viewportHeight: number,
): ScreenshotCaptureRegion {
  if (!focus) {
    return { left: 0, top: 0, width: viewportWidth, height: viewportHeight }
  }

  const horizontal = centeredRegion(
    focus.left,
    focus.width,
    viewportWidth,
  )
  const vertical = centeredRegion(
    focus.top,
    focus.height,
    viewportHeight,
  )

  return {
    left: horizontal.start,
    top: vertical.start,
    width: horizontal.size,
    height: vertical.size,
  }
}

// Both renderers preserve source resolution while limiting the longest output edge.
export function calculateCaptureScale(width: number, height: number, sourceScale = 1) {
  return Math.min(sourceScale, MAX_CAPTURE_EDGE / Math.max(width, height))
}

export async function captureViewport(
  focus: ScreenshotFocusRect | null = null,
): Promise<Blob | null> {
  try {
    const { default: html2canvas } = await import('html2canvas-pro')
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const region = calculateCaptureRegion(focus, viewportWidth, viewportHeight)
    const scale = calculateCaptureScale(region.width, region.height, window.devicePixelRatio)
    const canvas = await html2canvas(document.documentElement, {
      useCORS: true,
      logging: false,
      scale,
      x: window.scrollX + region.left,
      y: window.scrollY + region.top,
      width: region.width,
      height: region.height,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      windowWidth: viewportWidth,
      windowHeight: viewportHeight,
      ignoreElements: (node) => node.hasAttribute('data-fw'),
    })
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) {
      console.warn('[FeedbackWidget] Screenshot capture failed: canvas.toBlob() returned null')
    }
    return blob
  } catch (error) {
    console.warn('[FeedbackWidget] Screenshot capture failed:', error)
    return null
  }
}

export function useScreenshotCapture(captureSource: (focus: ScreenshotFocusRect | null) => Promise<Blob | null> = captureViewport) {
  const [image, setImage] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<ScreenshotCaptureStatus>('idle')
  const captureIdRef = useRef(0)
  const lastFocusRef = useRef<ScreenshotFocusRect | null>(null)

  useEffect(() => {
    if (!image) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(image)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  const capture = useCallback(async (focus?: ScreenshotFocusRect) => {
    if (focus) lastFocusRef.current = focus
    const captureId = ++captureIdRef.current
    setImage(null)
    setStatus('capturing')

    const blob = await captureSource(lastFocusRef.current)
    if (captureId !== captureIdRef.current) return null

    setImage(blob)
    setStatus(blob ? 'ready' : 'failed')
    return blob
  }, [captureSource])

  const clear = useCallback(() => {
    captureIdRef.current += 1
    lastFocusRef.current = null
    setImage(null)
    setStatus('idle')
  }, [])

  const toBase64 = useCallback(async (): Promise<{ base64: string; mimeType: string } | null> => {
    if (!image) return null
    return { base64: await fileToBase64(image), mimeType: image.type }
  }, [image])

  return { image, previewUrl, status, capture, clear, toBase64 }
}
