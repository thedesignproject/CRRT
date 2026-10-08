import { Profiler } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectorFrame } from '../components/FeedbackWidget/SelectorFrame'
import { FeedbackWidgetStyles } from '../components/FeedbackWidget/styles'

type FrameCallback = FrameRequestCallback
let frameId = 0
let frames = new Map<number, FrameCallback>()
let observers: Array<{ callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>

async function flushFrame(time = 16) {
  const pending = [...frames.entries()]
  frames.clear()
  await act(async () => { for (const [, callback] of pending) callback(time) })
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

function addTarget(bounds: DOMRect) {
  const element = document.createElement('section')
  document.body.appendChild(element)
  const getBoundingClientRect = vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(bounds)
  return { element, getBoundingClientRect }
}

beforeEach(() => {
  frameId = 0
  frames = new Map()
  observers = []
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameCallback) => {
    const id = ++frameId
    frames.set(id, callback)
    return id
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames.delete(id) }))
  vi.stubGlobal('ResizeObserver', class {
    callback: ResizeObserverCallback
    observe = vi.fn()
    disconnect = vi.fn()
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
      observers.push(this)
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.querySelectorAll('section').forEach((element) => element.remove())
})

describe('<SelectorFrame />', () => {
  it('coalesces rapid movement into one measurement and softly travels between candidates', async () => {
    const first = addTarget(rect(10, 20, 100, 40))
    const second = addTarget(rect(220, 80, 180, 90))
    const third = addTarget(rect(460, 140, 240, 120))
    render(<SelectorFrame active onTextHover={() => {}} />)

    fireEvent.mouseMove(first.element, { clientX: 20, clientY: 30 })
    fireEvent.mouseMove(second.element, { clientX: 230, clientY: 90 })
    fireEvent.mouseMove(third.element, { clientX: 470, clientY: 150 })
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    await flushFrame()

    const frame = document.querySelector<HTMLElement>('[data-fw-selector-frame]')!
    expect(first.getBoundingClientRect).not.toHaveBeenCalled()
    expect(second.getBoundingClientRect).not.toHaveBeenCalled()
    expect(third.getBoundingClientRect).toHaveBeenCalledOnce()
    expect(frame.style.transform).toBe('translate3d(458px, 138px, 0)')
    expect(frame.style.width).toBe('244px')
    expect(frame.style.pointerEvents).toBe('none')

    fireEvent.mouseMove(first.element, { clientX: 20, clientY: 30 })
    await flushFrame()
    expect(frame.style.transition).toContain('var(--crrt-selector-motion-duration)')
    expect(frame.style.transition).toContain('var(--crrt-selector-motion-easing)')
  })

  it('does not commit unchanged candidate geometry', async () => {
    const target = addTarget(rect(10, 20, 100, 40))
    let commits = 0
    const view = render(<Profiler id="selector" onRender={() => { commits++ }}><SelectorFrame active onTextHover={() => {}} /></Profiler>)
    fireEvent.mouseMove(target.element, { clientX: 20, clientY: 30 })
    await flushFrame()
    const afterVisible = commits

    fireEvent.mouseMove(target.element, { clientX: 21, clientY: 31 })
    await flushFrame()
    expect(target.getBoundingClientRect).toHaveBeenCalledTimes(2)
    expect(commits).toBe(afterVisible)

    view.rerender(<Profiler id="selector" onRender={() => { commits++ }}><SelectorFrame active={false} onTextHover={() => {}} /></Profiler>)
    expect(document.querySelector<HTMLElement>('[data-fw-selector-frame]')?.style.opacity).toBe('0')
  })

  it('realigns immediately for nested scrolling, responsive reflow, and visual-viewport zoom', async () => {
    const target = addTarget(rect(100, 120, 200, 60))
    const visualViewport = new EventTarget()
    Object.defineProperty(window, 'visualViewport', { value: visualViewport, configurable: true })
    render(<SelectorFrame active onTextHover={() => {}} />)
    fireEvent.mouseMove(target.element, { clientX: 110, clientY: 130 })
    await flushFrame()
    const frame = document.querySelector<HTMLElement>('[data-fw-selector-frame]')!

    target.getBoundingClientRect.mockReturnValue(rect(100, 40, 200, 60))
    target.element.dispatchEvent(new Event('scroll'))
    await flushFrame()
    expect(frame.style.transform).toBe('translate3d(98px, 38px, 0)')
    expect(frame.style.transition).toBe('opacity var(--crrt-selector-opacity-duration) ease')

    target.getBoundingClientRect.mockReturnValue(rect(70, 40, 260, 80))
    act(() => { observers[0].callback([], observers[0] as never) })
    await flushFrame()
    expect(frame.style.width).toBe('264px')
    expect(frame.style.height).toBe('84px')

    target.getBoundingClientRect.mockReturnValue(rect(70, 40, 0, 0))
    act(() => { observers[0].callback([], observers[0] as never) })
    await flushFrame()
    expect(frame.style.opacity).toBe('0')

    fireEvent.mouseMove(target.element, { clientX: 80, clientY: 50 })
    target.getBoundingClientRect.mockReturnValue(rect(70, 40, 260, 80))
    await flushFrame()

    target.getBoundingClientRect.mockReturnValue(rect(35, 20, 130, 40))
    visualViewport.dispatchEvent(new Event('resize'))
    await flushFrame()
    expect(frame.style.transform).toBe('translate3d(33px, 18px, 0)')
  })

  it('hides over widget UI and cancels listeners, frames, and observers on cleanup', async () => {
    const target = addTarget(rect(10, 20, 100, 40))
    const widget = document.createElement('div')
    widget.setAttribute('data-fw', '')
    document.body.appendChild(widget)
    const view = render(<SelectorFrame active onTextHover={() => {}} />)
    fireEvent.mouseMove(target.element)
    await flushFrame()
    const frame = document.querySelector<HTMLElement>('[data-fw-selector-frame]')!
    expect(frame.style.opacity).toBe('1')

    fireEvent.mouseMove(widget)
    await flushFrame()
    expect(frame.style.opacity).toBe('0')

    fireEvent.mouseMove(target.element)
    expect(frames.size).toBe(1)
    view.unmount()
    expect(frames.size).toBe(0)
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(observers.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true)
    const calls = vi.mocked(requestAnimationFrame).mock.calls.length
    fireEvent.mouseMove(target.element)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(calls)
    widget.remove()
  })

  it('documents a pointer-transparent immediate reduced-motion frame', () => {
    render(<FeedbackWidgetStyles />)
    const css = document.querySelector('style')!.textContent ?? ''
    expect(css).toContain('--crrt-selector-motion-duration: 250ms')
    expect(css).toContain('--crrt-selector-motion-easing: cubic-bezier(.22, 1.18, .36, 1)')
    expect(css).toContain('--crrt-selector-opacity-duration: 120ms')
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.fw-selector-frame\s*\{[\s\S]*transition:\s*none !important/)
  })
})

it('follows transforms and position-only layout changes without pointer or resize events', async () => {
  const target = addTarget(rect(10, 20, 100, 40))
  const view = render(<SelectorFrame active onTextHover={() => {}} />)
  fireEvent.mouseMove(target.element)
  await flushFrame()
  target.getBoundingClientRect.mockReturnValue(rect(190, 70, 100, 40))
  await flushFrame()
  const frame = document.querySelector<HTMLElement>('[data-fw-selector-frame]')!
  expect(frame.style.transform).toBe('translate3d(188px, 68px, 0)')
  expect(frame.style.transition).toBe('opacity var(--crrt-selector-opacity-duration) ease')
  target.element.remove()
  await flushFrame()
  expect(frame.style.opacity).toBe('0')
  expect(frames.size).toBe(0)
  view.unmount()
})


it.each(['hidden', 'collapse', 'ancestor'] as const)('hides a preserved-layout target when its visibility becomes %s', async (visibility) => {
  const target = addTarget(rect(10, 20, 100, 40))
  const parent = document.createElement('section')
  document.body.appendChild(parent)
  parent.appendChild(target.element)
  const onTextHover = vi.fn()
  const view = render(<SelectorFrame active onTextHover={onTextHover} />)
  fireEvent.mouseMove(target.element, { clientX: 20, clientY: 30 })
  await flushFrame()
  const frame = document.querySelector<HTMLElement>('[data-fw-selector-frame]')!
  expect(frame.style.opacity).toBe('1')
  if (visibility === 'ancestor') parent.style.visibility = 'hidden'
  else target.element.style.visibility = visibility
  // Visibility preserves the box and does not emit pointer or resize events.
  expect(target.element.getBoundingClientRect().width).toBe(100)
  await flushFrame()
  expect(frame.style.opacity).toBe('0')
  expect(onTextHover).toHaveBeenLastCalledWith(false)
  expect(frames.size).toBe(0)
  target.element.style.visibility = 'visible'
  parent.style.visibility = 'visible'
  fireEvent.mouseMove(target.element, { clientX: 20, clientY: 30 })
  await flushFrame()
  expect(frame.style.opacity).toBe('1')
  view.unmount()
  expect(frames.size).toBe(0)
})
