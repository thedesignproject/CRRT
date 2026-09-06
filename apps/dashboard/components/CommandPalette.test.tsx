import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'

describe('<CommandPalette /> permissions', () => {
  it('keeps navigation filters but hides reviewer and Agent actions for guests', () => {
    render(
      <CommandPalette
        onClose={vi.fn()}
        comments={[]}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        selectedCommentId=""
        canManageFeedback={false}
        canOperateAgent={false}
      />,
    )

    expect(screen.getByText('Filter: All')).toBeInTheDocument()
    expect(screen.queryByText('Toggle Ready for Agent')).toBeNull()
    expect(screen.queryByText('Toggle Done')).toBeNull()
    expect(screen.queryByText('Toggle Reject')).toBeNull()
    expect(screen.queryByText('Toggle agent panel')).toBeNull()
  })
})
