import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductAuditWorkspace } from './ProductAuditWorkspace'

describe('ProductAuditWorkspace', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the agent trace before revealing verified findings', () => {
    render(<ProductAuditWorkspace inputUrl="https://demo.crrt.ai" stageDelayMs={10} />)

    expect(screen.getByText('EXPLORER_IN_PROGRESS')).toBeInTheDocument()
    expect(screen.queryByText(/findings cleared the bar/i)).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(30))

    expect(screen.getByText(/3 findings cleared the bar/i)).toBeInTheDocument()
    expect(screen.getByText('The free-trial promise breaks at signup')).toBeInTheDocument()
    expect(screen.getAllByText('not provided')).toHaveLength(3)
  })
})

