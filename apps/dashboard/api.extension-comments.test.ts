import { afterEach, describe, expect, it, vi } from 'vitest'
import { assignExtensionComment, bulkAssignExtensionComments, bulkDeleteExtensionComments, deleteExtensionComment, listExtensionComments, updateExtensionComment } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('extension comment dashboard API', () => {
  it('lists, updates, and assigns extension comments with session authorization', async () => {
    const page = { items: [], page: 2, limit: 20, total: 0 }
    const updated = { id: 'c/1', body: 'Updated' }
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(page) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(updated) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ ...updated, projectId: 'project' }) })
    vi.stubGlobal('fetch', fetch)
    await expect(listExtensionComments('/api', 'token', 2)).resolves.toEqual(page)
    await expect(updateExtensionComment('/api', 'token', 'c/1', 'Updated')).resolves.toEqual(updated)
    await expect(assignExtensionComment('/api', 'token', 'c/1', 'project')).resolves.toEqual({ ...updated, projectId: 'project' })
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/extension/comments?page=2&limit=20', { headers: { Authorization: 'Bearer token' } })
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/extension/comments/c%2F1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ body: 'Updated' }) }))
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/v1/extension/comments/c%2F1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ projectId: 'project' }) }))
  })

  it('deletes comments and reports response text or status', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Forbidden' })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
    vi.stubGlobal('fetch', fetch)
    await expect(deleteExtensionComment('/api', 'token', 'c/1')).resolves.toBeUndefined()
    await expect(deleteExtensionComment('/api', 'token', 'c')).rejects.toThrow('Forbidden')
    await expect(deleteExtensionComment('/api', 'token', 'c')).rejects.toThrow('Request failed with 503')
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/extension/comments/c%2F1', { method: 'DELETE', headers: { Authorization: 'Bearer token' } })
  })

  it('assigns and deletes Inbox selections through the bulk endpoint', async () => {
    const result = { processedIds: ['c1'], skipped: [], selectedTotal: 1 }
    const fetch = vi.fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(result) })
    vi.stubGlobal('fetch', fetch)
    const selection = { mode: 'ids' as const, ids: ['c1'] }
    await expect(bulkAssignExtensionComments('/api', 'token', selection, 'project')).resolves.toEqual(result)
    await expect(bulkDeleteExtensionComments('/api', 'token', selection)).resolves.toEqual(result)
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/extension/comments/bulk', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ operation: 'assign', selection, projectId: 'project' }),
    }))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/extension/comments/bulk', expect.objectContaining({
      body: JSON.stringify({ operation: 'delete', selection }),
    }))
  })
})
