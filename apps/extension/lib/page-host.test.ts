import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
const channel = vi.hoisted(() => ({ receive: vi.fn(), send: vi.fn(), stop: vi.fn() }))
vi.mock('./frame-channel', () => ({ receiveFrameMessages: channel.receive, sendFrameMessage: channel.send }))
vi.mock('./native-screenshot', () => ({ captureNativeScreenshot: vi.fn() }))
vi.mock('../../../src/lib/textAnchor', () => ({ buildTextRangeAnchor: vi.fn() }))
import { captureNativeScreenshot } from './native-screenshot'
import { buildTextRangeAnchor } from '../../../src/lib/textAnchor'
import { connectPageHost } from './page-host'
let frame: HTMLIFrameElement, element: HTMLElement, stop: () => void, receive: (message: any, from?: number) => Promise<any>, deactivate: () => void
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers()
  channel.receive.mockReturnValue(channel.stop); channel.send.mockResolvedValue(undefined)
  frame = document.createElement('iframe'); element = document.createElement('article'); element.id = 'target'
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 100, height: 50, right: 110, bottom: 70 } as DOMRect)
  deactivate = vi.fn(); stop = connectPageHost(frame, true, deactivate)
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
  await receive({ kind: 'deactivate' }); expect(deactivate).toHaveBeenCalledOnce()
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
  vi.mocked(captureNativeScreenshot).mockResolvedValue('data:image/png;base64,aW1hZ2U=')
  const capture = receive({ kind: 'capture' }); await vi.advanceTimersByTimeAsync(64)
  expect(await capture).toMatch(/^data:image\/png;base64,/)
  expect(captureNativeScreenshot).toHaveBeenCalledWith(expect.objectContaining({ left: 10, width: 100 }))
  vi.mocked(captureNativeScreenshot).mockRejectedValueOnce(new Error('Screenshot encoding failed'))
  const failed = expect(receive({ kind: 'capture' })).rejects.toThrow('encoding failed')
  await vi.advanceTimersByTimeAsync(32); await failed
  stop(); expect(channel.stop).toHaveBeenCalled()
})
it('allows a paint between pin placement and expensive screenshot rendering', async () => {
  await receive({ kind: 'ready' })
  vi.mocked(captureNativeScreenshot).mockResolvedValue('data:image/png;base64,eA==')
  const capture = receive({ kind: 'capture' })
  expect(captureNativeScreenshot).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(16)
  expect(captureNativeScreenshot).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(16)
  await capture
  expect(captureNativeScreenshot).toHaveBeenCalledOnce()
})

it('hides overlay paint without layout changes and restores exact styles after success and failure', async () => {
  await receive({ kind: 'ready' })
  const embedded = document.createElement('div'); embedded.dataset.fwCrrt = ''
  embedded.style.setProperty('visibility', 'visible', 'important'); embedded.style.opacity = '0.6'
  document.body.append(embedded)
  frame.style.visibility = 'collapse'; frame.style.setProperty('opacity', '0.8', 'important')
  await receive({ kind: 'selecting', value: true }); fireEvent.mouseMove(element)
  const outline = element.style.outline
  for (const failure of [false, true]) {
    vi.mocked(captureNativeScreenshot).mockImplementationOnce(async () => {
      expect(frame.style.visibility).toBe('hidden'); expect(frame.style.opacity).toBe('0')
      expect(embedded.style.visibility).toBe('hidden'); expect(embedded.style.opacity).toBe('0')
      expect(element.style.outline).toBe('')
      fireEvent.mouseMove(element); expect(element.style.outline).toBe('')
      if (failure) throw new Error('native failed')
      return 'data:image/png;base64,eA=='
    })
    const promise = receive({ kind: 'capture' })
    const result = failure ? expect(promise).rejects.toThrow('native failed') : expect(promise).resolves.toContain('data:image/png')
    await vi.advanceTimersByTimeAsync(32); await result
    expect(frame.style.visibility).toBe('collapse'); expect(frame.style.opacity).toBe('0.8')
    expect(frame.style.getPropertyPriority('opacity')).toBe('important')
    expect(embedded.style.visibility).toBe('visible'); expect(embedded.style.opacity).toBe('0.6')
    expect(embedded.style.getPropertyPriority('visibility')).toBe('important')
    expect(element.style.outline).toBe(outline)
  }
  embedded.remove()
})
it('refreshes selected bounds on Retry and rejects detached or offscreen targets', async () => {
  await receive({ kind: 'ready' }); await receive({ kind: 'selecting', value: true }); fireEvent.click(element)
  vi.mocked(element.getBoundingClientRect).mockReturnValue({ left: 30, top: 40, width: 100, height: 50, right: 130, bottom: 90 } as DOMRect)
  const capture = receive({ kind: 'capture' }); await vi.advanceTimersByTimeAsync(32); await capture
  expect(captureNativeScreenshot).toHaveBeenLastCalledWith(expect.objectContaining({ left: 30, top: 40 }))
  for (const rect of [{ right: 0 }, { bottom: 0 }, { left: innerWidth }, { top: innerHeight }]) {
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ left: 30, top: 40, right: 130, bottom: 90, ...rect } as DOMRect)
    await expect(receive({ kind: 'capture' })).rejects.toThrow('outside viewport')
  }
  element.remove()
  await expect(receive({ kind: 'capture' })).rejects.toThrow('target unavailable')
})
it('serializes overlay transactions and restores unset properties', async () => {
  await receive({ kind: 'ready' })
  let complete!: (value: string) => void
  vi.mocked(captureNativeScreenshot).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
  vi.mocked(captureNativeScreenshot).mockResolvedValueOnce('data:image/png;base64,eA==')
  const first = receive({ kind: 'capture' }), second = receive({ kind: 'capture' })
  await vi.advanceTimersByTimeAsync(32)
  expect(captureNativeScreenshot).toHaveBeenCalledOnce()
  complete('data:image/png;base64,eA=='); await first
  await vi.advanceTimersByTimeAsync(32); await second
  expect(frame.style.getPropertyValue('visibility')).toBe('')
  expect(frame.style.getPropertyValue('opacity')).toBe('')
})
it('restores overlays when disconnected before or during native capture and rejects later requests', async () => {
  await receive({ kind: 'ready' })
  const before = receive({ kind: 'capture' })
  const rejected = expect(before).rejects.toThrow('disconnected')
  await vi.advanceTimersByTimeAsync(16); stop()
  await vi.advanceTimersByTimeAsync(16); await rejected
  expect(frame.style.visibility).toBe('')
  await expect(receive({ kind: 'capture' })).rejects.toThrow('disconnected')
  stop = connectPageHost(frame, true, deactivate)
  receive = (message, from = 2) => channel.receive.mock.calls[1][0](message, from)
  await receive({ kind: 'ready' })
  vi.mocked(captureNativeScreenshot).mockImplementationOnce(async () => { stop(); return 'image' })
  const during = receive({ kind: 'capture' })
  const failed = expect(during).rejects.toThrow('disconnected')
  await vi.advanceTimersByTimeAsync(32); await failed
  expect(frame.style.visibility).toBe('')
})
it('rejects viewport changes while waiting for paint', async () => {
  await receive({ kind: 'ready' })
  const previous = window.innerWidth
  const capture = receive({ kind: 'capture' }), failure = expect(capture).rejects.toThrow('Viewport changed')
  await vi.advanceTimersByTimeAsync(16)
  vi.stubGlobal('innerWidth', previous + 1)
  await vi.advanceTimersByTimeAsync(16); await failure
  vi.unstubAllGlobals()
  expect(frame.style.opacity).toBe('')
})
it('does not add a highlight requested during capture', async () => {
  await receive({ kind: 'ready' })
  vi.mocked(captureNativeScreenshot).mockImplementationOnce(async () => {
    await receive({ kind: 'highlight', selector: '#target' })
    expect(element.style.outline).toBe('')
    return 'image'
  })
  const capture = receive({ kind: 'capture' }); await vi.advanceTimersByTimeAsync(32); await capture
})
it('does not resurrect a highlight that expires during a slow capture', async () => {
  await receive({ kind: 'ready' }); await receive({ kind: 'highlight', selector: '#target' })
  let complete!: (image: string) => void
  vi.mocked(captureNativeScreenshot).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
  const capture = receive({ kind: 'capture' })
  await vi.advanceTimersByTimeAsync(1500)
  complete('image'); await capture
  expect(element.style.outline).toBe('')
})

it.each(['nested-scroll', 'scroll-away-and-back', 'resize-away-and-back'])('rejects %s during native capture and safely retries', async (change) => {
  await receive({ kind: 'ready' }); await receive({ kind: 'selecting', value: true }); fireEvent.click(element)
  const remove = vi.spyOn(window, 'removeEventListener')
  vi.mocked(captureNativeScreenshot).mockImplementationOnce(async () => {
    if (change === 'nested-scroll') element.dispatchEvent(new Event('scroll', { bubbles: false }))
    else {
      const property = change === 'scroll-away-and-back' ? 'scrollY' : 'innerHeight'
      const original = window[property]
      vi.stubGlobal(property, original + 100)
      window.dispatchEvent(new Event(change === 'scroll-away-and-back' ? 'scroll' : 'resize'))
      vi.stubGlobal(property, original)
    }
    return 'data:image/png;base64,eA=='
  })
  const capture = receive({ kind: 'capture' }), failure = expect(capture).rejects.toThrow('Viewport changed')
  await vi.advanceTimersByTimeAsync(32); await failure
  expect(frame.style.opacity).toBe('')
  expect(frame.style.visibility).toBe('')
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), true)
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  vi.mocked(captureNativeScreenshot).mockResolvedValueOnce('data:image/png;base64,eA==')
  const retry = receive({ kind: 'capture' }); await vi.advanceTimersByTimeAsync(32)
  await expect(retry).resolves.toContain('data:image/png')
  vi.unstubAllGlobals()
})
it('rejects nested scrolling between measuring the target and requesting native pixels', async () => {
  await receive({ kind: 'ready' })
  const capture = receive({ kind: 'capture' }), failure = expect(capture).rejects.toThrow('Viewport changed')
  await vi.advanceTimersByTimeAsync(16)
  element.dispatchEvent(new Event('scroll', { bubbles: false }))
  await vi.advanceTimersByTimeAsync(16); await failure
  expect(captureNativeScreenshot).not.toHaveBeenCalled()
  expect(frame.style.opacity).toBe('')
})
