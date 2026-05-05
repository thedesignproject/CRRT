import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PinActionCluster } from '../components/FeedbackWidget/pin/PinActionCluster'

function renderCluster(overrides: Partial<Parameters<typeof PinActionCluster>[0]> = {}) {
  const handlers = {
    isResolved: false,
    onResolve: vi.fn(),
    onToggleResolve: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  const utils = render(<PinActionCluster {...handlers} />)
  return { ...utils, ...handlers }
}

describe('<PinActionCluster />', () => {
  it('shows the standalone Approve button when not resolved', () => {
    const { onResolve, getByTitle } = renderCluster()
    fireEvent.click(getByTitle('Approve'))
    expect(onResolve).toHaveBeenCalledOnce()
  })

  it('hides the standalone Approve button when resolved', () => {
    const { queryByTitle } = renderCluster({ isResolved: true })
    expect(queryByTitle('Approve')).toBeNull()
  })

  it('opens the kebab menu and routes Reopen to onToggleResolve when resolved', () => {
    const { getByTitle, onToggleResolve } = renderCluster({ isResolved: true })
    fireEvent.click(getByTitle('More'))
    fireEvent.click(screen.getByText('Reopen'))
    expect(onToggleResolve).toHaveBeenCalledOnce()
  })

  it('routes Edit and Delete from the kebab menu', () => {
    const { getByTitle, onEdit, onDelete } = renderCluster()
    fireEvent.click(getByTitle('More'))
    fireEvent.click(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalledOnce()

    fireEvent.click(getByTitle('More'))
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('toggles the kebab menu off when clicking the backdrop', () => {
    const { getByTitle, container } = renderCluster()
    fireEvent.click(getByTitle('More'))
    expect(screen.queryByText('Edit')).not.toBeNull()
    const backdrop = container.querySelector('div[style*="position: fixed"]') as HTMLElement
    fireEvent.click(backdrop)
    expect(screen.queryByText('Edit')).toBeNull()
  })
})
