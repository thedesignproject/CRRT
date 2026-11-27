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
    await waitFor(() => expect(pin()).toHaveStyle({ left: '95px', top: '179px' }))
  } finally {
    panel.remove()
  }
})

it('ignores internal mutations and cancels a pending pin update when unmounted', async () => {
  vi.useFakeTimers()
  const selectionTarget = { selector: 'body', url: location.href, x: 30, y: 20 }
  const view = render(<FeedbackWidget projectId="host" conversation={{
    feedback: [], selection: 'Passage', selectionTarget, onClearSelection: vi.fn(), authorName: 'Ada',
    onComment: vi.fn(async () => {}), errorMessage: () => 'Offline',
  }} />)
  const schedule = vi.spyOn(window, 'requestAnimationFrame')
  await act(async () => {
    view.container.querySelector('[data-fw]')!.setAttribute('data-internal', 'true')
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(schedule).not.toHaveBeenCalled()
  await act(async () => {
    view.container.setAttribute('data-layout-change', 'true')
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(schedule).toHaveBeenCalled()
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  await act(async () => {
    view.container.setAttribute('data-layout-change', 'again')
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(schedule).toHaveBeenCalledTimes(1)
  expect(cancel).not.toHaveBeenCalled()
  view.unmount()
  expect(cancel).toHaveBeenCalledWith(schedule.mock.results[schedule.mock.results.length - 1].value)
})
