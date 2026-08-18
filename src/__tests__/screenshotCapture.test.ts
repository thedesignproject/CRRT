import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { captureElement, convertModernColorFunctions, useScreenshotCapture } from '../lib/screenshotCapture'

let nextBlob: Blob | null = new Blob(['x'], { type: 'image/png' })

vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({
    toBlob: (cb: (blob: Blob | null) => void) => cb(nextBlob),
  })),
}))

describe('screenshot color conversion', () => {
  it('converts oklab colors to rgb for html2canvas', () => {
    expect(convertModernColorFunctions('oklab(1 0 0)')).toBe('rgb(255, 255, 255)')
    expect(convertModernColorFunctions('oklab(0 0 0 / 50%)')).toBe('rgba(0, 0, 0, 0.5)')
  })

  it('converts oklch colors inside larger CSS values', () => {
    expect(
      convertModernColorFunctions('0 8px 24px oklch(0 0 0 / 25%)'),
    ).toBe('0 8px 24px rgba(0, 0, 0, 0.25)')
  })

  it('captureElement returns a blob via mocked html2canvas', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const blob = await captureElement(el)
    expect(blob).toBeInstanceOf(Blob)
  })
})

// Shared setup for the race-safety cases below: a fresh hook instance plus a
// throwaway target element, with `nextBlob` primed for the mocked html2canvas.
function setUpCapture(blob: Blob | null) {
  nextBlob = blob
  const { result } = renderHook(() => useScreenshotCapture())
  const el = document.createElement('div')
  document.body.appendChild(el)
  return { result, el }
}

describe('useScreenshotCapture race safety', () => {
  it('toBase64 awaits an in-flight capture instead of racing ahead of it', async () => {
    const { result, el } = setUpCapture(new Blob(['x'], { type: 'image/png' }))

    // Fire capture() and call toBase64() in the same tick, before the mocked
    // html2canvas promise (and the resulting setImage) has settled — mirrors
    // a user hitting Send immediately after clicking a target.
    let encoded: { base64: string; mimeType: string } | null = null
    await act(async () => {
      result.current.capture(el)
      encoded = await result.current.toBase64()
    })

    expect(encoded).toEqual({ base64: 'eA==', mimeType: 'image/png' })
  })

  it('toBase64 resolves to null when the in-flight capture fails', async () => {
    const { result, el } = setUpCapture(null)

    let encoded: { base64: string; mimeType: string } | null = { base64: 'stale', mimeType: 'stale' }
    await act(async () => {
      result.current.capture(el)
      encoded = await result.current.toBase64()
    })

    expect(encoded).toBeNull()
  })

  it('clear() drops the pending capture so a later toBase64 does not resolve it', async () => {
    const { result, el } = setUpCapture(new Blob(['x'], { type: 'image/png' }))

    let pending: Promise<Blob | null>
    act(() => {
      pending = result.current.capture(el)
      result.current.clear()
    })

    const encoded = await result.current.toBase64()
    expect(encoded).toBeNull()

    // The superseded capture still resolves in the background — it must not
    // resurrect `image` after clear() already moved on.
    await act(async () => { await pending })
    expect(result.current.image).toBeNull()
  })
})
