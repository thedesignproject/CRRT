import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ActionBtn } from './primitives'
it('hides disabled shortcut hints without disabling the action', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'disabled' })
  try {
    const click = vi.fn()
    render(<ActionBtn variant="accept" shortcut="A" onClick={click}>Accept</ActionBtn>)
    expect(screen.getByRole('button', { name: 'Accept' })).not.toHaveAttribute('title')
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(click).toHaveBeenCalledOnce()
  } finally { vi.unstubAllGlobals() }
})

it('marks the primary action carrot and pressed actions with their status', () => {
  const { rerender } = render(<ActionBtn variant="accept" primary>Ready</ActionBtn>)
  expect(screen.getByRole('button', { name: 'Ready' })).toHaveClass('bg-primary')
  expect(screen.getByRole('button', { name: 'Ready' })).toHaveAttribute('aria-pressed', 'false')
  rerender(<ActionBtn variant="accept" primary active>Ready</ActionBtn>)
  expect(screen.getByRole('button', { name: 'Ready' })).toHaveClass('text-status-agent-fg')
  expect(screen.getByRole('button', { name: 'Ready' })).toHaveAttribute('aria-pressed', 'true')
  rerender(<ActionBtn variant="done" active>Done</ActionBtn>)
  expect(screen.getByRole('button', { name: 'Done' })).toHaveClass('text-status-fixed-fg')
  rerender(<ActionBtn variant="reject" active>Reject</ActionBtn>)
  expect(screen.getByRole('button', { name: 'Reject' })).toHaveClass('text-status-rejected')
  rerender(<ActionBtn variant="neutral">Open</ActionBtn>)
  expect(screen.getByRole('button', { name: 'Open' })).not.toHaveAttribute('aria-pressed')
  expect(screen.getByRole('button', { name: 'Open' })).toHaveClass('bg-surface-2')
})
