import { act, cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useScrollSteps } from './useScrollSteps'

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

function Track() {
  const ref = useRef<HTMLDivElement>(null)
  const step = useScrollSteps(ref, 4, '--track-p', 300, 1)
  return <div ref={ref} data-testid="track">{step}</div>
}

function frames() {
  const queue: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => queue.push(callback))
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  return { flush: () => act(() => { queue.splice(0).forEach(callback => callback(0)) }), cancel }
}

const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

it('opens on the scrolled step, then walks one step per dwell toward wherever the reader flicks', () => {
  // Four steps plus one held slice: each step owns 200px of the 1000px track, the last owns 400px.
  const { flush, cancel } = frames()
  let top = -300
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top, height: window.innerHeight + 1000 }) as DOMRect)
  const { unmount } = render(<Track />)
  const track = screen.getByTestId('track')
  const progress = () => track.style.getPropertyValue('--track-p')
  expect(track).toHaveTextContent('1')
  expect(progress()).toBe('0.3750')

  top = -5000
  window.dispatchEvent(new Event('scroll'))
  window.dispatchEvent(new Event('scroll'))
  flush()
  expect(track).toHaveTextContent('2')
  expect(progress()).toBe('0.7500')
  wait(299)
  expect(track).toHaveTextContent('2')
  wait(1)
  expect(track).toHaveTextContent('3')
  expect(progress()).toBe('1.0000')
  wait(300)

  top = 0
  window.dispatchEvent(new Event('resize'))
  flush()
  expect(track).toHaveTextContent('2')
  expect(progress()).toBe('0.5000')
  wait(600)
  expect(track).toHaveTextContent('0')
  expect(progress()).toBe('0.0000')

  top = -300
  window.dispatchEvent(new Event('scroll'))
  flush()
  wait(300)
  expect(track).toHaveTextContent('1')
  window.dispatchEvent(new Event('scroll'))
  flush()
  expect(progress()).toBe('0.3750')

  top = -650
  window.dispatchEvent(new Event('scroll'))
  flush()
  wait(600)
  expect(track).toHaveTextContent('3')
  expect(progress()).toBe('0.8125')
  top = -950
  window.dispatchEvent(new Event('scroll'))
  flush()
  expect(track).toHaveTextContent('3')
  expect(progress()).toBe('1.0000')
  unmount()
  expect(cancel).toHaveBeenCalled()
  wait(1000)
})

it('stays on the first step when the track is no taller than the viewport', () => {
  frames()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: -200, height: window.innerHeight } as DOMRect)
  render(<Track />)
  expect(screen.getByTestId('track')).toHaveTextContent('0')
  expect(screen.getByTestId('track').style.getPropertyValue('--track-p')).toBe('0.0000')
})
