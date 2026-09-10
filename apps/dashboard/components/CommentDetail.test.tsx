import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  getExternalWorkDraft: vi.fn(),
  sendExternalWork: vi.fn(),
}))

import { getExternalWorkDraft, sendExternalWork } from '../api'
import type { CommentRecord } from '../api'
import { mapServerComment } from '../lib/comment'
import type { Comment } from '../lib/types'
import { CommandPalette } from './CommandPalette'
import { CommentDetail } from './CommentDetail'
import { CommentList } from './CommentList'
import { ExternalWorkDialog } from './ExternalWorkDialog'
import { ExternalWorkProviderDialog } from './ExternalWorkProviderDialog'

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
  vi.mocked(sendExternalWork).mockResolvedValue({ ...issue, created: true })
  vi.mocked(getExternalWorkDraft).mockResolvedValue({ provider: 'github', connected: true, destination: 'acme/site', existing: null, draft: { title: 'Improve contrast', body: 'Issue body' } })
})

async function openExternalWorkDraft() {
  const button = screen.getByRole('button', { name: 'Send to…' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
  const create = await screen.findByRole('button', { name: 'Create issue' })
  await waitFor(() => expect(create).toBeEnabled())
  return create
}

describe('<CommentDetail /> feedback audience', () => {
  it('lets internal members change visibility and presents guests as shared-only', () => {
    const onVisibilityChange = vi.fn()
    const view = render(
      <CommentDetail
        {...props}
        selectedComment={{ ...comment, visibility: 'internal' }}
        onVisibilityChange={onVisibilityChange}
      />,
    )
    const audience = screen.getByRole('combobox', { name: 'Feedback audience' })
    expect(audience).toHaveValue('internal')
    fireEvent.change(audience, { target: { value: 'shared' } })
    expect(onVisibilityChange).toHaveBeenCalledWith('comment-1', 'shared')

    view.rerender(
      <CommentDetail
        {...props}
        selectedComment={{ ...comment, visibility: 'shared' }}
        readOnly
      />,
    )
    expect(screen.queryByRole('combobox', { name: 'Feedback audience' })).toBeNull()
    expect(screen.getByText('Shared with project')).toBeInTheDocument()
  })
})

describe('<CommentDetail /> GitHub issue action', () => {
  it('creates an issue for accepted feedback and updates local state', async () => {
    let resolveIssue!: (value: typeof issue & { created: boolean }) => void
    vi.mocked(sendExternalWork).mockReturnValueOnce(new Promise((resolve) => {
      resolveIssue = resolve
    }))
    render(<CommentDetail {...props} />)
    const createButton = await openExternalWorkDraft()
    fireEvent.change(screen.getByLabelText('External work title'), { target: { value: 'Customer-facing title' } })
    fireEvent.click(createButton)
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    resolveIssue({ ...issue, created: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(sendExternalWork).toHaveBeenCalledWith('/api', 'session-token', 'comment-1', 'github', {
      title: 'Customer-facing title', body: 'Issue body',
    })
  })

  it('allows open feedback to be reviewed before sending', async () => {
    render(<CommentDetail {...props} selectedComment={{ ...comment, reviewStatus: 'open' }} />)
    await openExternalWorkDraft()
    expect(screen.getByRole('dialog')).toHaveTextContent('Send to GitHub')
  })

  it('requires rejected feedback to be reopened before sending', async () => {
    render(<CommentDetail {...props} selectedComment={{ ...comment, reviewStatus: 'rejected' }} />)
    expect(screen.getByRole('button', { name: 'Reopen to send' })).toBeDisabled()
    expect(getExternalWorkDraft).not.toHaveBeenCalled()
  })

  it('opens a persisted issue in a protected new tab regardless of later status', async () => {
    const opened = { opener: 'parent' }
    const open = vi.spyOn(window, 'open').mockReturnValue(opened as never)
    render(<CommentDetail
      {...props}
      selectedComment={{ ...comment, reviewStatus: 'rejected', githubIssue: issue }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Send to…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    expect(open).toHaveBeenCalledWith(issue.issueUrl, '_blank', 'noopener,noreferrer')
    expect(opened.opener).toBeNull()
    open.mockRestore()
  })

  it('handles browsers that block the new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<CommentDetail {...props} selectedComment={{ ...comment, githubIssue: issue }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send to…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    expect(open).toHaveBeenCalled()
    open.mockRestore()
  })

  it('shows a safe inline error and allows retry', async () => {
    vi.mocked(sendExternalWork)
      .mockRejectedValueOnce(new Error('response contained a secret'))
      .mockResolvedValueOnce({ ...issue, created: false })
    render(<CommentDetail {...props} />)
    const createButton = await openExternalWorkDraft()
    fireEvent.click(createButton)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create the external issue. Try again.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create issue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows safe preparation failures and handles disconnected preparation state', async () => {
    vi.mocked(getExternalWorkDraft)
      .mockRejectedValueOnce(new Error('response contained a secret'))
      .mockResolvedValueOnce({ provider: 'github', connected: false, destination: null, existing: null, draft: { title: 'Title', body: 'Body' } })
    render(<CommentDetail {...props} />)
    const button = screen.getByRole('button', { name: 'Send to…' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not prepare the GitHub issue. Check Project Settings and try again.')
    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not prepare the GitHub issue. Check Project Settings and try again.')
  })

  it('opens an issue discovered during preparation and protects its opener', async () => {
    const opened = { opener: 'parent' }
    const open = vi.spyOn(window, 'open').mockReturnValue(opened as never)
    vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({
      provider: 'github', connected: true, destination: 'acme/site', existing: issue,
      draft: { title: '', body: '' },
    })
    render(<CommentDetail {...props} />)
    const button = screen.getByRole('button', { name: 'Send to…' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith(issue.issueUrl, '_blank', 'noopener,noreferrer'))
    expect(opened.opener).toBeNull()
  })

  it('handles a blocked popup and a late preparation failure after selection changes', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({
      provider: 'github', connected: true, destination: 'acme/site', existing: issue,
      draft: { title: '', body: '' },
    })
    const first = render(<CommentDetail {...props} />)
    const button = screen.getByRole('button', { name: 'Send to…' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    await waitFor(() => expect(open).toHaveBeenCalled())
    first.unmount()

    let rejectDraft!: (reason: Error) => void
    vi.mocked(getExternalWorkDraft).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectDraft = reject }))
    const view = render(<CommentDetail {...props} />)
    const pending = screen.getByRole('button', { name: 'Send to…' })
    await waitFor(() => expect(pending).toBeEnabled())
    fireEvent.click(pending)
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    const next = { ...comment, id: 'comment-2', body: 'Move the button' }
    view.rerender(<CommentDetail {...props} selectedComment={next} projectComments={[next]} filteredComments={[next]} />)
    rejectDraft(new Error('late failure'))
    await act(async () => {})
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('uses the default destination label and lets a prepared draft be cancelled', async () => {
    vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({
      provider: 'github', connected: true, destination: null, existing: null,
      draft: { title: 'Title', body: 'Body' },
    })
    render(<CommentDetail {...props} />)
    await openExternalWorkDraft()
    expect(screen.getByRole('dialog')).toHaveTextContent('creating in GitHub')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clears transient state when selecting a different comment', async () => {
    vi.mocked(sendExternalWork).mockRejectedValueOnce(new Error('failure'))
    const { rerender } = render(<CommentDetail {...props} />)
    const createButton = await openExternalWorkDraft()
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

  it('ignores a prepared draft for a previously selected comment', async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof getExternalWorkDraft>>) => void
    vi.mocked(getExternalWorkDraft)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
    const { rerender } = render(<CommentDetail {...props} />)
    const firstButton = screen.getByRole('button', { name: 'Send to…' })
    await waitFor(() => expect(firstButton).toBeEnabled())
    fireEvent.click(firstButton)
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))

    const next = { ...comment, id: 'comment-2', body: 'Move the button' }
    rerender(<CommentDetail
      {...props}
      selectedComment={next}
      projectComments={[next]}
      filteredComments={[next]}
    />)
    resolveFirst({ provider: 'github', connected: true, destination: 'old/repo', existing: null, draft: { title: 'Old', body: 'Old' } })
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Move the button')).toBeInTheDocument()
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

  it('hides selector context behind a toggle and resets it for the next comment', () => {
    const view = render(<CommentDetail {...props} />)
    const toggle = screen.getByRole('button', { name: 'Show selector' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('#hero')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(screen.getByText('#hero')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide selector' })).toHaveAttribute('aria-expanded', 'true')

    const next = { ...comment, id: 'comment-2', selector: '#footer' }
    view.rerender(<CommentDetail {...props} selectedComment={next} projectComments={[next]} filteredComments={[next]} />)
    expect(screen.getByRole('button', { name: 'Show selector' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('#footer')).not.toBeInTheDocument()
  })

  it('reveals text-range selector and character offsets on demand', () => {
    const textRange = {
      ...comment,
      targetType: 'text_range' as const,
      anchor: {
        kind: 'text_range' as const,
        prefix: 'Before ',
        selectedText: 'selected',
        normalizedText: 'selected',
        suffix: ' after',
        containerSelector: '#article > p',
        startOffset: 7,
        endOffset: 15,
        createdFromUrl: 'https://example.com',
      },
    }
    render(<CommentDetail {...props} selectedComment={textRange} projectComments={[textRange]} filteredComments={[textRange]} />)
    expect(screen.getByText('selected')).toBeInTheDocument()
    expect(screen.queryByText('#article > p')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show selector' }))
    expect(screen.getByText('#article > p')).toBeInTheDocument()
    expect(screen.getByText(/chars 7–15/)).toBeInTheDocument()
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
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')

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
    let resolveDraft!: (value: Awaited<ReturnType<typeof getExternalWorkDraft>>) => void
    vi.mocked(getExternalWorkDraft).mockReturnValueOnce(new Promise((resolve) => {
      resolveDraft = resolve
    }))
    render(<CommentDetail {...props} />)
    const button = screen.getByRole('button', { name: 'Send to…' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    const github = await screen.findByRole('button', { name: 'GitHub' })
    act(() => { github.click(); github.click() })
    expect(getExternalWorkDraft).toHaveBeenCalledTimes(1)
    resolveDraft({ provider: 'github', connected: true, destination: 'acme/site', existing: null, draft: { title: 'Title', body: 'Body' } })
    await screen.findByRole('dialog')
  })

  it('does not dispatch duplicate creates before the busy render commits', async () => {
    let resolveIssue!: (value: typeof issue & { created: boolean }) => void
    vi.mocked(sendExternalWork).mockReturnValueOnce(new Promise((resolve) => { resolveIssue = resolve }))
    render(<CommentDetail {...props} />)
    const create = await openExternalWorkDraft()
    act(() => {
      create.click()
      create.click()
    })
    expect(sendExternalWork).toHaveBeenCalledTimes(1)
    resolveIssue({ ...issue, created: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not surface a late create failure after selection changes', async () => {
    let rejectIssue!: (reason: Error) => void
    vi.mocked(sendExternalWork).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectIssue = reject }))
    const { rerender } = render(<CommentDetail {...props} />)
    const create = await openExternalWorkDraft()
    fireEvent.click(create)
    const next = { ...comment, id: 'comment-2', body: 'Move the button' }
    rerender(<CommentDetail {...props} selectedComment={next} projectComments={[next]} filteredComments={[next]} />)
    rejectIssue(new Error('late failure'))
    await act(async () => {})
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders the no-selection state safely', () => {
    render(<CommentDetail {...props} selectedComment={null} />)
    expect(screen.getByText('Select a comment')).toBeInTheDocument()
    expect(screen.getByText('Pick a feedback item from the list to see the full context, screenshot, and actions.')).toBeInTheDocument()
    expect(screen.queryByText('Select an extension comment')).toBeNull()
  })

  it('explains when the selected provider is not connected', async () => {
    vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({ provider: 'github', connected: false, destination: null, existing: null, draft: { title: 'T', body: 'B' } })
    render(<CommentDetail {...props} />)
    const button = screen.getByRole('button', { name: 'Send to…' })
    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Check Project Settings')

    vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({ provider: 'jira', connected: false, destination: null, existing: null, draft: { title: 'T', body: 'B' } })
    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: 'Jira' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not prepare the Jira issue')
  })

  it('does not request connection status when no project is selected', () => {
    render(<CommentDetail {...props} selectedProject="" />)
    expect(screen.getByRole('button', { name: 'Send to…' })).toBeDisabled()
  })

  it('keeps a saved issue openable without a current repository connection', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<CommentDetail {...props} selectedComment={{ ...comment, githubIssue: issue }} />)
    const button = screen.getByRole('button', { name: 'Send to…' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    expect(open).toHaveBeenCalledWith(issue.issueUrl, '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('creates Linear issues and opens the result without an opener reference', async () => {
    const opened = { opener: 'parent' }
    const open = vi.spyOn(window, 'open').mockReturnValue(opened as never)
    vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({
      provider: 'linear', connected: true, destination: 'WEB · Web', existing: null,
      draft: { title: 'Title', body: 'Body' },
    })
    vi.mocked(sendExternalWork).mockResolvedValueOnce({ externalId: 'i', externalKey: 'WEB-1', externalUrl: 'https://linear.app/issue/WEB-1', createdAt: 'now', created: true })
    render(<CommentDetail {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send to…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Linear' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create issue' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://linear.app/issue/WEB-1', '_blank', 'noopener,noreferrer'))
    expect(opened.opener).toBeNull()
  })

  it('creates Jira issues through the selected provider', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({
      provider: 'jira', connected: true, destination: 'WEB · Website', existing: null,
      draft: { title: 'Title', body: 'Body' },
    })
    vi.mocked(sendExternalWork).mockResolvedValueOnce({ externalId: 'i', externalKey: 'WEB-1', externalUrl: 'https://acme.atlassian.net/browse/WEB-1', createdAt: 'now', created: true })
    render(<CommentDetail {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send to…' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Jira' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Send to Jira')
    fireEvent.click(screen.getByRole('button', { name: 'Create issue' }))
    await waitFor(() => expect(sendExternalWork).toHaveBeenCalledWith(
      props.apiBase, props.accessToken, comment.id, 'jira', { title: 'Title', body: 'Body' },
    ))
    expect(open).toHaveBeenCalledWith('https://acme.atlassian.net/browse/WEB-1', '_blank', 'noopener,noreferrer')
  })

  it('surfaces missing result URLs and tolerates blocked Linear issue tabs', async () => {
    vi.mocked(getExternalWorkDraft).mockResolvedValue({ provider: 'linear', connected: true, destination: 'WEB · Web', existing: null, draft: { title: 'Title', body: 'Body' } })
    vi.mocked(sendExternalWork)
      .mockResolvedValueOnce({ created: true } as never)
      .mockResolvedValueOnce({ externalUrl: 'https://linear.app/issue/WEB-2', created: true } as never)
    vi.spyOn(window, 'open').mockReturnValue(null)
    render(<CommentDetail {...props} />)
    const send = screen.getByRole('button', { name: 'Send to…' })
    fireEvent.click(send)
    fireEvent.click(await screen.findByRole('button', { name: 'Linear' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create issue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the external issue')
    fireEvent.click(screen.getByRole('button', { name: 'Create issue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('handles incomplete existing work, blocked Linear tabs, and provider-picker cancellation', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    vi.mocked(getExternalWorkDraft)
      .mockResolvedValueOnce({ provider: 'linear', connected: true, destination: 'WEB · Web', existing: { externalId: 'i', externalKey: 'WEB-1', externalUrl: '', createdAt: 'now' }, draft: { title: '', body: '' } })
      .mockResolvedValueOnce({ provider: 'linear', connected: true, destination: 'WEB · Web', existing: { externalId: 'i', externalKey: 'WEB-1', externalUrl: 'https://linear.app/issue/WEB-1', createdAt: 'now' }, draft: { title: '', body: '' } })
    render(<CommentDetail {...props} />)
    const send = screen.getByRole('button', { name: 'Send to…' })
    fireEvent.click(send)
    fireEvent.click(await screen.findByRole('button', { name: 'Linear' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not prepare the Linear issue')
    fireEvent.click(send)
    fireEvent.click(await screen.findByRole('button', { name: 'Linear' }))
    await waitFor(() => expect(open).toHaveBeenCalled())
    fireEvent.click(send)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Choose a connected project integration.')).toBeNull()
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

describe('<ExternalWorkDialog />', () => {
  it('only cancels through enabled controls or the backdrop', () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn()
    const view = render(<ExternalWorkDialog
      provider="github"
      destination="acme/site"
      initialDraft={{ title: ' Title ', body: ' Body ' }}
      busy={false}
      error={null}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'External work description' }), { target: { value: ' Updated body ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create issue' }))
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Title', body: 'Updated body' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(onCancel).toHaveBeenCalledTimes(2)

    view.rerender(<ExternalWorkDialog
      provider="github"
      destination="acme/site"
      initialDraft={{ title: 'Title', body: 'Body' }}
      busy
      error="Safe error"
      onCancel={onCancel}
      onSubmit={onSubmit}
    />)
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Safe error')

    view.rerender(<ExternalWorkDialog
      provider="linear"
      destination="WEB · Web"
      initialDraft={{ title: 'Title', body: 'Body' }}
      busy={false}
      error={null}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Send to Linear')

    view.rerender(<ExternalWorkDialog
      provider="jira"
      destination="WEB · Website"
      initialDraft={{ title: 'Title', body: 'Body' }}
      busy={false}
      error={null}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Send to Jira')
  })
})

describe('<ExternalWorkProviderDialog />', () => {
  it('selects providers and only cancels from controls or the backdrop', () => {
    const onCancel = vi.fn()
    const onSelect = vi.fn()
    render(<ExternalWorkProviderDialog onCancel={onCancel} onSelect={onSelect} />)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }))
    fireEvent.click(screen.getByRole('button', { name: 'Linear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Jira' }))
    expect(onSelect.mock.calls).toEqual([['github'], ['linear'], ['jira']])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
