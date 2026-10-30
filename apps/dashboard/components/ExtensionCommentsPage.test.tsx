import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({ assignExtensionComment: vi.fn(), bulkAssignExtensionComments: vi.fn(), bulkDeleteExtensionComments: vi.fn(), deleteExtensionComment: vi.fn(), listExtensionComments: vi.fn(), updateExtensionComment: vi.fn(), getProjectGitHubStatus: vi.fn() }))
import { assignExtensionComment, bulkAssignExtensionComments, bulkDeleteExtensionComments, deleteExtensionComment, getProjectGitHubStatus, listExtensionComments, updateExtensionComment, type ExtensionCommentRecord, type Project } from '../api'
import { ExtensionCommentsPage } from './ExtensionCommentsPage'

const first: ExtensionCommentRecord = { id: 'c1', projectId: null, pageUrl: 'https://example.com/path?q=1', pageHostname: 'example.com', x: 12.34, y: 56.78, selector: '#target', body: 'First comment', screenshotUrl: 'https://signed/image', authorName: 'u@example.com', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const second: ExtensionCommentRecord = { ...first, id: 'c2', pageHostname: 'two.example', body: 'Second comment', screenshotUrl: null }
const project: Project = { publicKey: 'store', slug: 'store', name: 'Storefront', allowedOrigins: ['example.com'], createdAt: '2026-01-01', updatedAt: '2026-01-01' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listExtensionComments).mockResolvedValue({ items: [first, second], page: 1, limit: 20, total: 21 })
  vi.mocked(updateExtensionComment).mockImplementation(async (_api, _token, id, body) => ({ ...(id === 'c1' ? first : second), body }))
  vi.mocked(assignExtensionComment).mockResolvedValue({ ...first, projectId: 'store' })
  vi.mocked(bulkAssignExtensionComments).mockResolvedValue({ processedIds: ['c1', 'c2'], skipped: [], selectedTotal: 2 })
  vi.mocked(bulkDeleteExtensionComments).mockResolvedValue({ processedIds: ['c1', 'c2'], skipped: [], selectedTotal: 2 })
  vi.mocked(deleteExtensionComment).mockResolvedValue()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('ExtensionCommentsPage', () => {
  it('refills the current page after deletion crosses a pagination boundary', async () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...first, id: `item-${index}`, body: `Item ${index}` }))
    vi.mocked(listExtensionComments).mockResolvedValueOnce({ items, total: 21, page: 1, limit: 20 })
      .mockResolvedValueOnce({ items: [...items.slice(1), second], total: 20, page: 1, limit: 20 })
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
    fireEvent.click(await screen.findByRole('button', { name: /Item 0/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByText('Second comment')
    expect(screen.queryByText('Item 0')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(listExtensionComments).toHaveBeenCalledTimes(2)
  })

  it('renews signed images on a timer and focus without discarding edits, tolerating failures and stale results', async () => {
    vi.useFakeTimers()
    const view = render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Edit comment'), { target: { value: 'Unsaved' } })
    vi.mocked(listExtensionComments).mockResolvedValueOnce({ items: [{ ...first, screenshotUrl: 'https://signed/fresh' }], page: 1, total: 21, limit: 20 })
    await act(async () => { vi.advanceTimersByTime(240_000) })
    expect(screen.getByLabelText('Edit comment')).toHaveValue('Unsaved')
    expect(screen.getByAltText(`Screenshot of ${first.pageUrl}`)).toHaveAttribute('src', 'https://signed/fresh')
    vi.mocked(listExtensionComments).mockRejectedValueOnce(new Error('offline'))
    await act(async () => { fireEvent.focus(window) })
    expect(screen.getByLabelText('Edit comment')).toHaveValue('Unsaved')
    let resolve!: (value: any) => void
    vi.mocked(listExtensionComments).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await act(async () => { fireEvent.focus(window); fireEvent.focus(window) })
    await act(async () => { resolve({ items: [], total: 0 }) })
    vi.mocked(listExtensionComments).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    fireEvent.focus(window); view.unmount()
    await act(async () => { resolve({ items: [], total: 0 }) })
  })
  it('shows personal details, pages, edits, and deletes', async () => {
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
    expect(screen.getByText('Loading comments…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Coming soon' })).toBeNull()
    await screen.findByText('First comment')
    expect(screen.getByText('Select an Inbox item')).toBeInTheDocument()
    expect(screen.getByText('Pick an Inbox item to see its page context and screenshot.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Coming soon' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
    expect(screen.getByAltText(`Screenshot of ${first.pageUrl}`)).toHaveAttribute('src', 'https://signed/image')
    expect(screen.getByText('Pin 12.34%, 56.78%')).toBeInTheDocument()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    fireEvent.click(screen.getByRole('button', { name: 'Open page' })); expect(open).toHaveBeenCalledWith(first.pageUrl, '_blank', 'noopener,noreferrer')
    for (const name of ['Ready for Agent', 'Mark Done', 'Reject', 'Accept to create issue']) expect(screen.queryByRole('button', { name })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(listExtensionComments).toHaveBeenCalledWith('/api', 'token', 2))
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(listExtensionComments).toHaveBeenCalledWith('/api', 'token', 1))

    fireEvent.click(await screen.findByRole('button', { name: /First comment/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Edit comment'), { target: { value: ' Updated ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateExtensionComment).toHaveBeenCalledWith('/api', 'token', 'c1', 'Updated'))
    await waitFor(() => expect(screen.getAllByText('Updated')).toHaveLength(2))

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!)
    await waitFor(() => expect(deleteExtensionComment).toHaveBeenCalledWith('/api', 'token', 'c1'))
    expect(screen.queryByText('Updated')).not.toBeInTheDocument()

  })

  it('moves an owned private comment into an accessible project in place', async () => {
    vi.mocked(listExtensionComments)
      .mockResolvedValueOnce({ items: [first], page: 1, limit: 20, total: 1 })
      .mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 })
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
    fireEvent.click(await screen.findByRole('button', { name: /First comment/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Project for comment' }), { target: { value: 'store' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to project' }))
    await waitFor(() => expect(assignExtensionComment).toHaveBeenCalledWith('/api', 'token', 'c1', 'store'))
    await screen.findByText('Your Inbox is empty.')
  })

  it('keeps the comment selected when project assignment fails', async () => {
    vi.mocked(listExtensionComments).mockResolvedValue({ items: [first], page: 1, limit: 20, total: 1 })
    vi.mocked(assignExtensionComment).mockRejectedValueOnce(new Error('assignment down'))
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
    fireEvent.click(await screen.findByRole('button', { name: /First comment/ }))

    fireEvent.change(screen.getByRole('combobox', { name: 'Project for comment' }), { target: { value: 'store' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to project' }))
    await screen.findByText('assignment down')
    expect(screen.getAllByText('First comment')).toHaveLength(2)
  })

  it('shows empty and load error states', async () => {
    vi.mocked(listExtensionComments).mockResolvedValueOnce({ items: [], page: 1, limit: 20, total: 0 })
    const view = render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
    await screen.findByText('No comments')
    expect(screen.getByText('Your Inbox is empty.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Try the CRRT extension' })).toBeInTheDocument()
    expect(screen.getByText('Comments you leave with the CRRT browser extension will appear here.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coming soon' })).toBeDisabled()
    expect(screen.queryByText('Select an extension comment')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument(); view.unmount()
    vi.mocked(listExtensionComments).mockRejectedValueOnce('bad')
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
    await screen.findByText('Could not load Inbox')
    expect(screen.queryByRole('button', { name: 'Coming soon' })).toBeNull()
  })

  it('keeps editing available when update or delete fails', async () => {
    vi.mocked(updateExtensionComment).mockRejectedValueOnce(new Error('update down')).mockRejectedValueOnce('bad')
    vi.mocked(deleteExtensionComment).mockRejectedValueOnce(new Error('delete down')).mockRejectedValueOnce('bad')
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />); await screen.findByText('First comment')
    fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!); fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('update down')
    fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Could not update comment')
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!); await screen.findByText('delete down')
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!); await screen.findByText('Could not delete comment')
  })

  it('selects the current page, expands to the full Inbox, and supports exclusions', async () => {
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
    await screen.findByText('First comment')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
    expect(screen.getByRole('toolbar', { name: 'Bulk actions for 2 selected items' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select all 21 in Inbox' }))
    expect(screen.getByRole('toolbar', { name: 'Bulk actions for 21 selected items' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
    expect(screen.getByRole('toolbar', { name: 'Bulk actions for 20 selected items' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
    expect(screen.getByText('All 21 Inbox items are selected.')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear selection' })[0]!)
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
  })

  it('moves the exact bulk selection and hands it to the destination project', async () => {
    const onMoved = vi.fn()
    vi.mocked(bulkAssignExtensionComments).mockResolvedValueOnce({
      processedIds: ['c1'], skipped: [{ id: 'c2', reason: 'not_in_inbox' }], selectedTotal: 1,
    })
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} onMovedToProject={onMoved} />)
    await screen.findByText('First comment')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Storefront' }))
    await waitFor(() => expect(bulkAssignExtensionComments).toHaveBeenCalledWith('/api', 'token', { mode: 'ids', ids: ['c1'] }, 'store'))
    expect(onMoved).toHaveBeenCalledWith('store', ['c1'], 1)
  })

  it('reconciles a bulk move in place when no destination callback is provided', async () => {
    vi.mocked(listExtensionComments)
      .mockResolvedValueOnce({ items: [first, second], page: 1, limit: 20, total: 21 })
      .mockResolvedValue({ items: [second], page: 1, limit: 20, total: 20 })
    vi.mocked(bulkAssignExtensionComments).mockResolvedValueOnce({
      processedIds: ['c1'], skipped: [{ id: 'c2', reason: 'not_in_inbox' }], selectedTotal: 2,
    })
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
    await screen.findByText('First comment')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Storefront' }))

    await screen.findByText('1 moved; 1 skipped.')
    expect(screen.queryByText('First comment')).toBeNull()
    expect(await screen.findByText('Second comment')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
  })

  it('keeps a failed bulk move selected and filters inaccessible destinations', async () => {
    const inaccessible = { ...project, capabilities: ['feedback:read'] as Project['capabilities'] }
    const view = render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[inaccessible]} />)
    await screen.findByText('First comment')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
    expect(screen.queryByRole('button', { name: 'Move to Storefront' })).toBeNull()
    expect(screen.getByText('No available projects')).toBeInTheDocument()

    view.rerender(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
    vi.mocked(bulkAssignExtensionComments).mockResolvedValueOnce({ processedIds: [], skipped: [{ id: 'c1', reason: 'not_in_inbox' }], selectedTotal: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Move to Storefront' }))
    await screen.findByText('No Inbox items were moved. Refresh and try again.')
    expect(screen.getByRole('toolbar', { name: 'Bulk actions for 1 selected item' })).toBeInTheDocument()

    vi.mocked(bulkAssignExtensionComments).mockRejectedValueOnce(new Error('move down'))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Storefront' }))
    await screen.findByText('move down')
  })

  it('confirms bulk deletion and keeps retryable storage failures selected', async () => {
    vi.mocked(bulkDeleteExtensionComments).mockResolvedValueOnce({
      processedIds: ['c1'], skipped: [{ id: 'c2', reason: 'storage_delete_failed' }], selectedTotal: 2,
    })
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
    await screen.findByText('First comment')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
    expect(screen.getByRole('alertdialog', { name: 'Delete selected feedback?' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }))
    await waitFor(() => expect(bulkDeleteExtensionComments).toHaveBeenCalledWith('/api', 'token', { mode: 'ids', ids: ['c1', 'c2'] }))
    await screen.findByText('1 deleted; 1 could not be deleted and remain selected.')
    expect(screen.getByRole('toolbar', { name: 'Bulk actions for 1 selected item' })).toBeInTheDocument()
  })

  it('clears selection after a complete bulk delete and preserves it on request failure', async () => {
    vi.mocked(bulkDeleteExtensionComments)
      .mockRejectedValueOnce(new Error('delete down'))
      .mockResolvedValueOnce({ processedIds: ['c1', 'c2'], skipped: [], selectedTotal: 2 })
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
    await screen.findByText('First comment')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }))
    await screen.findByText('delete down')
    expect(screen.getByRole('toolbar', { name: 'Bulk actions for 2 selected items' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }))
    await screen.findByText('2 deleted.')
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
  })

  it('navigates owned comments without status shortcuts or project requests', async () => {
    // Flush the initial load and its keyboard-listener effect before shortcuts.
    await act(async () => {
      render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
    })
    await screen.findByText('First comment')
    fireEvent.keyDown(window, { key: 'k' })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    fireEvent.keyDown(window, { key: 'j' })
    expect(screen.getByText('1/2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByText('2/2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByText('2/2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.click(screen.getByRole('button', { name: 'Next comment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous comment' }))
    fireEvent.keyDown(window, { key: 'j' }); fireEvent.keyDown(window, { key: 'k' })
    for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) fireEvent.keyDown(window, { key: 'j', [modifier]: true })
    for (const key of ['a', 'm', 'd', 's', 'Escape']) fireEvent.keyDown(window, { key })
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(getProjectGitHubStatus).not.toHaveBeenCalled()
    expect(updateExtensionComment).not.toHaveBeenCalled()
    expect(deleteExtensionComment).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.keyDown(screen.getByLabelText('Edit comment'), { key: 'j' })
    expect(screen.getByText('1/2')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Edit comment'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('keeps selection stable during a save and preserves errors and the draft', async () => {
    let resolve!: (item: ExtensionCommentRecord) => void
    vi.mocked(updateExtensionComment).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
    fireEvent.click(await screen.findByRole('button', { name: /First comment/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Edit comment'), { target: { value: 'New body' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByLabelText('Edit comment')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Second comment/ }))
    fireEvent.keyDown(window, { key: 'j' })
    expect(screen.getByText('1/2')).toBeInTheDocument()
    await act(async () => resolve({ ...first, body: 'New body' }))
    expect(screen.getAllByText('New body')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Second comment/ }))
    expect(screen.getByText('2/2')).toBeInTheDocument()
  })

  it('returns to the previous page after deleting the last item on the last page', async () => {
    vi.mocked(listExtensionComments).mockResolvedValueOnce({ items: [first], total: 21, page: 1, limit: 20 })
      .mockResolvedValueOnce({ items: [second], total: 21, page: 2, limit: 20 })
      .mockResolvedValueOnce({ items: [first], total: 20, page: 1, limit: 20 })
    render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
    await screen.findByText('First comment')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: /Second comment/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByText('First comment')
    expect(listExtensionComments).toHaveBeenLastCalledWith('/api', 'token', 1)
    expect(screen.queryByText('Page 2 of 2')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('ignores late successful and failed page loads after unmount', async () => {
    let resolve!: (result: Awaited<ReturnType<typeof listExtensionComments>>) => void
    let reject!: (error: Error) => void
    vi.mocked(listExtensionComments).mockReturnValueOnce(new Promise((done) => { resolve = done }))
      .mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    const view = render(<ExtensionCommentsPage apiBase="/api" accessToken="old" />)
    view.rerender(<ExtensionCommentsPage apiBase="/api" accessToken="new" />)
    await act(async () => resolve({ items: [first], total: 1, page: 1, limit: 20 }))
    expect(screen.queryByText('First comment')).toBeNull()
    expect(screen.getByText('Loading comments…')).toBeInTheDocument()
    view.unmount()
    await act(async () => reject(new Error('late failure')))
  })
})

it('keeps selection and confirmation locked while deletion is pending', async () => {
  let finish!: (value: any) => void
  vi.mocked(bulkDeleteExtensionComments).mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
  await screen.findByText('First comment')
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]!)
  fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
  fireEvent.click(screen.getByRole('button', { name: 'Deselect page' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select all 21 in Inbox' }))
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(screen.getByRole('toolbar')).toHaveTextContent('2 selected')
  await act(async () => finish({ processedIds: ['c1'], skipped: [{ id: 'c2', reason: 'storage_delete_failed' }], selectedTotal: 2 }))
  expect(screen.getByRole('toolbar')).toHaveTextContent('1 selected')
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
})

it('reverses individual and page selection in explicit and all modes', async () => {
 render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
 await screen.findByText('First comment')
 fireEvent.click(screen.getByRole('button', { name: 'Select' }))
 fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
 fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
 expect(screen.queryByRole('toolbar')).toBeNull()
 fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
 fireEvent.click(screen.getByRole('button', { name: 'Deselect page' }))
 expect(screen.queryByRole('toolbar')).toBeNull()
 fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
 fireEvent.click(screen.getByRole('button', { name: 'Select all 21 in Inbox' }))
 fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
 fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
 expect(screen.getByRole('toolbar')).toHaveTextContent('21 selected')
})
it('does not submit an emptied deletion confirmation', async () => {
 render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
 await screen.findByText('First comment')
 fireEvent.click(screen.getByRole('button', { name: 'Select' }))
 fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
 fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
 fireEvent.click(screen.getByRole('button', { name: 'Deselect page' }))
 fireEvent.click(screen.getByRole('button', { name: 'Delete 0' }))
 expect(bulkDeleteExtensionComments).not.toHaveBeenCalled()
})
it('reports a fully successful move without a skipped notice', async () => {
 render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
 await screen.findByText('First comment')
 fireEvent.click(screen.getByRole('button', { name: 'Select' }))
 fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
 fireEvent.click(screen.getByRole('button', { name: 'Move to Storefront' }))
 await screen.findByText('2 moved.')
})

it('cannot clear an all-Inbox selection during a pending deletion', async () => {
 let finish!: (value: any) => void
 vi.mocked(bulkDeleteExtensionComments).mockReturnValueOnce(new Promise(resolve => { finish=resolve }))
 render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
 await screen.findByText('First comment')
 fireEvent.click(screen.getByRole('button',{name:'Select'}))
 fireEvent.click(screen.getByRole('button',{name:'Select page'}))
 fireEvent.click(screen.getByRole('button',{name:'Select all 21 in Inbox'}))
 fireEvent.click(screen.getByRole('menuitem',{name:'Delete selected'}))
 fireEvent.click(screen.getByRole('button',{name:'Delete 21'}))
 fireEvent.click(screen.getAllByRole('button',{name:'Clear selection'})[0]!)
 expect(screen.getByRole('toolbar')).toHaveTextContent('21 selected')
 await act(async () => finish({processedIds:[],skipped:[],selectedTotal:21}))
})


it.each(['unmount', 'token', 'api'] as const)('ignores a late bulk move after %s context changes', async (change) => {
  let finish!: (result: any) => void
  vi.mocked(bulkAssignExtensionComments).mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const onMoved = vi.fn()
  const view = render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} onMovedToProject={onMoved} />)
  await screen.findByText('First comment')
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Move to Storefront' }))
  if (change === 'unmount') view.unmount()
  else view.rerender(<ExtensionCommentsPage apiBase={change === 'api' ? '/other-api' : '/api'} accessToken={change === 'token' ? 'new-token' : 'token'} projects={[project]} onMovedToProject={onMoved} />)
  await act(async () => finish({ processedIds: ['c1'], skipped: [], selectedTotal: 1 }))
  expect(onMoved).not.toHaveBeenCalled()
})

it('does not report an old move failure after the token changes', async () => {
  let fail!: (reason: Error) => void
  vi.mocked(bulkAssignExtensionComments).mockReturnValueOnce(new Promise((_, reject) => { fail = reject }))
  const view = render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
  await screen.findByText('First comment')
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Move to Storefront' }))
  view.rerender(<ExtensionCommentsPage apiBase="/api" accessToken="new-token" projects={[project]} />)
  await act(async () => fail(new Error('Old move failed')))
  expect(screen.queryByText('Old move failed')).toBeNull()
  expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
})

it('keeps the bulk selection intact when an ordinary navigation key is pressed', async () => {
  render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
  await screen.findByText('First comment')
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  fireEvent.click(screen.getByRole('button', { name: /First comment/ }))
  fireEvent.keyDown(window, { key: 'j' })
  expect(screen.getByRole('toolbar', { name: 'Bulk actions for 1 selected item' })).toBeInTheDocument()
  expect(screen.getByText('Select an Inbox item')).toBeInTheDocument()
})


it('retains comments that failed database deletion for a bounded retry', async () => {
  vi.mocked(bulkDeleteExtensionComments).mockResolvedValueOnce({
    processedIds: ['c1'], skipped: [{ id: 'c2', reason: 'mutation_failed' }], selectedTotal: 2,
  } as never)
  render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
  await screen.findByText('First comment')
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }))
  await screen.findByText('1 deleted; 1 could not be deleted and remain selected.')
  expect(screen.getByRole('toolbar', { name: 'Bulk actions for 1 selected item' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete 1' }))
  await waitFor(() => expect(bulkDeleteExtensionComments).toHaveBeenLastCalledWith('/api', 'token', { mode: 'ids', ids: ['c2'] }))
})

it.each([false, true])('ignores an old bulk deletion after switching account (failure: %s)', async (failure) => {
  let finish!: (value: any) => void
  let fail!: (reason: Error) => void
  vi.mocked(bulkDeleteExtensionComments).mockReturnValueOnce(new Promise((resolve, reject) => { finish = resolve; fail = reject }))
  const view = render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
  await screen.findByText('First comment')
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }))
  view.rerender(<ExtensionCommentsPage apiBase="/api" accessToken="new-token" />)
  await screen.findByText('First comment')
  await act(async () => { if (failure) fail(new Error('Old deletion failed')); else finish({ processedIds: ['c1'], skipped: [], selectedTotal: 2 }) })
  expect(screen.getByText('First comment')).toBeInTheDocument()
  expect(screen.queryByText('1 deleted.')).toBeNull()
  expect(screen.queryByText('Old deletion failed')).toBeNull()
  expect(screen.queryByRole('toolbar')).toBeNull()
})

it('disables Inbox navigation shortcuts while retaining mouse navigation and Escape', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'disabled' })
  try {
    await act(async () => { render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />) })
    fireEvent.click(await screen.findByRole('button', { name: /First comment/ }))
    for (const key of ['j', 'k', 'ArrowDown', 'ArrowUp', ' ']) fireEvent.keyDown(window, { key })
    expect(screen.getByText('1/2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next comment' }))
    expect(screen.getByText('2/2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('toolbar')).toBeNull()
  } finally { vi.unstubAllGlobals() }
})

it('selects the entire Inbox in one click without entering selection mode or selecting a page', async () => {
 render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project]} />)
 fireEvent.click(await screen.findByRole('button', { name: 'Select all 21 in Inbox' }))
 expect(screen.getByRole('toolbar')).toHaveTextContent('21 selected')
 expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: 'Move to Storefront' }))
 await waitFor(() => expect(bulkAssignExtensionComments).toHaveBeenCalledWith('/api', 'token', { mode: 'all', excludedIds: [] }, 'store'))
})
it('selects only the current page directly and does not select unloaded items', async () => {
 render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
 await screen.findByText('First comment')
 fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
 expect(screen.getByRole('toolbar')).toHaveTextContent('2 selected')
 expect(screen.queryByText('All 21 Inbox items are selected.')).toBeNull()
})


it('moves all Inbox items to the chosen destination in two clicks and disables repeat moves', async () => {
 let finish!: (value: any) => void
 vi.mocked(bulkAssignExtensionComments).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
 render(<ExtensionCommentsPage apiBase="/api" accessToken="token" projects={[project, { ...project, publicKey: 'second', name: 'Second project' }]} />)
 fireEvent.click(await screen.findByRole('button', { name: 'Select all 21 in Inbox' }))
 fireEvent.click(screen.getByRole('button', { name: 'Move to Second project' }))
 expect(bulkAssignExtensionComments).toHaveBeenCalledWith('/api', 'token', { mode: 'all', excludedIds: [] }, 'second')
 expect(screen.getByRole('button', { name: 'Move to Storefront' })).toBeDisabled()
 expect(screen.getByRole('button', { name: 'Move to Second project' })).toBeDisabled()
 await act(async () => finish({ processedIds: ['c1'], skipped: [], selectedTotal: 21 }))
})
