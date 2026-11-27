import { useCallback, useEffect, useRef, useState } from 'react'
import { getSelector } from './getSelector'
import { layoutViewportOrigin } from './layoutViewport'
import { applyAnimationStyles, sampleAnimationStyles } from './screenshotAnimations'
import { normalizeCloneLigatures, restoreCloneShadows } from './screenshotClone'

const MAX_CAPTURE_EDGE = 1920
const CAPTURE_PADDING = 10
const CLONE_BOX_TOLERANCE = 2

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

type CaptureFocus = ScreenshotFocusRect | (() => { rect: ScreenshotFocusRect; element: Element } | null)

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
  element?: Element,
): Promise<Blob | null> {
  try {
    // A cold import can finish after the user has scrolled. Keep the crop and
    // the scroll offsets in the same frame as the selection.
    const origin = layoutViewportOrigin()
    const viewport = window.visualViewport
    const root = document.documentElement
    const viewportWidth = root.clientWidth || window.innerWidth
    const viewportHeight = root.clientHeight || window.innerHeight
    const offsetLeft = viewport?.offsetLeft ?? 0
    const offsetTop = viewport?.offsetTop ?? 0
    const visibleFocus = focus && {
      left: focus.left - offsetLeft,
      top: focus.top - offsetTop,
      width: focus.width,
      height: focus.height,
    }
    const visibleWidth = viewport?.width ?? window.innerWidth
    const visibleHeight = viewport?.height ?? window.innerHeight
    if (visibleFocus && (
      visibleFocus.left >= visibleWidth || visibleFocus.left + visibleFocus.width < 0
      || visibleFocus.top >= visibleHeight || visibleFocus.top + visibleFocus.height < 0
    )) return null

    const region = calculateCaptureRegion(visibleFocus, visibleWidth, visibleHeight)
    const scale = calculateCaptureScale(region.width, region.height, window.devicePixelRatio)
    const targetRect = element?.getBoundingClientRect()
    const targetSelector = element && getSelector(element)
    const animationStyles = sampleAnimationStyles()

    const scrollPositions = new Map<Element, { left: number; top: number }>()
    const shadowHosts = new Set<Element>()
    for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
      if (parent.scrollWidth > parent.clientWidth || parent.scrollHeight > parent.clientHeight) {
        scrollPositions.set(parent, { left: parent.scrollLeft, top: parent.scrollTop })
      }
    }

    const { default: html2canvas } = await import('html2canvas-pro')
    const options = {
      useCORS: true,
      imageTimeout: 1500,
      logging: false,
      scale,
      x: origin.x + offsetLeft + region.left,
      y: origin.y + offsetTop + region.top,
      width: region.width,
      height: region.height,
      scrollX: origin.x,
      scrollY: origin.y,
      windowWidth: viewportWidth,
      windowHeight: viewportHeight,
      ignoreElements: (node) => {
        if (node.hasAttribute('data-fw')) return true
        if (node.shadowRoot && node.getRootNode() === document) shadowHosts.add(node)
        if ((node.scrollLeft || node.scrollTop) && !scrollPositions.has(node)) {
          scrollPositions.set(node, { left: node.scrollLeft, top: node.scrollTop })
        }
        return false
      },
      onclone: (clone) => {
        applyAnimationStyles(clone, animationStyles)
        restoreCloneShadows(clone, shadowHosts)
        normalizeCloneLigatures(clone)

        for (const root of [clone.documentElement, clone.body]) {
          root.style.setProperty('scroll-behavior', 'auto', 'important')
          root.style.setProperty('scroll-snap-type', 'none', 'important')
        }
        // The renderer restores scroll before this callback. Its scrollTo
        // respects page CSS, so a smooth or snapped scroll may still be in flight.
        for (const [source, position] of scrollPositions) {
          if (source === document.scrollingElement || source.getRootNode() !== document) continue
          const copy = clone.querySelector<HTMLElement>(getSelector(source))
          if (!copy) continue
          copy.style.setProperty('scroll-behavior', 'auto', 'important')
          copy.style.setProperty('scroll-snap-type', 'none', 'important')
          copy.scrollTo({ ...position, behavior: 'instant' })
        }
        const cloneWindow = clone.defaultView
        cloneWindow?.scrollTo({ left: origin.x, top: origin.y, behavior: 'instant' })

        // Offscreen sections can have different intrinsic sizes in the clone.
        // Translate the crop by the selected element's displacement in page space.
        const cloneTarget = targetSelector && clone.querySelector(targetSelector)
        if (targetRect && cloneTarget && cloneWindow) {
          const rect = cloneTarget.getBoundingClientRect()
          // A radically different box can come from a missing stylesheet or
          // a selector resolving to a different node in the clone.
          if (Math.abs(rect.width - targetRect.width) <= CLONE_BOX_TOLERANCE
            && Math.abs(rect.height - targetRect.height) <= CLONE_BOX_TOLERANCE) {
            options.x += rect.left + cloneWindow.scrollX - targetRect.left - origin.x
            options.y += rect.top + cloneWindow.scrollY - targetRect.top - origin.y
          }
        }
      },
    } satisfies NonNullable<Parameters<typeof html2canvas>[1]>
    const canvas = await html2canvas(root, options)
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

export function useScreenshotCapture(captureSource?: (focus: ScreenshotFocusRect | null) => Promise<Blob | null>) {
  const [image, setImage] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<ScreenshotCaptureStatus>('idle')
  const captureIdRef = useRef(0)
  const lastFocusRef = useRef<CaptureFocus | null>(null)

  useEffect(() => {
    if (!image) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(image)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  const capture = useCallback(async (focus?: CaptureFocus) => {
    if (focus) lastFocusRef.current = focus
    const captureId = ++captureIdRef.current
    setImage(null)
    setStatus('capturing')

    const lastFocus = lastFocusRef.current
    const selection = typeof lastFocus === 'function' ? lastFocus() : { rect: lastFocus }
    const blob = selection && await (captureSource
      ? captureSource(selection.rect)
      : captureViewport(selection.rect, 'element' in selection ? selection.element : undefined))
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
