import { describe, expect, it, vi } from 'vitest'
import { captureElement, convertModernColorFunctions } from '../lib/screenshotCapture'

vi.mock('html2canvas', () => ({
  default: vi.fn(async (_el: Element, opts?: { ignoreElements?: (n: Element) => boolean }) => {
    // Exercise the ignoreElements callback so its body gets coverage
    if (opts?.ignoreElements) {
      const withFw = document.createElement('div')
      withFw.setAttribute('data-fw', '')
      opts.ignoreElements(withFw)
      const withCrrt = document.createElement('div')
      withCrrt.setAttribute('data-fw-crrt', '')
      opts.ignoreElements(withCrrt)
      opts.ignoreElements(document.createElement('div'))
    }
    return {
      toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/png' })),
    }
  }),
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
