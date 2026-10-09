import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const send = vi.hoisted(() => vi.fn())
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage: send } } }))
import { captureNativeScreenshot } from './native-screenshot'
let dimensions: [number, number], decodeError: boolean
const draw = vi.fn(), encode = vi.fn()
beforeEach(() => {
  vi.clearAllMocks(); dimensions = [2000, 1000]; decodeError = false
  vi.stubGlobal('innerWidth', 1000); vi.stubGlobal('innerHeight', 500); vi.stubGlobal('scrollX', 0); vi.stubGlobal('scrollY', 0)
  send.mockResolvedValue({ ok: true, data: 'data:image/png;base64,eA==' })
  vi.stubGlobal('Image', class {
    naturalWidth = dimensions[0]; naturalHeight = dimensions[1]
    onload!: () => void; onerror!: () => void
    set src(_value: string) { queueMicrotask(() => decodeError ? this.onerror() : this.onload()) }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D)
  encode.mockReturnValue('data:image/png;base64,Y3JvcA==')
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(encode)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it.each([
  [{ left: 100, top: 50, width: 200, height: 100 }, [180, 80, 440, 240]],
  [{ left: -20, top: -10, width: 100, height: 100 }, [0, 0, 200, 220]],
  [{ left: 990, top: 490, width: 100, height: 100 }, [1940, 940, 60, 60]],
  [{ left: -100, top: -100, width: 2000, height: 1000 }, [0, 0, 2000, 1000]],
] as const)('crops padded visible bounds %j', async (focus, expected) => {
  expect(await captureNativeScreenshot(focus)).toBe('data:image/png;base64,Y3JvcA==')
  expect(draw.mock.calls[0].slice(1, 5)).toEqual(expected)
  expect(send).toHaveBeenCalledWith({ type: 'comment:capture' })
  expect(encode).toHaveBeenCalledWith('image/png')
})
it('caps full viewport output at 1920 without upscaling', async () => {
  await captureNativeScreenshot(null)
  expect(draw.mock.calls[0].slice(1)).toEqual([0, 0, 2000, 1000, 0, 0, 1920, 960])
  dimensions = [1000, 500]
  await captureNativeScreenshot(null)
  expect(draw.mock.calls[1].slice(1)).toEqual([0, 0, 1000, 500, 0, 0, 1000, 500])
})
it('uses actual independent image scaling at fractional zoom', async () => {
  dimensions = [1250, 750]
  await captureNativeScreenshot({ left: 20.3, top: 20.3, width: 100, height: 50 })
  expect(draw.mock.calls[0].slice(1)).toEqual([12, 15, 151, 106, 0, 0, 151, 106])
})
it.each(['innerWidth', 'innerHeight', 'scrollX', 'scrollY'])('rejects changed %s', async (property) => {
  send.mockImplementationOnce(async () => { vi.stubGlobal(property, 42); return { ok: true } })
  await expect(captureNativeScreenshot(null)).rejects.toThrow('Viewport changed')
})
it('reports API, decoding, canvas and encoding failures', async () => {
  send.mockResolvedValueOnce({ ok: false, error: 'Permission revoked' })
  await expect(captureNativeScreenshot(null)).rejects.toThrow('Permission revoked')
  send.mockResolvedValueOnce(null)
  await expect(captureNativeScreenshot(null)).rejects.toThrow('Screenshot unavailable')
  send.mockResolvedValueOnce({ ok: false })
  await expect(captureNativeScreenshot(null)).rejects.toThrow('Screenshot unavailable')
  decodeError = true
  await expect(captureNativeScreenshot(null)).rejects.toThrow('decoding')
  decodeError = false
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null)
  await expect(captureNativeScreenshot(null)).rejects.toThrow('canvas unavailable')
  encode.mockReturnValueOnce('data:,')
  await expect(captureNativeScreenshot(null)).rejects.toThrow('encoding failed')
  encode.mockImplementationOnce(() => { throw new Error('canvas failed') })
  await expect(captureNativeScreenshot(null)).rejects.toThrow('canvas failed')
})
it.each([[0, 1000], [2000, 0]])('rejects invalid image dimensions %j', async (w, h) => {
  dimensions = [w, h]
  await expect(captureNativeScreenshot(null)).rejects.toThrow('dimensions')
})
it.each(['innerWidth', 'innerHeight'])('rejects invalid viewport %s', async (property) => {
  vi.stubGlobal(property, 0)
  await expect(captureNativeScreenshot(null)).rejects.toThrow('dimensions')
})
it.each([{}, { data: null }, { data: 'data:,' }])('rejects malformed successful responses %j', async (data) => {
  send.mockResolvedValueOnce({ ok: true, ...data })
  await expect(captureNativeScreenshot(null)).rejects.toThrow('Invalid screenshot image')
})
it('discards an image if scrolling changes while decoding', async () => {
  vi.stubGlobal('Image', class {
    onload!: () => void
    set src(_value: string) { queueMicrotask(() => { vi.stubGlobal('scrollY', 10); this.onload() }) }
  })
  await expect(captureNativeScreenshot(null)).rejects.toThrow('Viewport changed')
})
