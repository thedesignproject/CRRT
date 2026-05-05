import { describe, it, expect, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from '../components/FeedbackWidget/hooks/useKeyboardShortcuts'
import type { Mode } from '../components/FeedbackWidget/types'

function setup(overrides: Partial<Parameters<typeof useKeyboardShortcuts>[0]> = {}) {
  const handlers = {
    mode: 'idle' as Mode,
    sidebarOpen: false,
    selectedPin: null as string | null,
    showNameModal: false,
    onEscape: vi.fn(),
    onCmdEnter: vi.fn(),
    onToggleAgents: vi.fn(),
    onToggleMode: vi.fn(),
    onEnterFeedback: vi.fn(),
    onToggleSidebar: vi.fn(),
    onTogglePins: vi.fn(),
    ...overrides,
  }
  renderHook(() => useKeyboardShortcuts(handlers))
  return handlers
}

describe('useKeyboardShortcuts', () => {
  it('Escape always fires onEscape', () => {
    const { onEscape } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalled()
  })

  it('Cmd+Enter only fires onCmdEnter while in commenting mode', () => {
    const { onCmdEnter } = setup({ mode: 'commenting' })
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    expect(onCmdEnter).toHaveBeenCalledOnce()

    const idle = setup({ mode: 'idle' })
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    expect(idle.onCmdEnter).not.toHaveBeenCalled()
  })

  it('Ctrl+Enter also fires onCmdEnter in commenting mode', () => {
    const { onCmdEnter } = setup({ mode: 'commenting' })
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(onCmdEnter).toHaveBeenCalledOnce()
  })

  it('Shift+A toggles agents and short-circuits the "a"-only path', () => {
    const { onToggleAgents, onEnterFeedback } = setup()
    fireEvent.keyDown(window, { key: 'A', shiftKey: true })
    expect(onToggleAgents).toHaveBeenCalledOnce()
    expect(onEnterFeedback).not.toHaveBeenCalled()
  })

  it('"c" / "C" fires onToggleMode', () => {
    const { onToggleMode } = setup()
    fireEvent.keyDown(window, { key: 'c' })
    fireEvent.keyDown(window, { key: 'C' })
    expect(onToggleMode).toHaveBeenCalledTimes(2)
  })

  it('"s" / "S" fires onEnterFeedback', () => {
    const { onEnterFeedback } = setup()
    fireEvent.keyDown(window, { key: 's' })
    fireEvent.keyDown(window, { key: 'S' })
    expect(onEnterFeedback).toHaveBeenCalledTimes(2)
  })

  it('"m" / "M" / "f" / "F" fires onToggleSidebar', () => {
    const { onToggleSidebar } = setup()
    for (const key of ['m', 'M', 'f', 'F']) {
      fireEvent.keyDown(window, { key })
    }
    expect(onToggleSidebar).toHaveBeenCalledTimes(4)
  })

  it('"h" / "H" fires onTogglePins', () => {
    const { onTogglePins } = setup()
    fireEvent.keyDown(window, { key: 'h' })
    fireEvent.keyDown(window, { key: 'H' })
    expect(onTogglePins).toHaveBeenCalledTimes(2)
  })

  it('single-key shortcuts are suppressed when typing in INPUT/TEXTAREA/SELECT', () => {
    const { onToggleMode } = setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'c' })
    expect(onToggleMode).not.toHaveBeenCalled()
    document.body.removeChild(input)

    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    fireEvent.keyDown(ta, { key: 'c' })
    expect(onToggleMode).not.toHaveBeenCalled()
    document.body.removeChild(ta)
  })

  it('Escape still fires when typing (modal/cancel still works mid-input)', () => {
    const { onEscape } = setup({ mode: 'commenting' })
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalled()
    document.body.removeChild(ta)
  })
})
