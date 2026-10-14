import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./extension-image-cleanup.js', () => ({ processExtensionImageCleanup: vi.fn() }))

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
vi.mock('./extension-comment-limit.js', () => ({ reserveExtensionComment: vi.fn() }))

import { processExtensionImageCleanup } from './extension-image-cleanup.js'
import { getServiceSupabase } from './supabase.js'
import { reserveExtensionComment } from './extension-comment-limit.js'
import {
  bulkAssignExtensionCommentsToProject,
  bulkDeleteExtensionComments,
  createExtensionComment,
  deleteExtensionComment,
  ExtensionCommentError,
  getOwnedExtensionCommentScope,
  assignExtensionCommentToProject,
  listExtensionComments,
  normalizeExtensionPageUrl,
  parseExtensionCommentBulkSelection,
  parseExtensionPagination,
  updateExtensionComment,
} from './extension-comments.js'

const row = {
  id: 'c1', project_id: null, url: 'https://example.com/a?q=1', page_hostname: 'example.com',
  source: 'extension', created_by_user_id: 'u1', status: 'pending', image_url: null,
  x: 12, y: 34, element: '#target', comment: 'Hello',
  screenshot_storage_path: null, author_name: 'u@example.com', created_at: '2026-01-01', updated_at: '2026-01-02',
}

class Query {
  calls: Array<[string, ...unknown[]]> = []
  constructor(private response: unknown) {}
  select(...args: unknown[]) { this.calls.push(['select', ...args]); return this }
  eq(...args: unknown[]) { this.calls.push(['eq', ...args]); return this }
  is(...args: unknown[]) { this.calls.push(['is', ...args]); return this }
  in(...args: unknown[]) { this.calls.push(['in', ...args]); return this }
  not(...args: unknown[]) { this.calls.push(['not', ...args]); return this }
  gt(...args: unknown[]) { this.calls.push(['gt', ...args]); return this }
  limit(...args: unknown[]) { this.calls.push(['limit', ...args]); return this }
  gte(...args: unknown[]) { this.calls.push(['gte', ...args]); return this }
  order(...args: unknown[]) { this.calls.push(['order', ...args]); return this }
  range(...args: unknown[]) { this.calls.push(['range', ...args]); return this }
  insert(...args: unknown[]) { this.calls.push(['insert', ...args]); return this }
  update(...args: unknown[]) { this.calls.push(['update', ...args]); return this }
  delete(...args: unknown[]) { this.calls.push(['delete', ...args]); return this }
  single() { this.calls.push(['single']); return this }
  maybeSingle() { this.calls.push(['maybeSingle']); return this }
  then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
    return Promise.resolve(this.response).then(resolve, reject)
  }
}

function client(responses: unknown[], storageOverrides: Record<string, unknown> = {}) {
  const queries: Query[] = []
  const bucket = {
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed' }, error: null }),
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    ...storageOverrides,
  }
  return {
    queries,
    bucket,
    value: {
      from: vi.fn(() => {
        const query = new Query(responses.shift())
        queries.push(query)
        return query
      }),
      rpc: vi.fn(() => { const query = new Query(responses.shift()); queries.push(query); return query }),
      storage: { from: vi.fn(() => bucket) },
    },
  }
}

beforeEach(() => {
  vi.mocked(processExtensionImageCleanup).mockReset().mockResolvedValue()
  vi.mocked(getServiceSupabase).mockReset()
  vi.mocked(reserveExtensionComment).mockReset().mockResolvedValue(true)
})

describe('extension comment parsing', () => {
  it('normalizes supported URLs and rejects invalid input', () => {
    expect(normalizeExtensionPageUrl('HTTPS://Example.COM/a?q=1#secret')).toEqual({
      pageUrl: 'https://example.com/a?q=1', pageHostname: 'example.com',
    })
    for (const value of ['', 'x'.repeat(2049), 'not a url', 'ftp://example.com']) {
      expect(() => normalizeExtensionPageUrl(value)).toThrow(ExtensionCommentError)
    }
    expect(() => normalizeExtensionPageUrl(42)).toThrow(/pageUrl/)
  })

  it('parses pagination boundaries and rejects each invalid dimension', () => {
    expect(parseExtensionPagination({})).toEqual({ page: 1, limit: 20 })
    expect(parseExtensionPagination({ page: '2', limit: '50' })).toEqual({ page: 2, limit: 50 })
    for (const query of [
      { page: 'x' }, { page: 0 }, { limit: 'x' }, { limit: 0 }, { limit: 51 },
    ]) expect(() => parseExtensionPagination(query)).toThrow(/page must be positive/)
  })

  it('parses and deduplicates bounded bulk selections', () => {
    const first = '00000000-0000-4000-8000-000000000001'
    const second = '00000000-0000-4000-8000-000000000002'
    expect(parseExtensionCommentBulkSelection({ mode: 'ids', ids: [first, first, second] }))
      .toEqual({ mode: 'ids', ids: [first, second] })
    expect(parseExtensionCommentBulkSelection({ mode: 'all' })).toEqual({ mode: 'all', excludedIds: [] })
    expect(parseExtensionCommentBulkSelection({ mode: 'all', excludedIds: [second] }))
      .toEqual({ mode: 'all', excludedIds: [second] })

    for (const selection of [
      null,
      {},
      { mode: 'other' },
      { mode: 'ids', ids: [] },
      { mode: 'ids', ids: ['not-a-uuid'] },
      { mode: 'all', excludedIds: ['not-a-uuid'] },
      { mode: 'ids', ids: Array.from({ length: 501 }, () => first) },
      { mode: 'all', excludedIds: Array.from({ length: 501 }, () => second) },
    ]) expect(() => parseExtensionCommentBulkSelection(selection)).toThrow(ExtensionCommentError)
  })
})

describe('extension comment persistence', () => {
  it('persists validated text-range anchors and rejects malformed ones', async () => {
    const anchor = { kind: 'text_range', selectedText: 'quote', normalizedText: 'quote', prefix: '', suffix: '', containerSelector: '#target', startOffset: 0, endOffset: 5, createdFromUrl: row.url }
    const fake = client([{ data: { ...row, target_type: 'text_range', anchor }, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    const input = { pageUrl: row.url, body: 'Hello', selector: '#target', x: 1, y: 2, targetType: 'text_range', anchor }
    await expect(createExtensionComment('u1', input)).resolves.toMatchObject({ targetType: 'text_range', anchor })
    expect(fake.queries[0]?.calls).toContainEqual(['insert', expect.objectContaining({ target_type: 'text_range', anchor })])
    await expect(createExtensionComment('u1', { ...input, anchor: {} })).rejects.toMatchObject({ status: 400 })
  })
  it('lists comments with optional exact URL filtering and signed screenshots', async () => {
    let fake = client([{ data: [row], error: null, count: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(listExtensionComments('u1', {})).resolves.toMatchObject({ total: 0, page: 1, items: [{ body: 'Hello', screenshotUrl: null }] })
    expect(fake.queries[0]?.calls).toContainEqual(['is', 'project_id', null])
    expect(fake.queries[0]?.calls).not.toContainEqual(['eq', 'url', expect.anything()])

    fake = client([{ data: null, error: null, count: 0 }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(listExtensionComments('u1', {})).resolves.toMatchObject({ items: [] })

    fake = client([{ data: [{ ...row, screenshot_storage_path: 'u1/a.png' }], error: null, count: 1 }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    const result = await listExtensionComments('u1', { pageUrl: 'https://example.com/a?q=1#x' })
    expect(result.items[0]?.screenshotUrl).toBe('https://signed')
    expect(fake.queries[0]?.calls).toContainEqual(['eq', 'url', 'https://example.com/a?q=1'])
  })

  it('lists project extension comments without restricting them to their creator', async () => {
    const fake = client([{ data: [
      { ...row, project_id: 'project' },
      { ...row, id: 'widget', project_id: 'project', source: 'widget', created_by_user_id: null, status: 'approved', image_url: 'https://public/image.png' },
    ], error: null, count: 2 }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(listExtensionComments('u1', { projectId: 'project' })).resolves.toMatchObject({
      items: [
        { projectId: 'project', authorName: 'u@example.com', editable: true },
        { id: 'widget', reviewStatus: 'accepted', editable: false, screenshotUrl: 'https://public/image.png' },
      ],
    })
    expect(fake.value.rpc).toHaveBeenCalledWith('read_project_feedback', { p_project: 'project', p_actor: 'u1' })
    expect(fake.queries[0]?.calls).toContainEqual(['eq', 'project_id', 'project'])
    for (const column of ['url', 'element', 'x', 'y']) {
      expect(fake.queries[0]?.calls).toContainEqual(['not', column, 'is', null])
    }
    expect(fake.queries[0]?.calls).not.toContainEqual(['eq', 'created_by_user_id', 'u1'])
    expect(fake.queries[0]?.calls).not.toContainEqual(['eq', 'source', 'extension'])

    const guestFake = client([{ data: [{ ...row, project_id: 'project', visibility: 'shared' }], error: null, count: 1 }])
    vi.mocked(getServiceSupabase).mockReturnValue(guestFake.value as never)
    await listExtensionComments('guest', { projectId: 'project' }, 'shared')
    expect(guestFake.queries[0]?.calls).toContainEqual(['eq', 'visibility', 'shared'])
  })

  it('surfaces list and signed-URL failures', async () => {
    let fake = client([{ data: null, error: { message: 'query down' }, count: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(listExtensionComments('u1', {})).rejects.toThrow('query down')

    fake = client([{ data: [{ ...row, screenshot_storage_path: 'x' }], error: null, count: 1 }], {
      createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: 'sign down' } }),
    })
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(listExtensionComments('u1', {})).rejects.toThrow('Screenshot signing failed')
  })

  it('keeps a partially deleted comment readable when its private object is missing', async () => {
    const fake = client([{ data: [{ ...row, screenshot_storage_path: 'u1/missing.png' }, row], error: null, count: 2 }], {
      createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: 'Object not found' } }),
    })
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(listExtensionComments('u1', {})).resolves.toMatchObject({ total: 2, items: [{ screenshotUrl: null }, { screenshotUrl: null }] })
  })

  it('retains an owned cleanup reference if both upload and compensation fail', async () => {
    const fake = client([{ data: row, error: null }, { data: { screenshot_storage_path: 'u/a.png' }, error: null }], {
      upload: vi.fn().mockResolvedValue({ error: { message: 'upload interrupted' } }),
      remove: vi.fn().mockResolvedValue({ error: { message: 'storage unavailable' } }),
    })
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(createExtensionComment('u', { pageUrl: row.url, body: 'draft', selector: '#target', x: 1, y: 2,
      screenshot: { base64: 'eA==', mimeType: 'image/png' } })).rejects.toThrow('comment retained for cleanup')
    expect(fake.queries[0].calls).toContainEqual(['insert', expect.objectContaining({ created_by_user_id: 'u', screenshot_storage_path: expect.stringMatching(/^u\//) })])
    expect(fake.queries).toHaveLength(2)
  })

  it('creates comments with normalized data and an optional private image', async () => {
    const fake = client([
      { data: { ...row, screenshot_storage_path: 'u1/file.jpg' }, error: null },
    ])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    const result = await createExtensionComment('u1', {
      pageUrl: 'https://EXAMPLE.com/a?q=1#hash', body: ' Hello ', selector: ' #target ', x: 0, y: 100,
      screenshot: { base64: Buffer.from('image').toString('base64'), mimeType: 'image/jpeg' },
    })
    expect(result.screenshotUrl).toBe('https://signed')
    expect(fake.bucket.upload).toHaveBeenCalledWith(expect.stringMatching(/^u1\/.+\.jpg$/), expect.any(Buffer), expect.anything())
    expect(fake.queries[0]?.calls).toContainEqual(['insert', expect.objectContaining({ page_hostname: 'example.com', comment: 'Hello' })])
    expect(reserveExtensionComment).toHaveBeenCalledWith(fake.value, 'u1')
    expect(vi.mocked(reserveExtensionComment).mock.invocationCallOrder[0]).toBeLessThan(fake.bucket.upload.mock.invocationCallOrder[0])
  })

  it('creates an authenticated project comment in the same comments collection', async () => {
    const fake = client([{ data: { ...row, project_id: 'project', visibility: 'internal' }, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    const result = await createExtensionComment('u1', {
      pageUrl: row.url, body: 'Project feedback', selector: '#target', x: 1, y: 2,
    }, 'project', 'u@example.com', 'internal')
    expect(result).toMatchObject({ projectId: 'project', authorName: 'u@example.com', visibility: 'internal' })
    expect(fake.queries[0]?.calls).toContainEqual(['insert', expect.objectContaining({
      project_id: 'project', created_by_user_id: 'u1', author_name: 'u@example.com', visibility: 'internal',
    })])
  })

  it('validates create fields and screenshots', async () => {
    const base = { pageUrl: 'https://example.com', body: 'x', selector: '#x', x: 1, y: 2 }
    const invalid = [
      { ...base, body: '' }, { ...base, body: 1 }, { ...base, body: 'x'.repeat(8001) },
      { ...base, selector: '' }, { ...base, selector: 1 }, { ...base, selector: 'x'.repeat(1001) },
      { ...base, x: 'x' }, { ...base, x: Number.NaN }, { ...base, x: -1 }, { ...base, y: 101 },
      { ...base, screenshot: { base64: 1, mimeType: 'image/png' } },
      { ...base, screenshot: { base64: 'eA==', mimeType: 1 } },
      { ...base, screenshot: { base64: 'eA==', mimeType: 'image/gif' } },
      { ...base, screenshot: { base64: '', mimeType: 'image/png' } },
      { ...base, screenshot: { base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'), mimeType: 'image/png' } },
    ]
    for (const input of invalid) await expect(createExtensionComment('u1', input)).rejects.toBeInstanceOf(ExtensionCommentError)
  })

  it('enforces rate limits and reports persistence failures', async () => {
    const base = { pageUrl: 'https://example.com', body: 'x', selector: '#x', x: 1, y: 2 }
    let fake = client([])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    vi.mocked(reserveExtensionComment).mockRejectedValueOnce(new Error('limit down'))
    await expect(createExtensionComment('u', base)).rejects.toThrow('limit down')

    fake = client([])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    vi.mocked(reserveExtensionComment).mockResolvedValueOnce(false)
    await expect(createExtensionComment('u', base)).rejects.toMatchObject({ status: 429 })
    expect(fake.value.from).not.toHaveBeenCalled()
    expect(fake.bucket.upload).not.toHaveBeenCalled()

    fake = client([{ data: row, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(createExtensionComment('u', base)).resolves.toMatchObject({ id: 'c1' })

    const withImage = { ...base, screenshot: { base64: 'eA==', mimeType: 'image/webp' } }
    fake = client([{ data: row, error: null }, { data: { screenshot_storage_path: 'u/a.webp' }, error: null }, { error: null }], { upload: vi.fn().mockResolvedValue({ error: { message: 'upload down' } }) })
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(createExtensionComment('u', withImage)).rejects.toThrow('Screenshot upload failed')

    fake = client([{ data: null, error: { message: 'insert down' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(createExtensionComment('u', withImage)).rejects.toThrow('insert down')
    expect(fake.bucket.upload).not.toHaveBeenCalled()
    expect(fake.bucket.remove).not.toHaveBeenCalled()

    fake = client([{ data: null, error: { message: 'insert down' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(createExtensionComment('u', base)).rejects.toThrow('insert down')
    expect(fake.bucket.remove).not.toHaveBeenCalled()
  })

  it('updates only owned comments and handles errors', async () => {
    let fake = client([{ data: row, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(updateExtensionComment('u', 'c1', ' Updated ')).resolves.toMatchObject({ body: 'Hello' })
    expect(fake.queries[0]?.calls).toContainEqual(['update', expect.objectContaining({ comment: 'Updated' })])

    fake = client([{ data: null, error: null }]); vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(updateExtensionComment('u', 'missing', 'x')).rejects.toMatchObject({ status: 404 })
    fake = client([{ data: null, error: { message: 'update down' } }]); vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(updateExtensionComment('u', 'c', 'x')).rejects.toThrow('update down')
  })

  it('resolves the project scope only for an owned extension comment', async () => {
    let fake = client([{ data: { project_id: 'project' }, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(getOwnedExtensionCommentScope('u', 'c1')).resolves.toEqual({ projectId: 'project', visibility: 'shared' })
    expect(fake.queries[0]?.calls).toEqual(expect.arrayContaining([
      ['select', 'project_id,visibility'],
      ['eq', 'id', 'c1'],
      ['eq', 'source', 'extension'],
      ['eq', 'created_by_user_id', 'u'],
    ]))

    fake = client([{ data: { project_id: 'project', visibility: 'internal' }, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(getOwnedExtensionCommentScope('u', 'c1')).resolves.toEqual({ projectId: 'project', visibility: 'internal' })

    fake = client([{ data: { project_id: null }, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(getOwnedExtensionCommentScope('u', 'private')).resolves.toEqual({ projectId: null, visibility: 'shared' })

    fake = client([{ data: null, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(getOwnedExtensionCommentScope('u', 'missing')).resolves.toBeNull()

    fake = client([{ data: null, error: { message: 'scope down' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(getOwnedExtensionCommentScope('u', 'c1')).rejects.toThrow('scope down')
  })

  it('promotes an owned private comment in place and retries idempotently', async () => {
    let fake = client([{ data: { ...row, project_id: 'project' }, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(assignExtensionCommentToProject('u', 'c1', 'project')).resolves.toMatchObject({ id: 'c1', projectId: 'project' })
    expect(fake.queries[0].calls).toEqual(expect.arrayContaining([
      ['update', expect.objectContaining({ project_id: 'project' })],
      ['eq', 'created_by_user_id', 'u'],
      ['is', 'project_id', null],
    ]))

    fake = client([{ data: null, error: null }, { data: { ...row, project_id: 'project' }, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(assignExtensionCommentToProject('u', 'c1', 'project')).resolves.toMatchObject({ projectId: 'project' })

    fake = client([{ data: null, error: null }, { data: { ...row, project_id: 'other' }, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(assignExtensionCommentToProject('u', 'c1', 'project')).rejects.toMatchObject({ status: 409 })

    fake = client([{ data: null, error: null }, { data: null, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(assignExtensionCommentToProject('u', 'missing', 'project')).rejects.toMatchObject({ status: 404 })

    fake = client([{ data: null, error: { message: 'assign down' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(assignExtensionCommentToProject('u', 'c1', 'project')).rejects.toThrow('assign down')

    fake = client([{ data: null, error: null }, { data: null, error: { message: 'lookup down' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(assignExtensionCommentToProject('u', 'c1', 'project')).rejects.toThrow('lookup down')
  })

  it('deletes owned comments and their private screenshots', async () => {
    let fake = client([{ data: { screenshot_storage_path: null }, error: null }, { error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await deleteExtensionComment('u', 'c1')
    expect(fake.bucket.remove).not.toHaveBeenCalled()

    fake = client([{ data: { screenshot_storage_path: 'u/a.png' }, error: null }, { error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await deleteExtensionComment('u', 'c1')
    expect(fake.bucket.remove).toHaveBeenCalledWith(['u/a.png'])

    fake = client([{ data: null, error: null }]); vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(deleteExtensionComment('u', 'x')).rejects.toMatchObject({ status: 404 })
    fake = client([{ data: null, error: { message: 'delete down' } }]); vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(deleteExtensionComment('u', 'x')).rejects.toThrow('delete down')
    fake = client([{ data: { screenshot_storage_path: 'x' }, error: null }], { remove: vi.fn().mockResolvedValue({ error: { message: 'storage down' } }) })
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(deleteExtensionComment('u', 'x')).rejects.toThrow('Screenshot deletion failed')
    expect(fake.queries).toHaveLength(1)
    expect(fake.queries[0].calls).not.toContainEqual(['delete'])
  })

  it('retries storage cleanup before deleting the owned row, including after a database failure', async () => {
    const owned = { data: { screenshot_storage_path: 'u/a.png' }, error: null }
    const fake = client([owned, owned, { error: { message: 'database down' } }, owned, { error: null }], {
      remove: vi.fn().mockResolvedValueOnce({ error: { message: 'storage down' } }).mockResolvedValue({ error: null }),
    })
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(deleteExtensionComment('u', 'c1')).rejects.toThrow('Screenshot deletion failed')
    expect(fake.value.from).toHaveBeenCalledTimes(1)
    await expect(deleteExtensionComment('u', 'c1')).rejects.toThrow('database down')
    await expect(deleteExtensionComment('u', 'c1')).resolves.toBeUndefined()
    expect(fake.bucket.remove).toHaveBeenCalledTimes(3)
    for (const query of fake.queries) {
      expect(query.calls).toEqual(expect.arrayContaining([
        ['eq', 'id', 'c1'], ['eq', 'source', 'extension'], ['eq', 'created_by_user_id', 'u'],
      ]))
    }
    expect(fake.queries[4].calls).toContainEqual(['delete'])
  })

  it('bulk assigns only owned Inbox rows and reports stale selections', async () => {
    const first = '00000000-0000-4000-8000-000000000001'
    const missing = '00000000-0000-4000-8000-000000000002'
    const fake = client([
      { data: [{ id: first, screenshot_storage_path: null }], error: null },
      { data: [{ id: first }], error: null },
    ])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkAssignExtensionCommentsToProject(
      'u', { mode: 'ids', ids: [first, missing] }, 'project', 'internal',
    )).resolves.toEqual({
      processedIds: [first],
      skipped: [{ id: missing, reason: 'not_in_inbox' }],
      selectedTotal: 2,
    })
    expect(fake.queries[0].calls).toEqual(expect.arrayContaining([
      ['eq', 'source', 'extension'], ['eq', 'created_by_user_id', 'u'], ['is', 'project_id', null], ['in', 'id', [first, missing]],
    ]))
    expect(fake.value.rpc).toHaveBeenCalledWith('assign_actor_inbox_feedback', { p_actor: 'u', p_project: 'project', p_ids: [first], p_visibility: 'internal' })
  })

  it('bulk assignment supports all-with-exclusions, empty sets, concurrency, and database failures', async () => {
    const first = '00000000-0000-4000-8000-000000000001'
    const second = '00000000-0000-4000-8000-000000000002'
    let fake = client([
      { data: [{ id: first, screenshot_storage_path: null }, { id: second, screenshot_storage_path: null }], error: null },
      { data: [], error: null },
    ])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkAssignExtensionCommentsToProject('u', { mode: 'all', excludedIds: [second] }, 'project'))
      .resolves.toEqual({ processedIds: [], skipped: [{ id: first, reason: 'concurrent_change' }], selectedTotal: 1 })

    fake = client([{ data: null, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkAssignExtensionCommentsToProject('u', { mode: 'all', excludedIds: [] }, 'project'))
      .resolves.toEqual({ processedIds: [], skipped: [], selectedTotal: 0 })

    fake = client([{ data: null, error: { message: 'resolve down' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkAssignExtensionCommentsToProject('u', { mode: 'ids', ids: [first] }, 'project')).rejects.toThrow('resolve down')

    fake = client([{ data: [{ id: first, screenshot_storage_path: null }], error: null }, { data: null, error: { message: 'assign down' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkAssignExtensionCommentsToProject('u', { mode: 'ids', ids: [first] }, 'project')).rejects.toThrow('assign down')
  })

  it('keeps images of concurrently moved comments and cleans only deleted snapshots', async () => {
    const first = '00000000-0000-4000-8000-000000000001'
    const second = '00000000-0000-4000-8000-000000000002'
    const missing = '00000000-0000-4000-8000-000000000003'
    const fake = client([
      { data: [{ id: first, screenshot_storage_path: 'u/old.png' }, { id: second, screenshot_storage_path: 'u/retained.png' }], error: null },
      { data: [{ id: first, screenshot_storage_path: 'u/current.png' }], error: null },
    ])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkDeleteExtensionComments('u', { mode: 'ids', ids: [first, second, missing] })).resolves.toEqual({
      processedIds: [first], skipped: [{ id: missing, reason: 'not_in_inbox' }, { id: second, reason: 'concurrent_change' }], selectedTotal: 3,
    })
    expect(processExtensionImageCleanup).toHaveBeenCalledExactlyOnceWith(['u/current.png'])
    expect(fake.queries[1].calls).toContainEqual(['select', 'id,screenshot_storage_path'])
  })

  it('does not remove any screenshots if the guarded database deletion fails', async () => {
    const fake = client([{ data: [{ id: 'c1', screenshot_storage_path: 'u/keep.png' }], error: null }, { data: null, error: { message: 'delete down' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkDeleteExtensionComments('u', { mode: 'ids', ids: ['c1'] })).rejects.toThrow('delete down')
    expect(fake.bucket.remove).not.toHaveBeenCalled()
  })

  it('reports deletion success even if subsequent storage cleanup fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = client([
      { data: [{ id: 'c1', screenshot_storage_path: 'u/one.png' }, { id: 'c2', screenshot_storage_path: 'u/two.png' }, { id: 'c3', screenshot_storage_path: null }], error: null },
      { data: [{ id: 'c1', screenshot_storage_path: 'u/one.png' }, { id: 'c2', screenshot_storage_path: 'u/two.png' }, { id: 'c3', screenshot_storage_path: null }], error: null },
    ], { remove: vi.fn().mockResolvedValueOnce({ error: { message: 'storage down' } }).mockRejectedValueOnce(new Error('network down')) })
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    vi.mocked(processExtensionImageCleanup).mockRejectedValueOnce(new Error('queue unavailable'))
    await expect(bulkDeleteExtensionComments('u', { mode: 'all', excludedIds: [] })).resolves.toEqual({ processedIds: ['c1', 'c2', 'c3'], skipped: [], selectedTotal: 3 })
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it('handles empty and null deletion results', async () => {
    let fake = client([{ data: null, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkDeleteExtensionComments('u', { mode: 'all', excludedIds: [] })).resolves.toEqual({ processedIds: [], skipped: [], selectedTotal: 0 })
    fake = client([{ data: [{ id: 'c1', screenshot_storage_path: 'u/keep.png' }], error: null }, { data: null, error: null }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkDeleteExtensionComments('u', { mode: 'ids', ids: ['c1'] })).resolves.toEqual({ processedIds: [], skipped: [{ id: 'c1', reason: 'concurrent_change' }], selectedTotal: 1 })
    expect(fake.bucket.remove).not.toHaveBeenCalled()
  })

  it('paginates all Inbox rows by id before applying exclusions and batches deletion', async () => {
    const page = Array.from({ length: 500 }, (_, i) => ({ id: String(i).padStart(4, '0'), screenshot_storage_path: null }))
    const last = { id: '0500', screenshot_storage_path: 'u/last.png' }
    const selected = [...page.slice(1), last]
    const responses = [{ data: page, error: null }, { data: [last], error: null }, ...Array.from({ length: 5 }, (_, i) => ({ data: selected.slice(i*100, (i+1)*100), error: null }))]
    const fake = client(responses)
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    const result = await bulkDeleteExtensionComments('u', { mode: 'all', excludedIds: ['0000'] })
    expect(result.processedIds).toHaveLength(500)
    expect(result.selectedTotal).toBe(500)
    expect(fake.queries[1].calls).toContainEqual(['gt', 'id', '0499'])
    expect(fake.queries[1].calls).toContainEqual(['limit', 500])
    expect(processExtensionImageCleanup).toHaveBeenCalledExactlyOnceWith(['u/last.png'])
  })

  it('rejects revoked access at the atomic assignment boundary', async () => {
    const fake = client([{ data: [{ id: 'c1' }], error: null }, { data: null, error: { message: 'forbidden' } }])
    vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
    await expect(bulkAssignExtensionCommentsToProject('u', { mode: 'ids', ids: ['c1'] }, 'project')).rejects.toMatchObject({ status: 403 })
  })
})

it('denies an extension read when access changes after the API precheck', async () => {
  const fake = client([{ data: null, error: { message: 'forbidden' }, count: null }])
  vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
  await expect(listExtensionComments('u1', { projectId: 'project' })).rejects.toMatchObject({ status: 403 })
})

it('reports explicit missing selections and null atomic assignment results', async () => {
  let fake = client([{ data: [], error: null }])
  vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
  await expect(bulkAssignExtensionCommentsToProject('u', { mode: 'ids', ids: ['c1'] }, 'project')).resolves.toEqual({ processedIds: [], skipped: [{ id: 'c1', reason: 'not_in_inbox' }], selectedTotal: 1 })
  fake = client([{ data: [{ id: 'c1' }], error: null }, { data: null, error: null }])
  vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
  await expect(bulkAssignExtensionCommentsToProject('u', { mode: 'ids', ids: ['c1'] }, 'project')).resolves.toEqual({ processedIds: [], skipped: [{ id: 'c1', reason: 'concurrent_change' }], selectedTotal: 1 })
})

it('cleans each committed delete batch even when a later database request fails', async () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: `c${i}`, screenshot_storage_path: `u/${i}.png` }))
  const fake = client([{ data: rows, error: null }, { data: rows.slice(0, 100), error: null }, { data: null, error: { message: 'later batch down' } }])
  vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
  const result = await bulkDeleteExtensionComments('u', { mode: 'all', excludedIds: [] })
  expect(result).toEqual({ processedIds: rows.slice(0, 100).map(row => row.id), skipped: [{ id: 'c100', reason: 'mutation_failed' }], selectedTotal: 101 })
  expect(processExtensionImageCleanup).toHaveBeenCalledExactlyOnceWith(rows.slice(0, 100).map(row => row.screenshot_storage_path))
})

it('resolves over 1000 rows and bounds assignment results below the REST row cap', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: String(i).padStart(4, '0'), screenshot_storage_path: null }))
  const fake = client([
    { data: rows.slice(0, 500), error: null }, { data: rows.slice(500, 1000), error: null }, { data: rows.slice(1000), error: null },
    { data: rows.slice(0, 500), error: null }, { data: rows.slice(500, 1000), error: null }, { data: rows.slice(1000), error: null },
  ])
  vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
  const result = await bulkAssignExtensionCommentsToProject('u', { mode: 'all', excludedIds: [] }, 'project')
  expect(result.processedIds).toHaveLength(1001)
  expect(result.selectedTotal).toBe(1001)
  expect(result.skipped).toEqual([])
  expect(fake.value.rpc.mock.calls.map((call: any[]) => call[1].p_ids.length)).toEqual([500, 500, 1])
})

it.each(['forbidden', 'database down'])('returns committed moves when a later batch fails: %s', async (message) => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: `c${i}` }))
  const fake = client([{ data: rows.slice(0, 500) }, { data: rows.slice(500) }, { data: rows.slice(0, 499) }, { error: { message } }])
  vi.mocked(getServiceSupabase).mockReturnValue(fake.value as never)
  const result = await bulkAssignExtensionCommentsToProject('u', { mode: 'all', excludedIds: [] }, 'p')
  expect(result.processedIds).toHaveLength(499)
  expect(result.skipped).toEqual([
    { id: 'c500', reason: message === 'forbidden' ? 'access_changed' : 'mutation_failed' },
    { id: 'c499', reason: 'concurrent_change' },
  ])
  expect(result.selectedTotal).toBe(501)
})
