import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
vi.mock('./extension-comment-limit.js', () => ({ reserveExtensionComment: vi.fn() }))

import { getServiceSupabase } from './supabase.js'
import { reserveExtensionComment } from './extension-comment-limit.js'
import {
  createExtensionComment,
  deleteExtensionComment,
  ExtensionCommentError,
  listExtensionComments,
  normalizeExtensionPageUrl,
  parseExtensionPagination,
  updateExtensionComment,
} from './extension-comments.js'

const row = {
  id: 'c1', url: 'https://example.com/a?q=1', page_hostname: 'example.com',
  x: 12, y: 34, element: '#target', comment: 'Hello',
  screenshot_storage_path: null, created_at: '2026-01-01', updated_at: '2026-01-02',
}

class Query {
  calls: Array<[string, ...unknown[]]> = []
  constructor(private response: unknown) {}
  select(...args: unknown[]) { this.calls.push(['select', ...args]); return this }
  eq(...args: unknown[]) { this.calls.push(['eq', ...args]); return this }
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
      storage: { from: vi.fn(() => bucket) },
    },
  }
}

beforeEach(() => {
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
})
