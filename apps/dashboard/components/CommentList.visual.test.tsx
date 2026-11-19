import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommentList } from './CommentList'
import type { Comment } from '../lib/types'

const comment: Comment = { id: 'one', projectId: 'project', body: 'A long comment about the product', author: 'Reviewer', authorInitial: 'R', authorColor: 'grey', createdAt: '', updatedAt: '', pageUrl: null, selector: null, x: null, y: null, screenshotUrl: null, reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null, targetType: 'element_point', anchor: null, githubIssue: null }
describe('comment list visual refresh', () => {
  it('marks the open comment with the carrot rail and bulk picks with a quiet fill', () => {
    const open = vi.fn(), toggle = vi.fn()
    const props = { filteredComments: [comment], counts: { all: 1, open: 1, ready: 0, ready_for_testing: 0, done: 0, rejected: 0 }, statusFilter: 'all' as const, selectFilter: vi.fn(), bulkMode: false, enterBulkMode: vi.fn(), exitBulkMode: vi.fn(), bulkSelectedIds: new Set<string>(), toggleSelectAllVisible: vi.fn(), toggleBulkSelect: toggle, commentsLoading: false, commentsError: null, selectedCommentId: '', setSelectedCommentId: open }
    const view = render(<CommentList {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(props.toggleSelectAllVisible).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('tab', { name: /Testing/ }))
    expect(props.selectFilter).toHaveBeenCalledWith('ready_for_testing')
    fireEvent.click(screen.getByRole('button', { name: /A long comment/ }))
    expect(open).toHaveBeenCalledWith('one')
    view.rerender(<CommentList {...props} selectedCommentId="one" />)
    const active = screen.getByRole('button', { name: /A long comment/ })
    expect(active).toHaveClass('bg-surface-4', 'shadow-[inset_2px_0_0_var(--carrot)]')
    expect(active).toHaveAttribute('aria-pressed', 'true')
    view.rerender(<CommentList {...props} bulkMode />)
    fireEvent.click(screen.getByRole('button', { name: /A long comment/ }))
    expect(toggle).toHaveBeenCalledWith('one')
    expect(open).toHaveBeenCalledTimes(1)
    view.rerender(<CommentList {...props} filteredComments={[{ ...comment, implementationStatus: 'done' }]} />)
    expect(screen.getByText('A long comment about the product')).toHaveClass('text-text-subtle')
    view.rerender(<CommentList {...props} bulkMode bulkSelectedIds={new Set(['one'])} filteredComments={[{ ...comment, implementationStatus: 'done' }]} />)
    const selected = screen.getByRole('button', { name: /A long comment/ })
    expect(selected).toHaveClass('bg-surface-4')
    expect(selected.className).not.toContain('--carrot')
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.overflow-y-auto')).toHaveClass('pb-24')
  })
})

it('selects directly and extends a visible range in either direction without opening feedback', () => {
 const toggle = vi.fn(), open = vi.fn()
 const props = { filteredComments: ['one','two','three'].map(id => ({...comment,id,body:id})), counts: { all: 3, open: 3, ready: 0, ready_for_testing: 0, done: 0, rejected: 0 }, statusFilter: 'all' as const, selectFilter: vi.fn(), bulkMode: false, enterBulkMode: vi.fn(), exitBulkMode: vi.fn(), bulkSelectedIds: new Set<string>(), toggleSelectAllVisible: vi.fn(), toggleBulkSelect: toggle, commentsLoading: false, commentsError: null, selectedCommentId: '', setSelectedCommentId: open }
 const view = render(<CommentList {...props} />)
 fireEvent.click(screen.getByRole('checkbox', {name:'Select feedback: one'}), {shiftKey:true})
 expect(toggle).toHaveBeenLastCalledWith('one',undefined)
 fireEvent.click(screen.getByRole('checkbox', {name:'Select feedback: three'}), {shiftKey:true})
 expect(toggle).toHaveBeenLastCalledWith('three',['one','two','three'])
 fireEvent.click(screen.getByRole('checkbox', {name:'Select feedback: one'}), {shiftKey:true})
 expect(toggle).toHaveBeenLastCalledWith('one',['one','two','three'])
 fireEvent.click(screen.getByRole('checkbox', {name:'Select feedback: two'}))
 expect(toggle).toHaveBeenLastCalledWith('two',undefined)
 expect(open).not.toHaveBeenCalled()
 view.rerender(<CommentList {...props} readOnly />)
 expect(screen.queryByRole('checkbox')).toBeNull()
})

describe('empty and located states', () => {
  const base = { counts: { all: 3, open: 0, ready: 1, ready_for_testing: 2, done: 0, rejected: 0 }, statusFilter: 'open' as const, selectFilter: vi.fn(), bulkMode: false, enterBulkMode: vi.fn(), exitBulkMode: vi.fn(), bulkSelectedIds: new Set<string>(), toggleSelectAllVisible: vi.fn(), toggleBulkSelect: vi.fn(), commentsLoading: false, commentsError: null, selectedCommentId: '', setSelectedCommentId: vi.fn() }

  it('points an empty filter at where the work is', () => {
    const view = render(<CommentList {...base} filteredComments={[]} />)
    expect(screen.getByText('Nothing in Open yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 in Testing' }))
    expect(base.selectFilter).toHaveBeenCalledWith('ready_for_testing')
    view.rerender(<CommentList {...base} statusFilter="all" counts={{ all: 0, open: 0, ready: 0, ready_for_testing: 0, done: 0, rejected: 0 }} filteredComments={[]} />)
    expect(screen.getByText('No feedback yet')).toBeInTheDocument()
    expect(screen.getByText('Share a review link and comments land here.')).toBeInTheDocument()
    view.rerender(<CommentList {...base} readOnly filteredComments={[]} />)
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull()
    view.rerender(<CommentList {...base} filteredComments={[]} commentsError="Network down" />)
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('shows the page and element, or the quoted text', () => {
    const view = render(<CommentList {...base} filteredComments={[{ ...comment, pageUrl: 'https://acme.com/checkout?x=1', selector: 'main > button.pay' }]} />)
    expect(screen.getByText('/checkout · button.pay')).toBeInTheDocument()
    view.rerender(<CommentList {...base} filteredComments={[{ ...comment, pageUrl: 'not a url' }]} />)
    expect(screen.getByText('not a url')).toBeInTheDocument()
    view.rerender(<CommentList {...base} filteredComments={[{ ...comment, targetType: 'text_range', anchor: { selectedText: 'Pay now' } as Comment['anchor'] }]} />)
    expect(screen.getByText('“Pay now”')).toBeInTheDocument()
    view.rerender(<CommentList {...base} filteredComments={[{ ...comment, reviewStatus: 'rejected', claimedByAgentId: 'claude' }]} />)
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('No page context')).toBeInTheDocument()
  })
})
