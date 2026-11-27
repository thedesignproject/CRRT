import { act, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FeedbackWidget } from '../index'
import type { WireComment } from '../components/FeedbackWidget/types'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps a persisted point on its target through nested scroll, viewport changes and layout shifts', async () => {
  const viewport = Object.assign(new EventTarget(), {
    pageLeft: 25, pageTop: 48, offsetLeft: 20, offsetTop: 38,
  })
  vi.stubGlobal('visualViewport', viewport)
  vi.spyOn(document.documentElement, 'scrollWidth', 'get').mockReturnValue(1000)
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(1000)
  const panel = document.createElement('div')
  const target = document.createElement('button')
  target.id = 'reflow-pin'
  panel.append(target)
  document.body.append(panel)
  let rect = new DOMRect(40, 100, 300, 50)
  vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => rect)
  const saved: WireComment = {
    id: 'pin', projectId: 'host', pageUrl: location.href, x: 10, y: 20,
    selector: '#reflow-pin', body: 'Feedback', targetType: 'element_point', anchor: { elementX: .25, elementY: .4 },
    reviewStatus: 'open', createdAt: '2026-11-27',
  }
  const view = render(<FeedbackWidget projectId="host" personalComments={{
    list: async () => [saved], create: async () => saved, remove: async () => {}, update: async () => {},
  }} />)
  const pin = () => view.container.querySelector<HTMLElement>('[data-fw-pin]')!
  try {
    await waitFor(() => expect(pin()).toHaveStyle({ left: '115px', top: '109px' }))
    rect = new DOMRect(40, 80, 300, 50)
    panel.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(pin()).toHaveStyle({ top: '89px' }))
    rect = new DOMRect(10, 80, 100, 75)
    viewport.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(pin()).toHaveStyle({ left: '35px', top: '99px' }))
    rect = new DOMRect(10, 280, 100, 75)
    panel.prepend(document.createElement('div'))
    await waitFor(() => expect(pin()).toHaveStyle({ top: '299px' }))
    target.remove()
    await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).toBeNull())
  } finally {
    panel.remove()
  }
})

it('ignores internal mutations and cancels a pending pin update when unmounted', async () => {
  // Real timers: happy-dom's MutationObserver delivery is unreliable under fake timers.
  const pause = (ms: number) => act(() => new Promise(resolve => setTimeout(resolve, ms)))
  // A visible saved pin keeps position syncing on for the whole test.
  const target = document.createElement('button')
  target.id = 'throttle-pin'
  document.body.append(target)
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 100, 300, 50))
  const saved: WireComment = {
    id: 'pin', projectId: 'host', pageUrl: location.href, x: 10, y: 20,
    selector: '#throttle-pin', body: 'Feedback', reviewStatus: 'open', createdAt: '2026-11-27',
  }
  const view = render(<FeedbackWidget projectId="host" personalComments={{
    list: async () => [saved], create: async () => saved, remove: async () => {}, update: async () => {},
  }} />)
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  await pause(300)
  const schedule = vi.spyOn(window, 'requestAnimationFrame')
  view.container.querySelector('[data-fw]')!.setAttribute('data-internal', 'true')
  await pause(200)
  expect(schedule).not.toHaveBeenCalled()

  // Page mutations are throttled: nothing runs at once, and two changes produce one update.
  view.container.setAttribute('data-layout-change', 'true')
  await act(async () => {})
  view.container.setAttribute('data-layout-change', 'again')
  await act(async () => {})
  expect(schedule).not.toHaveBeenCalled()
  await waitFor(() => expect(schedule).toHaveBeenCalled())
  await pause(200)
  expect(schedule).toHaveBeenCalledTimes(1)

  // Unmounting clears a pending mutation update and cancels a scheduled frame.
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  view.container.setAttribute('data-layout-change', 'pending')
  await act(async () => {})
  window.dispatchEvent(new Event('resize'))
  const scheduled = schedule.mock.calls.length
  view.unmount()
  expect(cancel).toHaveBeenCalledWith(schedule.mock.results[scheduled - 1].value)
  await pause(200)
  expect(schedule).toHaveBeenCalledTimes(scheduled)
  target.remove()
})
