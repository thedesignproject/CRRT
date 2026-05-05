import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLiveSelectors } from '../components/FeedbackWidget/hooks/useLiveSelectors'
import type { Comment } from '../components/FeedbackWidget/types'

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    projectId: 'p',
    pageUrl: 'http://localhost/',
    x: 0,
    y: 0,
    selector: '#fixture-live',
    body: 'x',
    reviewStatus: 'open',
    createdAt: '2026-04-22T00:00:00Z',
    ...overrides,
  }
}

describe('useLiveSelectors', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.querySelectorAll('[data-test-live]').forEach((n) => n.remove())
  })

  it('starts with selectors that resolve on the current DOM', () => {
    const target = document.createElement('div')
    target.id = 'fixture-live'
    target.setAttribute('data-test-live', '')
    document.body.appendChild(target)

    const { result } = renderHook(() => useLiveSelectors([comment()]))
    expect(result.current.has('c1')).toBe(true)
  })

  it('omits selectors that do not resolve', () => {
    const { result } = renderHook(() => useLiveSelectors([comment({ selector: '.does-not-exist' })]))
    expect(result.current.has('c1')).toBe(false)
  })

  it('survives invalid selectors without throwing', () => {
    expect(() =>
      renderHook(() => useLiveSelectors([comment({ selector: '$invalid$' })])),
    ).not.toThrow()
  })

  it('updates after DOM mutation + 250ms throttle', async () => {
    const list = [comment({ selector: '#new-live' })]
    const { result } = renderHook(() => useLiveSelectors(list))
    expect(result.current.has('c1')).toBe(false)

    const target = document.createElement('div')
    target.id = 'new-live'
    target.setAttribute('data-test-live', '')
    await act(async () => {
      document.body.appendChild(target)
      // MutationObserver callbacks are queued; advance microtasks + 250ms throttle.
      await Promise.resolve()
      vi.advanceTimersByTime(250)
    })
    expect(result.current.has('c1')).toBe(true)
  })

  it('disconnects observer on unmount', () => {
    const target = document.createElement('div')
    target.id = 'fixture-live'
    target.setAttribute('data-test-live', '')
    document.body.appendChild(target)

    const { unmount } = renderHook(() => useLiveSelectors([comment()]))
    unmount()
    // After unmount, mutating the DOM should not throw / re-trigger.
    document.body.appendChild(document.createElement('span'))
  })
})
