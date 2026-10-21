import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatusBreakdown } from './StatusBreakdown'

const counts = { open: 4, ready: 2, ready_for_testing: 1, done: 8, rejected: 0 }

describe('StatusBreakdown', () => {
  it('labels every status in workflow order with bars scaled to the largest count', () => {
    const { container } = render(<StatusBreakdown counts={counts} />)
    expect(screen.getByText('Comments by status')).toBeInTheDocument()
    expect(screen.getByText('15 total')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Open4', 'Ready for Agent2', 'Ready for testing1', 'Done8', 'Rejected0',
    ])
    const bars = Array.from(container.querySelectorAll<HTMLElement>('[style]')).map((bar) => bar.style.width)
    expect(bars).toEqual(['50%', '25%', '12.5%', '100%'])
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens a status from its row and survives an empty project', () => {
    const select = vi.fn()
    const view = render(<StatusBreakdown counts={counts} title="Marketing site" onSelect={select} />)
    expect(screen.getByText('Marketing site')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done: 8' }))
    expect(select).toHaveBeenCalledWith('done')
    view.rerender(<StatusBreakdown counts={{ open: 0, ready: 0, ready_for_testing: 0, done: 0, rejected: 0 }} />)
    expect(screen.getByText('0 total')).toBeInTheDocument()
    expect(view.container.querySelectorAll('[style]')).toHaveLength(0)
  })
})
