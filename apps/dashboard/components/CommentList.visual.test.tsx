import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommentList } from './CommentList'
import type { Comment } from '../lib/types'

const comment: Comment = { id: 'one', projectId: 'project', body: 'A long comment about the product', author: 'Reviewer', authorInitial: 'R', authorColor: 'grey', createdAt: '', updatedAt: '', pageUrl: null, selector: null, x: null, y: null, screenshotUrl: null, reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null, targetType: 'element_point', anchor: null, githubIssue: null }
describe('comment list visual refresh', () => {
  it('uses quiet neutral selection states without colored edge rails', () => {
    const open = vi.fn(), toggle = vi.fn()
    const props = { filteredComments: [comment], counts: { all: 1, open: 1, ready: 0, ready_for_testing: 0, done: 0, rejected: 0 }, statusFilter: 'all' as const, selectFilter: vi.fn(), bulkMode: false, enterBulkMode: vi.fn(), exitBulkMode: vi.fn(), bulkSelectedIds: new Set<string>(), toggleSelectAllVisible: vi.fn(), toggleBulkSelect: toggle, commentsLoading: false, commentsError: null, selectedCommentId: '', setSelectedCommentId: open }
    const view = render(<CommentList {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Testing/ }))
    expect(props.selectFilter).toHaveBeenCalledWith('ready_for_testing')
    fireEvent.click(screen.getByRole('button', { name: /A long comment/ }))
    expect(open).toHaveBeenCalledWith('one')
    view.rerender(<CommentList {...props} selectedCommentId="one" />)
    const active = screen.getByRole('button', { name: /A long comment/ })
    expect(active).toHaveClass('bg-accent')
    expect(active).toHaveAttribute('aria-pressed', 'true')
    expect(active.className).not.toContain('border-l')
    view.rerender(<CommentList {...props} bulkMode />)
    fireEvent.click(screen.getByRole('button', { name: /A long comment/ }))
    expect(toggle).toHaveBeenCalledWith('one')
    expect(open).toHaveBeenCalledTimes(1)
    view.rerender(<CommentList {...props} filteredComments={[{ ...comment, implementationStatus: 'done' }]} />)
    expect(screen.getByRole('button', { name: /A long comment/ })).toHaveClass('bg-muted/30')
    view.rerender(<CommentList {...props} bulkMode bulkSelectedIds={new Set(['one'])} filteredComments={[{ ...comment, implementationStatus: 'done' }]} />)
    const selected = screen.getByRole('button', { name: /A long comment/ })
    expect(selected).toHaveClass('bg-muted')
    expect(selected).not.toHaveClass('bg-muted/30', 'bg-primary/10')
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.overflow-y-auto')).toHaveClass('pb-24')
  })
})
