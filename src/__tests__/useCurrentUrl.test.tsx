import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCurrentUrl } from '../components/FeedbackWidget/hooks/useCurrentUrl'

describe('useCurrentUrl', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current location.href stripped of hash', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: 'http://localhost/page#frag' },
    })
    const { result } = renderHook(() => useCurrentUrl())
    expect(result.current).toBe('http://localhost/page')
  })

  it('updates when location.href changes after the 300ms tick', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: 'http://localhost/a' },
    })
    const { result } = renderHook(() => useCurrentUrl())
    expect(result.current).toBe('http://localhost/a')

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: 'http://localhost/b' },
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('http://localhost/b')
  })

  it('skips re-rendering when the URL has not changed', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: 'http://localhost/same' },
    })
    const { result } = renderHook(() => useCurrentUrl())
    const before = result.current
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe(before)
  })

  it('clears the interval on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const { unmount } = renderHook(() => useCurrentUrl())
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('treats hash-only changes as the same URL', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: 'http://localhost/x' },
    })
    const { result } = renderHook(() => useCurrentUrl())
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: 'http://localhost/x#section' },
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('http://localhost/x')
  })
})
