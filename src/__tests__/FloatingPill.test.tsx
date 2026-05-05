import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { FloatingPill } from '../components/FeedbackWidget/pill/FloatingPill'
import type { Mode } from '../components/FeedbackWidget/types'

function renderPill(overrides: Partial<Parameters<typeof FloatingPill>[0]> = {}) {
  const handlers = {
    pillRef: createRef<HTMLDivElement>(),
    pillPos: { x: 100, y: 100 },
    draggingRef: { current: false },
    didDragRef: { current: false },
    onPointerDown: vi.fn(),
    mode: 'idle' as Mode,
    pinsVisible: true,
    onTogglePins: vi.fn(),
    agentsRevealed: false,
    onOpenAgent: vi.fn(),
    badgeAnim: false,
    commentCount: 0,
    onToggleSidebar: vi.fn(),
    onToggleMode: vi.fn(),
    ...overrides,
  }
  const utils = render(<FloatingPill {...handlers} />)
  return { ...utils, ...handlers }
}

function pillButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
}

describe('<FloatingPill />', () => {
  it('routes the comment trigger (index 0) to onToggleMode', () => {
    const { onToggleMode, container } = renderPill()
    fireEvent.click(pillButtons(container)[0]!)
    expect(onToggleMode).toHaveBeenCalled()
  })

  it('routes the eye/eye-off trigger (index 1) to onTogglePins', () => {
    const { onTogglePins, container } = renderPill()
    fireEvent.click(pillButtons(container)[1]!)
    expect(onTogglePins).toHaveBeenCalled()
  })

  it('routes the menu trigger (index 2 when no agent) to onToggleSidebar', () => {
    const { onToggleSidebar, container } = renderPill()
    fireEvent.click(pillButtons(container)[2]!)
    expect(onToggleSidebar).toHaveBeenCalled()
  })

  it('shows the agent button when agentsRevealed and routes click to onOpenAgent', () => {
    const { onOpenAgent, container } = renderPill({ agentsRevealed: true })
    fireEvent.click(pillButtons(container)[2]!)
    expect(onOpenAgent).toHaveBeenCalled()
  })

  it('routes the menu trigger (index 3 when agent revealed) to onToggleSidebar', () => {
    const { onToggleSidebar, container } = renderPill({ agentsRevealed: true })
    fireEvent.click(pillButtons(container)[3]!)
    expect(onToggleSidebar).toHaveBeenCalled()
  })

  it('suppresses click handlers when didDragRef is true', () => {
    const { onToggleMode, onTogglePins, onToggleSidebar, container } = renderPill({
      didDragRef: { current: true },
    })
    pillButtons(container).forEach((b) => fireEvent.click(b))
    expect(onToggleMode).not.toHaveBeenCalled()
    expect(onTogglePins).not.toHaveBeenCalled()
    expect(onToggleSidebar).not.toHaveBeenCalled()
  })

  it("shows 'Exit' label when mode is not idle", () => {
    renderPill({ mode: 'selecting' })
    expect(screen.getByText('Exit')).toBeDefined()
  })

  it('renders the Show pins label when pinsVisible is false', () => {
    renderPill({ pinsVisible: false })
    expect(screen.getAllByText('Show pins').length).toBeGreaterThan(0)
  })

  it('shows the comment-count badge when commentCount > 0', () => {
    const { container } = renderPill({ commentCount: 3, badgeAnim: true })
    const badge = Array.from(container.querySelectorAll<HTMLDivElement>('div')).find(
      (d) => (d.getAttribute('style') ?? '').includes('#0ea5e9'),
    )
    expect(badge).toBeDefined()
    expect(badge!.style.animation).toContain('fw-badge-pop')
  })

  it('renders grabbing cursor when draggingRef.current is true', () => {
    const { container } = renderPill({ draggingRef: { current: true } })
    const root = container.firstElementChild as HTMLElement
    expect(root.style.cursor).toBe('grabbing')
  })

  it('suppresses agent click when didDragRef is true', () => {
    const { onOpenAgent, container } = renderPill({ agentsRevealed: true, didDragRef: { current: true } })
    fireEvent.click(pillButtons(container)[2]!)
    expect(onOpenAgent).not.toHaveBeenCalled()
  })
})
