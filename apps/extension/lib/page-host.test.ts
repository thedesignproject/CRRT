import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
const channel = vi.hoisted(() => ({ receive: vi.fn(), send: vi.fn(), stop: vi.fn() }))
vi.mock('./frame-channel', () => ({ receiveFrameMessages: channel.receive, sendFrameMessage: channel.send }))
vi.mock('../../../src/lib/screenshotCapture', () => ({ captureViewport: vi.fn() }))
vi.mock('../../../src/lib/textAnchor', () => ({ buildTextRangeAnchor: vi.fn() }))
import { captureViewport } from '../../../src/lib/screenshotCapture'
import { buildTextRangeAnchor } from '../../../src/lib/textAnchor'
import { connectPageHost } from './page-host'
let frame: HTMLIFrameElement, element: HTMLElement, stop: () => void, receive: (message: any, from?: number) => Promise<any>
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers()
  channel.receive.mockReturnValue(channel.stop); channel.send.mockResolvedValue(undefined)
  frame = document.createElement('iframe'); element = document.createElement('article'); element.id = 'target'
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 100, height: 50 } as DOMRect)
  stop = connectPageHost(frame, true)
  receive = (message, from = 2) => channel.receive.mock.calls[0][0](message, from)
})
afterEach(() => { stop(); element.remove(); vi.restoreAllMocks(); vi.useRealTimers() })
it('handshakes, publishes normalized page geometry, validates frames, and uses only public hit-test bounds', async () => {
  const embedded = document.createElement('div'); embedded.dataset.fwCrrt = ''; embedded.dataset.crrtProject = 'project'; document.body.append(embedded)
  expect(frame.style.pointerEvents).toBe('none')
  await expect(receive({ kind: 'layout' }, 9)).rejects.toThrow('Unregistered')
  window.dispatchEvent(new CustomEvent('crrt:activate')); expect(channel.send).not.toHaveBeenCalled()
  expect(await receive({ kind: 'ready' })).toMatchObject({ kind: 'state', url: location.href.split('#')[0], activate: true, embeddedProjectIds: ['project'] })
  expect(await receive({ kind: 'ready' })).toMatchObject({ activate: true })
  await expect(receive({ kind: 'ready' }, 3)).rejects.toThrow('Unregistered')
  await receive({ kind: 'layout', rects: [[1, 2, 3, 4]] })
  expect(frame.style.clipPath).toBe('none')
  await expect(receive({ kind: 'layout', rects: [[NaN, 2, 3, 4]] })).rejects.toThrow('Invalid frame bounds')
  await receive({ kind: 'layout', rects: [] }); expect(frame.style.clipPath).toBe('none')
  await receive({ kind: 'track', targets: [{ id: 'yes', selector: '#target' }, { id: 'no', selector: '#missing' }, { id: 'bad', selector: '[' }] })
  expect(channel.send).toHaveBeenLastCalledWith(2, expect.objectContaining({ liveIds: ['yes'] }))
  vi.mocked(element.getBoundingClientRect).mockReturnValue({ width: 0, height: 0 } as DOMRect)
  await vi.advanceTimersByTimeAsync(600)
  expect(channel.send).toHaveBeenLastCalledWith(2, expect.objectContaining({ liveIds: [] }))
  await receive({ kind: 'unknown' })
  const activateEmbedded = vi.spyOn(window, 'dispatchEvent')
  await receive({ kind: 'focus-embedded', projectId: 'other' })
  expect(activateEmbedded).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'crrt:activate' }))
  await receive({ kind: 'focus-embedded', projectId: 'project' })
  expect(activateEmbedded).toHaveBeenCalledWith(expect.objectContaining({ type: 'crrt:activate' }))
  await receive({ kind: 'selecting', value: false }); expect(document.body.style.cursor).not.toBe('crosshair')
  window.dispatchEvent(new Event('focus')); expect(channel.send).toHaveBeenLastCalledWith(2, { kind: 'focus' })
  channel.send.mockRejectedValueOnce(new Error('closed'))
  window.dispatchEvent(new CustomEvent('crrt:activate')); await Promise.resolve()
  embedded.remove()
})
it('selects and highlights host elements without capturing typing or clicking the extension', async () => {
  await receive({ kind: 'ready' })
  fireEvent.mouseMove(element); expect(element.style.outline).toBe('')
  fireEvent.click(element); expect(channel.send).toHaveBeenLastCalledWith(2, { kind: 'outside' })
  await receive({ kind: 'selecting', value: true })
  element.style.outline = '1px solid blue'; fireEvent.mouseMove(element)
  expect(element.style.outline).toContain('2px')
  element.dataset.crrtExtension = ''; fireEvent.mouseMove(element); fireEvent.click(element)
  expect(element).toHaveStyle({ outlineWidth: '1px', outlineColor: 'blue' }); delete element.dataset.crrtExtension
  const focus = vi.spyOn(frame, 'focus')
  fireEvent.mouseMove(element); fireEvent.click(element, { clientX: 20, clientY: 30 })
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(channel.send).toHaveBeenLastCalledWith(2, { kind: 'target', target: expect.objectContaining({ selector: '#target', url: location.href }) })
  expect(element).toHaveStyle({ outlineWidth: '1px', outlineColor: 'blue' })
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'repeat']) fireEvent.keyDown(element, { key: 'c', [modifier]: true })
  const input = document.createElement('input'); element.append(input)
  fireEvent.keyDown(input, { key: 'secret' }); fireEvent.keyDown(window, { key: 'c', shiftKey: true })
  expect(channel.send).toHaveBeenLastCalledWith(2, { kind: 'key', key: 'c', shiftKey: true })
  await receive({ kind: 'highlight', selector: '#target' }); await vi.advanceTimersByTimeAsync(1400)
  await receive({ kind: 'highlight', selector: '#missing' })
  await receive({ kind: 'highlight', selector: '[' })
})
it('never clips a newly opening surface to stale bounds, while keeping its transparent margins click-through', async () => {
  await receive({ kind: 'ready' })
  await receive({ kind: 'layout', rects: [[100, 100, 44, 44]] })
  expect(frame.style.clipPath).toBe('none')
  for (const [x, y] of [[99, 120], [120, 99], [145, 120], [120, 145]]) {
    await receive({ kind: 'pointer', x, y }); expect(frame.style.pointerEvents).toBe('none')
  }
  fireEvent.mouseMove(element, { clientX: 120, clientY: 120 })
  expect(frame.style.pointerEvents).toBe('auto')
  await receive({ kind: 'selecting', value: true })
  expect(frame.style.pointerEvents).toBe('none')
  await receive({ kind: 'layout', rects: [] })
  fireEvent.mouseMove(element); expect(frame.style.pointerEvents).toBe('none')
  expect(frame.style.clipPath).toBe('none')
})
it('keeps pins live for height-only targets and valid fallback coordinates', async () => {
  await receive({ kind: 'ready' })
  vi.mocked(element.getBoundingClientRect).mockReturnValue({ width: 0, height: 10 } as DOMRect)
  await receive({ kind: 'track', targets: [
    { id: 'height', selector: '#target', x: Number.NaN, y: Number.NaN },
    { id: 'coords', selector: '#missing', x: 0, y: 100 },
    { id: 'bad-x', selector: '#missing', x: -1, y: 50 },
    { id: 'high-x', selector: '#missing', x: 101, y: 50 },
    { id: 'nan-x', selector: '#missing', x: Number.NaN, y: 50 },
    { id: 'bad-y', selector: '#missing', x: 50, y: -1 },
    { id: 'high-y', selector: '#missing', x: 50, y: 101 },
    { id: 'nan-y', selector: '#missing', x: 50, y: Number.NaN },
    { id: 'caught', selector: '[', x: 0, y: 100 },
    { id: 'caught-bad-x', selector: '[', x: -1, y: 50 },
    { id: 'caught-high-x', selector: '[', x: 101, y: 50 },
    { id: 'caught-nan-x', selector: '[', x: Number.NaN, y: 50 },
    { id: 'caught-bad-y', selector: '[', x: 50, y: -1 },
    { id: 'caught-high-y', selector: '[', x: 50, y: 101 },
    { id: 'caught-nan-y', selector: '[', x: 50, y: Number.NaN },
  ] })
  expect(channel.send).toHaveBeenLastCalledWith(2, expect.objectContaining({ liveIds: ['height', 'coords', 'caught'] }))
})
it('uses shared text anchors and focused screenshot capture across the private channel', async () => {
  await receive({ kind: 'ready' }); await receive({ kind: 'selecting', value: true })
  const range = document.createRange(); range.selectNodeContents(element)
  vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false, rangeCount: 1, getRangeAt: () => range } as unknown as Selection)
  vi.mocked(buildTextRangeAnchor).mockImplementationOnce((_range, options) => {
    expect(options.isExcluded!(element)).toBe(false)
    element.dataset.fw = ''; expect(options.isExcluded!(element)).toBe(true)
    return { anchor: { containerSelector: '#quote' }, midpointClient: { x: 30, y: 40 } } as never
  })
  fireEvent.click(element)
  expect(channel.send).toHaveBeenLastCalledWith(2, { kind: 'target', target: expect.objectContaining({ targetType: 'text_range', selector: '#quote' }) })
  vi.mocked(captureViewport).mockResolvedValueOnce(null)
  const empty = receive({ kind: 'capture' }); await vi.advanceTimersByTimeAsync(32)
  expect(await empty).toBeNull()
  vi.mocked(captureViewport).mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
  const capture = receive({ kind: 'capture' }); await vi.advanceTimersByTimeAsync(64)
  expect(await capture).toMatch(/^data:image\/png;base64,/)
  expect(captureViewport).toHaveBeenCalledWith(expect.objectContaining({ left: 10, width: 100 }))
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) { this.dispatchEvent(new Event('error')) })
  const failed = expect(receive({ kind: 'capture' })).rejects.toThrow('encoding failed')
  await vi.advanceTimersByTimeAsync(32); await failed
  stop(); expect(channel.stop).toHaveBeenCalled()
})
it('allows a paint between pin placement and expensive screenshot rendering', async () => {
  await receive({ kind: 'ready' })
  vi.mocked(captureViewport).mockResolvedValue(null)
  const capture = receive({ kind: 'capture' })
  expect(captureViewport).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(16)
  expect(captureViewport).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(16)
  await capture
  expect(captureViewport).toHaveBeenCalledOnce()
})
