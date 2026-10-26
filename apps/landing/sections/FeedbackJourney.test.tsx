import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FeedbackJourney } from './FeedbackJourney'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps the original feedback through context, handoff, and human review', () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  const { container } = render(<FeedbackJourney />)
  const stage = () => container.querySelector('.journey-sticky')!
  expect(stage().textContent).toContain('1 comment · 0 ready')
  expect(stage().textContent).toContain('Open agent')
  expect(stage().textContent).toContain('Approve comments to queue work')
  expect(stage().querySelector('figure')).toHaveAccessibleName('Screenshot of the pricing page with the selected button highlighted')
  for (const [label, expected] of [['Bring the team together', 'Dianne'], ['Choose the next step', 'Linear']]) {
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(stage().textContent).toContain(expected)
  }
  for (const destination of ['Linear', 'GitHub', 'Jira', 'Claude Code', 'Codex', 'Cursor']) expect(stage().textContent).toContain(destination)
  expect(stage().textContent).toContain('Send to Claude Code')
  expect(screen.queryByRole('button', { name: 'Add your project’s rules' })).not.toBeInTheDocument()
})

it('supports scroll activation, direct navigation, and disconnects on unmount', () => {
  let callback: IntersectionObserverCallback
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(next: IntersectionObserverCallback) { callback = next }
    observe = vi.fn()
    disconnect = disconnect
  })
  const { container, unmount } = render(<FeedbackJourney />)
  const target = container.querySelector('[data-step="2"]')!
  act(() => callback([{ target, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
  expect(screen.getByRole('button', { name: 'Choose the next step' })).toHaveAttribute('aria-pressed', 'true')
  act(() => callback([{ target, isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
  const first = container.querySelector<HTMLElement>('[data-step="0"]')!
  first.scrollIntoView = vi.fn()
  fireEvent.click(screen.getByRole('button', { name: 'Comment in context' }))
  expect(screen.getByRole('button', { name: 'Comment in context' })).toHaveAttribute('aria-pressed', 'true')
  unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})
