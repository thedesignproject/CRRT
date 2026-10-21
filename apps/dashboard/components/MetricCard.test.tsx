import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MetricCard } from './MetricCard'

describe('MetricCard', () => {
  it('renders a static headline number without a button', () => {
    render(<MetricCard label="Unresolved comments" value={1234} />)
    expect(screen.getByText('Unresolved comments')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('becomes a button with context when it can open the records', () => {
    const open = vi.fn()
    render(<MetricCard label="Unresolved comments" value={12} detail="Across marketing-site" onOpen={open} />)
    fireEvent.click(screen.getByRole('button', { name: /Unresolved comments\s*12\s*Across marketing-site/ }))
    expect(open).toHaveBeenCalledOnce()
  })
})
