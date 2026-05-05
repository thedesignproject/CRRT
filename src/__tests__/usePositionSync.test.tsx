import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePositionSync } from '../components/FeedbackWidget/hooks/usePositionSync'

function flushRaf() {
  // happy-dom's RAF is setTimeout(0). Wait a microtask + a tick.
  return new Promise<void>((r) => setTimeout(r, 0))
}

describe('usePositionSync', () => {
  it('does not throw when scroll fires while inactive', () => {
    let renderCount = 0
    renderHook(() => {
      renderCount++
      usePositionSync(false)
    })
    const before = renderCount
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(renderCount).toBe(before)
  })

  it('triggers a re-render after scroll while active', async () => {
    let renderCount = 0
    renderHook(() => {
      renderCount++
      usePositionSync(true)
    })
    const before = renderCount
    await act(async () => {
      window.dispatchEvent(new Event('scroll'))
      await flushRaf()
    })
    expect(renderCount).toBeGreaterThan(before)
  })

  it('triggers a re-render after resize while active', async () => {
    let renderCount = 0
    renderHook(() => {
      renderCount++
      usePositionSync(true)
    })
    const before = renderCount
    await act(async () => {
      window.dispatchEvent(new Event('resize'))
      await flushRaf()
    })
    expect(renderCount).toBeGreaterThan(before)
  })

  it('cancels RAF and removes listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => usePositionSync(true))
    unmount()
    expect(removeSpy).toHaveBeenCalled()
    removeSpy.mockRestore()
  })
})
