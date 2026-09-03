import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommentList } from './CommentList'
import { StatusBar } from './StatusBar'
import type { Comment } from '../lib/types'

const comment: Comment = { id: 'c1', projectId: 'p1', pageUrl: null, selector: '#target', x: 1, y: 2, body: 'Project feedback', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null, createdAt: '', updatedAt: '', author: 'You', authorInitial: 'Y', authorColor: '#000', screenshotUrl: null, targetType: 'element_point', anchor: null, githubIssue: null }
const counts = { all: 1, open: 1, ready: 0, done: 0, rejected: 0 }

describe('shared feedback controls', () => {
  it('preserves project filters, selection, and bulk status actions', () => {
    const props = { filteredComments: [comment], counts, statusFilter: 'all' as const, selectFilter: vi.fn(), bulkMode: false, enterBulkMode: vi.fn(), exitBulkMode: vi.fn(), bulkSelectedIds: new Set<string>(), toggleSelectAllVisible: vi.fn(), applyBulkAction: vi.fn(), toggleBulkSelect: vi.fn(), commentsLoading: false, commentsError: null, selectedCommentId: '', setSelectedCommentId: vi.fn() }
    const view = render(<CommentList {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' })); expect(props.enterBulkMode).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Open 1' })); expect(props.selectFilter).toHaveBeenCalledWith('open')
    fireEvent.click(screen.getByRole('button', { name: /Project feedback/ })); expect(props.setSelectedCommentId).toHaveBeenCalledWith('c1')
    view.rerender(<CommentList {...props} bulkMode />)
    fireEvent.click(screen.getByRole('button', { name: /Project feedback/ })); expect(props.toggleBulkSelect).toHaveBeenCalledWith('c1')
    expect(screen.getByRole('button', { name: 'Ready' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' })); expect(props.toggleSelectAllVisible).toHaveBeenCalledOnce()
    view.rerender(<CommentList {...props} bulkMode bulkSelectedIds={new Set(['c1'])} />)
    expect(screen.getByRole('button', { name: 'Deselect all' })).toBeInTheDocument()
    for (const [name, action] of [['Ready', 'ready'], ['Done', 'done'], ['Reject', 'reject']]) {
      fireEvent.click(screen.getByRole('button', { name })); expect(props.applyBulkAction).toHaveBeenCalledWith(action)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(props.exitBulkMode).toHaveBeenCalledOnce()
    view.rerender(<CommentList {...props} bulkMode filteredComments={[]} />)
    expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument()
  })

  it('has no status controls in personal mode, including missing page context', () => {
    render(<CommentList personal filteredComments={[comment]} counts={counts} commentsLoading={false} commentsError={null} selectedCommentId="" setSelectedCommentId={vi.fn()} />)
    expect(screen.getByText('1 My Comments')).toBeInTheDocument()
    expect(screen.queryByText('Open')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()
  })

  it('advertises only personal navigation shortcuts in My Comments', () => {
    const show = vi.fn()
    const view = render(<StatusBar sidebarOpen={false} onShowSidebar={show} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show agent panel' })); expect(show).toHaveBeenCalledOnce()
    expect(screen.getByText('ready')).toBeInTheDocument()
    view.rerender(<StatusBar sidebarOpen onShowSidebar={show} />)
    expect(screen.queryByRole('button')).toBeNull()
    view.rerender(<StatusBar personal sidebarOpen={false} onShowSidebar={show} />)
    for (const label of ['ready', 'done', 'reject', 'sidebar', 'search']) expect(screen.queryByText(label)).toBeNull()
    expect(screen.getByText('Space')).toBeInTheDocument()
    expect(screen.getByText('J')).toBeInTheDocument()
    expect(screen.getByText('K')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
