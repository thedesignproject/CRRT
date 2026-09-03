import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  createCommentGithubIssue: vi.fn(),
  getProjectGitHubStatus: vi.fn(),
}))

import { createCommentGithubIssue, getProjectGitHubStatus } from '../api'
import type { CommentRecord } from '../api'
import { mapServerComment } from '../lib/comment'
import type { Comment } from '../lib/types'
import { CommandPalette } from './CommandPalette'
import { CommentDetail } from './CommentDetail'
import { CommentList } from './CommentList'

const issue = {
  issueNumber: 42,
  issueUrl: 'https://github.com/acme/site/issues/42',
  createdAt: '2026-07-23T12:00:00Z',
}
const comment: Comment = {
  id: 'comment-1',
  projectId: 'project-1',
  pageUrl: 'https://example.com',
  selector: '#hero',
  x: 10,
  y: 20,
  body: 'Increase contrast',
  reviewStatus: 'accepted',
  implementationStatus: 'unassigned',
  claimedByAgentId: null,
  createdAt: '2026-07-23T11:00:00Z',
  updatedAt: '2026-07-23T11:00:00Z',
  author: 'Ada',
  authorInitial: 'A',
  authorColor: '#6366F1',
  screenshotUrl: null,
  targetType: 'element_point',
  anchor: null,
  githubIssue: null,
}

const recordWithoutPageContext: CommentRecord = {
  id: 'legacy-comment',
  projectId: 'project-1',
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
  githubIssue: null,
}

const commentWithoutPageContext = mapServerComment(recordWithoutPageContext)

const props = {
  selectedComment: comment,
  selectedProject: 'project-1',
  commentsLoading: false,
  commentsError: null,
  projectComments: [comment],
  filteredComments: [comment],
  selectedIdx: 0,
  goPrev: vi.fn(),
  goNext: vi.fn(),
  toggleReview: vi.fn(),
  handleToggleDone: vi.fn(),
  apiBase: '/api',
  accessToken: 'session-token',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createCommentGithubIssue).mockResolvedValue({ ...issue, created: true })
  vi.mocked(getProjectGitHubStatus).mockResolvedValue({ githubConnectionStatus: 'connected' })
})

describe('<CommentDetail /> GitHub issue action', () => {
  it('creates an issue for accepted feedback and updates local state', async () => {
    let resolveIssue!: (value: typeof issue & { created: boolean }) => void
    vi.mocked(createCommentGithubIssue).mockReturnValueOnce(new Promise((resolve) => {
      resolveIssue = resolve
    }))
    render(<CommentDetail {...props} />)
    const createButton = screen.getByRole('button', { name: 'Create GitHub Issue' })
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)
    expect(screen.getByRole('button', { name: 'Creating issue…' })).toBeDisabled()
    resolveIssue({ ...issue, created: true })
    await screen.findByRole('button', { name: 'Open GitHub Issue' })
    expect(createCommentGithubIssue).toHaveBeenCalledWith('/api', 'session-token', 'comment-1')
  })

  it.each(['open', 'rejected'] as const)(
    'requires acceptance when the comment is %s',
    async (reviewStatus) => {
      render(<CommentDetail {...props} selectedComment={{ ...comment, reviewStatus }} />)
      const button = screen.getByRole('button', { name: 'Accept to create issue' })
      await waitFor(() => expect(getProjectGitHubStatus).toHaveBeenCalled())
      expect(button).toBeDisabled()
      fireEvent.click(button)
      expect(createCommentGithubIssue).not.toHaveBeenCalled()
    },
  )

  it('opens a persisted issue in a protected new tab regardless of later status', () => {
    const opened = { opener: 'parent' }
    const open = vi.spyOn(window, 'open').mockReturnValue(opened as never)
    render(<CommentDetail
      {...props}
      selectedComment={{ ...comment, reviewStatus: 'rejected', githubIssue: issue }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Open GitHub Issue' }))
    expect(open).toHaveBeenCalledWith(issue.issueUrl, '_blank', 'noopener,noreferrer')
    expect(opened.opener).toBeNull()
    open.mockRestore()
  })

  it('handles browsers that block the new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<CommentDetail {...props} selectedComment={{ ...comment, githubIssue: issue }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open GitHub Issue' }))
    expect(open).toHaveBeenCalled()
    open.mockRestore()
  })

  it('shows a safe inline error and allows retry', async () => {
    vi.mocked(createCommentGithubIssue)
      .mockRejectedValueOnce(new Error('response contained a secret'))
      .mockResolvedValueOnce({ ...issue, created: false })
    render(<CommentDetail {...props} />)
    const createButton = screen.getByRole('button', { name: 'Create GitHub Issue' })
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create the GitHub issue. Try again.',
    )
    fireEvent.click(createButton)
    await screen.findByRole('button', { name: 'Open GitHub Issue' })
  })

  it('clears transient state when selecting a different comment', async () => {
    vi.mocked(createCommentGithubIssue).mockRejectedValueOnce(new Error('failure'))
    const { rerender } = render(<CommentDetail {...props} />)
    const createButton = screen.getByRole('button', { name: 'Create GitHub Issue' })
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    const next = { ...comment, id: 'comment-2', body: 'Move the button' }
    rerender(<CommentDetail
      {...props}
      selectedComment={next}
      projectComments={[next]}
      filteredComments={[next]}
    />)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('keeps a newer request busy when an older comment request finishes', async () => {
    let rejectFirst!: (reason?: unknown) => void
    let resolveSecond!: (value: typeof issue & { created: boolean }) => void
    vi.mocked(createCommentGithubIssue)
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))
    const { rerender } = render(<CommentDetail {...props} />)
    const firstButton = screen.getByRole('button', { name: 'Create GitHub Issue' })
    await waitFor(() => expect(firstButton).toBeEnabled())
    fireEvent.click(firstButton)

    const next = { ...comment, id: 'comment-2', body: 'Move the button' }
    rerender(<CommentDetail
      {...props}
      selectedComment={next}
      projectComments={[next]}
      filteredComments={[next]}
    />)
    const secondButton = screen.getByRole('button', { name: 'Create GitHub Issue' })
    await waitFor(() => expect(secondButton).toBeEnabled())
    fireEvent.click(secondButton)
    rejectFirst(new Error('older request failed'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating issue…' })).toBeDisabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    resolveSecond({ ...issue, created: true })
    await screen.findByRole('button', { name: 'Open GitHub Issue' })
  })

  it('renders feedback-only anonymous comments without invented page or DOM context', () => {
    render(<CommentDetail
      {...props}
      selectedComment={{
        ...comment,
        pageUrl: null,
        selector: null,
        x: null,
        y: null,
        author: 'Anonymous',
        authorInitial: 'A',
      }}
    />)
    expect(screen.getByText('Increase contrast')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open page' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Pin placed at/)).not.toBeInTheDocument()
  })

  it('renders screenshot and action variants and invokes nearby controls', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { rerender } = render(<CommentDetail
      {...props}
      selectedComment={{ ...comment, screenshotUrl: 'https://cdn.example/image.png' }}
    />)
    expect(screen.getByAltText('Screenshot of https://example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ready for Agent/ }))
    fireEvent.click(screen.getByRole('button', { name: /Mark Done/ }))
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    fireEvent.click(screen.getByRole('button', { name: /Open page/ }))
    expect(props.toggleReview).toHaveBeenCalledTimes(2)
    expect(props.handleToggleDone).toHaveBeenCalledWith('comment-1')
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank')

    rerender(<CommentDetail
      {...props}
      selectedComment={{
        ...comment,
        pageUrl: null,
        screenshotUrl: 'https://cdn.example/image.png',
        implementationStatus: 'done',
      }}
    />)
    expect(screen.getByAltText('Feedback screenshot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Done/ })).toBeInTheDocument()
    open.mockRestore()
  })

  it('does not dispatch a duplicate request before the busy render commits', async () => {
    let resolveIssue!: (value: typeof issue & { created: boolean }) => void
    vi.mocked(createCommentGithubIssue).mockReturnValueOnce(new Promise((resolve) => {
      resolveIssue = resolve
    }))
    render(<CommentDetail {...props} />)
    const button = screen.getByRole('button', { name: 'Create GitHub Issue' })
    await waitFor(() => expect(button).toBeEnabled())
    act(() => {
      button.click()
      button.click()
    })
    expect(createCommentGithubIssue).toHaveBeenCalledTimes(1)
    resolveIssue({ ...issue, created: true })
    await screen.findByRole('button', { name: 'Open GitHub Issue' })
  })

  it('renders the no-selection state safely', () => {
    render(<CommentDetail {...props} selectedComment={null} />)
    expect(screen.getByText('Select a comment')).toBeInTheDocument()
    expect(screen.getByText('Pick a feedback item from the list to see the full context, screenshot, and actions.')).toBeInTheDocument()
    expect(screen.queryByText('Select an extension comment')).toBeNull()
  })

  it('disables creation and explains where to connect a repository', async () => {
    vi.mocked(getProjectGitHubStatus).mockResolvedValueOnce({
      githubConnectionStatus: 'disconnected',
    })
    render(<CommentDetail {...props} />)
    const button = screen.getByRole('button', { name: 'Create GitHub Issue' })
    expect(button).toBeDisabled()
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Connect a GitHub repository from Project Settings')
    expect(tooltip.parentElement).toHaveAttribute('tabindex', '0')
    fireEvent.click(button)
    expect(createCommentGithubIssue).not.toHaveBeenCalled()
  })

  it('fails closed when connection status cannot be loaded', async () => {
    vi.mocked(getProjectGitHubStatus).mockRejectedValueOnce(new Error('network failed'))
    render(<CommentDetail {...props} />)
    await waitFor(() => expect(getProjectGitHubStatus).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Create GitHub Issue' })).toBeDisabled()
  })

  it('ignores a stale connection result after the selected project changes', async () => {
    let resolveOld!: (value: { githubConnectionStatus: 'connected' }) => void
    vi.mocked(getProjectGitHubStatus)
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce({ githubConnectionStatus: 'disconnected' })
    const { rerender } = render(<CommentDetail {...props} />)
    rerender(<CommentDetail {...props} selectedProject="project-2" />)
    await waitFor(() => expect(getProjectGitHubStatus).toHaveBeenCalledTimes(2))
    resolveOld({ githubConnectionStatus: 'connected' })
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Create GitHub Issue' })).toBeDisabled()
  })

  it('ignores a stale connection failure after the selected project changes', async () => {
    let rejectOld!: (reason?: unknown) => void
    vi.mocked(getProjectGitHubStatus)
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject }))
      .mockResolvedValueOnce({ githubConnectionStatus: 'connected' })
    const { rerender } = render(<CommentDetail {...props} />)
    rerender(<CommentDetail {...props} selectedProject="project-2" />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create GitHub Issue' })).toBeEnabled()
    })
    rejectOld(new Error('old project failed'))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Create GitHub Issue' })).toBeEnabled()
  })

  it('does not request connection status when no project is selected', () => {
    render(<CommentDetail {...props} selectedProject="" />)
    expect(getProjectGitHubStatus).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create GitHub Issue' })).toBeDisabled()
  })

  it('keeps a saved issue openable without a current repository connection', () => {
    vi.mocked(getProjectGitHubStatus).mockResolvedValueOnce({
      githubConnectionStatus: 'disconnected',
    })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<CommentDetail {...props} selectedComment={{ ...comment, githubIssue: issue }} />)
    const button = screen.getByRole('button', { name: 'Open GitHub Issue' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(open).toHaveBeenCalledWith(issue.issueUrl, '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('preserves nullable page metadata and renders the feedback safely', () => {
    expect(commentWithoutPageContext).toMatchObject({
      pageUrl: null,
      selector: null,
      x: null,
      y: null,
      author: 'Anonymous',
    })

    const { container } = render(
      <CommentDetail
        {...props}
        selectedComment={commentWithoutPageContext}
        projectComments={[commentWithoutPageContext]}
        filteredComments={[commentWithoutPageContext]}
      />,
    )

    expect(screen.getByText('The feedback is still available.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open page' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Pin placed at/)).not.toBeInTheDocument()
    expect(container.querySelector('code')).not.toBeInTheDocument()
  })

  it('keeps list and command-palette browsing safe without page metadata', () => {
    const { unmount } = render(
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
    unmount()

    Element.prototype.scrollIntoView = vi.fn()
    const palette = render(
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

    palette.unmount()
    render(
      <CommandPalette
        onClose={vi.fn()}
        comments={[{ ...comment, pageUrl: '/settings' }]}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        selectedCommentId=""
      />,
    )
    expect(screen.getByText('Ada · /settings')).toBeInTheDocument()
  })

})
