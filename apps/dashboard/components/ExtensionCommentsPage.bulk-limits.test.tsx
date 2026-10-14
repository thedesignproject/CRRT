import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../api', () => ({ listExtensionComments: vi.fn(), bulkAssignExtensionComments: vi.fn(), bulkDeleteExtensionComments: vi.fn(), assignExtensionComment: vi.fn(), deleteExtensionComment: vi.fn(), updateExtensionComment: vi.fn() }))
vi.mock('./CommentDetail', () => ({ CommentDetail: () => null }))
vi.mock('./CommentList', () => ({ CommentList: ({ bulkControls: c, filteredComments, footer }: any) => <>
  <span data-testid="selected">{c.selectedCount}</span>
  <button onClick={c.enterBulkMode}>Select</button>
  <button onClick={c.toggleSelectAllVisible}>Page</button>
  <button onClick={c.selectAllMatching}>All</button>
  <button onClick={() => c.toggleBulkSelect(filteredComments[0].id)}>Toggle first</button>
  <button onClick={() => c.toggleBulkSelect(filteredComments[filteredComments.length-1].id)}>Toggle last</button>
  {footer}
</> }))
import { bulkDeleteExtensionComments, listExtensionComments } from '../api'
import { ExtensionCommentsPage } from './ExtensionCommentsPage'
const rows = Array.from({ length: 501 }, (_, i) => ({ id: `c${i}`, projectId: null, pageUrl: 'https://test.local', pageHostname: 'test.local', body: 'Feedback', selector: '', x: 0, y: 0, screenshotUrl: null, authorName: 'You', createdAt: '', updatedAt: '' }))
beforeEach(() => { vi.mocked(listExtensionComments).mockReset() })
afterEach(cleanup)
it('bounds explicit selections while keeping larger all-Inbox selections available', async () => {
  vi.mocked(listExtensionComments).mockResolvedValueOnce({ items: rows.slice(0,500), page: 1, total: 1000, limit: 20 }).mockResolvedValueOnce({ items: rows.slice(500), page: 2, total: 1000, limit: 20 })
  render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  fireEvent.click(screen.getByRole('button', { name: 'Page' }))
  expect(screen.getByTestId('selected')).toHaveTextContent('500')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(listExtensionComments).toHaveBeenCalledWith('/api','token',2))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Toggle first' }))
  expect(screen.getByRole('alert')).toHaveTextContent('at most 500')
  expect(screen.getByTestId('selected')).toHaveTextContent('500')
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  expect(screen.getByTestId('selected')).toHaveTextContent('1000')
})
it('bounds exclusions for both individual and page deselection', async () => {
  vi.mocked(listExtensionComments).mockResolvedValueOnce({ items: rows, page: 1, total: 1000, limit: 20 })
  render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  fireEvent.click(screen.getByRole('button', { name: 'Page' }))
  expect(screen.getByRole('alert')).toHaveTextContent('at most 500')
  expect(screen.getByTestId('selected')).toHaveTextContent('1000')
  // Select a legal 500 exclusions using a smaller second page, then test the
  // individual 501st exclusion without rendering hundreds of comment buttons.
  vi.mocked(listExtensionComments).mockResolvedValueOnce({ items: rows.slice(0,500), page: 2, total: 1000, limit: 20 })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(listExtensionComments).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Page' }))
  expect(screen.getByTestId('selected')).toHaveTextContent('500')
  vi.mocked(listExtensionComments).mockResolvedValueOnce({ items: rows.slice(500), page: 3, total: 1000, limit: 20 })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(listExtensionComments).toHaveBeenCalledTimes(3))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Toggle first' }))
  expect(screen.getByRole('alert')).toHaveTextContent('at most 500')
  expect(screen.getByTestId('selected')).toHaveTextContent('500')
})

it('keeps a large partial failure retry selection within the API limit', async () => {
 vi.mocked(listExtensionComments).mockResolvedValue({ items: rows, page: 1, total: 1000, limit: 20 })
 vi.mocked(bulkDeleteExtensionComments).mockResolvedValueOnce({ processedIds: [], skipped: rows.map(row => ({ id: row.id, reason: 'storage_delete_failed' as const })), selectedTotal: 1000 })
 render(<ExtensionCommentsPage apiBase="/api" accessToken="token" />)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
 fireEvent.click(screen.getByRole('button', { name: 'Select' }))
 fireEvent.click(screen.getByRole('button', { name: 'All' }))
 fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }))
 fireEvent.click(screen.getByRole('button', { name: 'Delete 1000' }))
 await screen.findByText(/The first 500 remain selected/)
 expect(screen.getByTestId('selected')).toHaveTextContent('500')
})
