import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useElementSelection } from '../components/FeedbackWidget/hooks/useElementSelection'

describe('useElementSelection', () => {
  it('does nothing when mode is not selecting', () => {
    const onPick = vi.fn()
    renderHook(() => useElementSelection({ mode: 'idle', onPick }))
    expect(document.body.style.cursor).not.toBe('crosshair')
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('sets crosshair cursor while selecting and restores on unmount', () => {
    document.body.style.cursor = 'pointer'
    const { unmount } = renderHook(() => useElementSelection({ mode: 'selecting', onPick: vi.fn() }))
    expect(document.body.style.cursor).toBe('crosshair')
    unmount()
    expect(document.body.style.cursor).toBe('pointer')
  })

  it('click on a non-widget element fires onPick with selector + percent coords', () => {
    const onPick = vi.fn()
    const target = document.createElement('article')
    target.id = 'fixture-target'
    document.body.appendChild(target)

    renderHook(() => useElementSelection({ mode: 'selecting', onPick }))
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onPick).toHaveBeenCalledOnce()
    const [pickedTarget, pickedEl] = onPick.mock.calls[0]
    expect(pickedEl).toBe(target)
    expect(pickedTarget.selector).toBeTypeOf('string')
    expect(pickedTarget.url).toBe(window.location.href)

    document.body.removeChild(target)
  })

  it('click inside [data-fw] is a no-op (does not call onPick)', () => {
    const onPick = vi.fn()
    const widgetRoot = document.createElement('div')
    widgetRoot.setAttribute('data-fw', '')
    const inner = document.createElement('button')
    widgetRoot.appendChild(inner)
    document.body.appendChild(widgetRoot)

    renderHook(() => useElementSelection({ mode: 'selecting', onPick }))
    inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onPick).not.toHaveBeenCalled()

    document.body.removeChild(widgetRoot)
  })

  it('mousemove on a non-widget element applies the highlight outline', () => {
    const target = document.createElement('section')
    document.body.appendChild(target)
    renderHook(() => useElementSelection({ mode: 'selecting', onPick: vi.fn() }))
    act(() => {
      target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    })
    expect(target.style.outline).toContain('rgba(59, 130, 246, 0.6)')
    document.body.removeChild(target)
  })

  it('mousemove inside [data-fw] does NOT highlight', () => {
    const widget = document.createElement('div')
    widget.setAttribute('data-fw', '')
    const inner = document.createElement('span')
    widget.appendChild(inner)
    document.body.appendChild(widget)

    renderHook(() => useElementSelection({ mode: 'selecting', onPick: vi.fn() }))
    inner.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(inner.style.outline).toBe('')
    document.body.removeChild(widget)
  })
})
