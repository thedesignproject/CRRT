import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FeedbackWidget } from '../index'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('cancels a pending live-pin DOM scan when the widget unmounts', async () => {
  vi.useFakeTimers()
  const view = render(
    <FeedbackWidget
      projectId="host"
      conversation={{
        feedback: [],
        selection: '',
        onClearSelection: vi.fn(),
        onComment: vi.fn(async () => {}),
        errorMessage: () => 'Offline',
      }}
    />,
  )
  const schedule = vi.spyOn(window, 'setTimeout')
  await act(async () => {
    view.container.setAttribute('data-layout-change', 'true')
    await vi.advanceTimersByTimeAsync(0)
  })
  const scan = schedule.mock.calls.findIndex(([, delay]) => delay === 250)
  expect(scan).toBeGreaterThanOrEqual(0)
  const cancel = vi.spyOn(window, 'clearTimeout')
  view.unmount()
  expect(cancel).toHaveBeenCalledWith(schedule.mock.results[scan].value)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
})
