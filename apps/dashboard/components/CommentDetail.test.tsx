import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CommentRecord } from '../api'
import { mapServerComment } from '../lib/comment'
import { CommandPalette } from './CommandPalette'
import { CommentDetail } from './CommentDetail'
import { CommentList } from './CommentList'

const recordWithoutPageContext: CommentRecord = {
  id: 'legacy-comment',
  projectId: 'project',
  pageUrl: null,
  selector: null,
  x: null,
  y: null,
  body: 'The feedback is still available.',
  reviewStatus: 'accepted',
  implementationStatus: 'unassigned',
  claimedByAgentId: null,
  imageUrl: null,
  authorName: null,
  createdAt: '2026-07-23T08:27:59Z',
  updatedAt: '2026-07-23T08:27:59Z',
  targetType: 'element_point',
  anchor: null,
}

const commentWithoutPageContext = mapServerComment(recordWithoutPageContext)

describe('CommentDetail', () => {
  it('preserves nullable page metadata from the server', () => {
    expect(commentWithoutPageContext).toMatchObject({
      pageUrl: null,
      selector: null,
      x: null,
      y: null,
      author: 'Anonymous',
    })
  })

  it('renders feedback and omits unavailable page metadata', () => {
    const { container } = render(
      <CommentDetail
        selectedComment={commentWithoutPageContext}
        selectedProject="project"
        commentsLoading={false}
        commentsError={null}
        projectComments={[commentWithoutPageContext]}
        filteredComments={[commentWithoutPageContext]}
        selectedIdx={0}
        goPrev={vi.fn()}
        goNext={vi.fn()}
        toggleReview={vi.fn()}
        handleToggleDone={vi.fn()}
      />,
    )

    expect(screen.getByText('The feedback is still available.')).toBeInTheDocument()
    expect(screen.getByText('Anonymous')).toBeInTheDocument()
    expect(screen.queryByText('Open page')).not.toBeInTheDocument()
    expect(screen.queryByText(/Pin placed at/)).not.toBeInTheDocument()
    expect(container.querySelector('code')).not.toBeInTheDocument()
  })

  it('renders a safe fallback in the comment list', () => {
    render(
      <CommentList
        filteredComments={[commentWithoutPageContext]}
        counts={{ all: 1, open: 0, ready: 1, done: 0, rejected: 0 }}
        statusFilter="all"
        selectFilter={vi.fn()}
        bulkMode={false}
        enterBulkMode={vi.fn()}
        exitBulkMode={vi.fn()}
        bulkSelectedIds={new Set()}
        toggleSelectAllVisible={vi.fn()}
        applyBulkAction={vi.fn()}
        toggleBulkSelect={vi.fn()}
        commentsLoading={false}
        commentsError={null}
        selectedCommentId={commentWithoutPageContext.id}
        setSelectedCommentId={vi.fn()}
      />,
    )

    expect(screen.getByText('No page context')).toBeInTheDocument()
    expect(screen.getByText('The feedback is still available.')).toBeInTheDocument()
  })

  it('opens and searches the command palette without page metadata', () => {
    Element.prototype.scrollIntoView = vi.fn()

    render(
      <CommandPalette
        onClose={vi.fn()}
        comments={[commentWithoutPageContext]}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        selectedCommentId=""
      />,
    )

    expect(screen.getAllByText('Anonymous')).toHaveLength(1)

    fireEvent.change(screen.getByPlaceholderText(/Search feedback/), {
      target: { value: 'missing page' },
    })

    expect(screen.getByText('No results for "missing page"')).toBeInTheDocument()
  })
})
