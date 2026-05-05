import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePillDrag } from '../components/FeedbackWidget/hooks/usePillDrag'

describe('usePillDrag', () => {
  it('initializes pillPos near the bottom-right corner', () => {
    const { result } = renderHook(() => usePillDrag())
    expect(result.current.pillPos.x).toBe(window.innerWidth - 72)
    expect(result.current.pillPos.y).toBe(window.innerHeight - 200)
    expect(result.current.draggingRef.current).toBe(false)
    expect(result.current.didDragRef.current).toBe(false)
  })

  it('onPointerDown sets dragging and resets didDrag', () => {
    const { result } = renderHook(() => usePillDrag())
    const fakeEvent = {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
      target: { setPointerCapture: () => {} },
    } as unknown as React.PointerEvent
    act(() => {
      result.current.onPointerDown(fakeEvent)
    })
    expect(result.current.draggingRef.current).toBe(true)
    expect(result.current.didDragRef.current).toBe(false)
  })

  it('pointermove while dragging clamps to viewport and sets didDrag=true', () => {
    const { result } = renderHook(() => usePillDrag())
    const fakeEvent = {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      target: { setPointerCapture: () => {} },
    } as unknown as React.PointerEvent
    act(() => {
      result.current.onPointerDown(fakeEvent)
    })
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 9999, clientY: 9999 }))
    })
    expect(result.current.didDragRef.current).toBe(true)
    expect(result.current.pillPos.x).toBeLessThanOrEqual(window.innerWidth - 48)
    expect(result.current.pillPos.y).toBeLessThanOrEqual(window.innerHeight - 160)
  })

  it('pointermove without prior pointerdown is a no-op', () => {
    const { result } = renderHook(() => usePillDrag())
    const before = result.current.pillPos
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }))
    })
    expect(result.current.pillPos).toEqual(before)
    expect(result.current.didDragRef.current).toBe(false)
  })

  it('pointerup clears dragging', () => {
    const { result } = renderHook(() => usePillDrag())
    const fakeEvent = {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      target: { setPointerCapture: () => {} },
    } as unknown as React.PointerEvent
    act(() => {
      result.current.onPointerDown(fakeEvent)
    })
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'))
    })
    expect(result.current.draggingRef.current).toBe(false)
  })

  it('window resize clamps pillPos back inside the viewport', () => {
    const { result } = renderHook(() => usePillDrag())
    const fakeEvent = {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      target: { setPointerCapture: () => {} },
    } as unknown as React.PointerEvent
    act(() => {
      result.current.onPointerDown(fakeEvent)
    })
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 9999, clientY: 9999 }))
    })
    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 })
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.pillPos.x).toBeLessThanOrEqual(200 - 48)
    expect(result.current.pillPos.y).toBeLessThanOrEqual(200 - 160)
  })
})
