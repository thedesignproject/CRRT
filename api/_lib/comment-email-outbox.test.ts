import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from './supabase.js'
import { CommentEmailEnqueueRejectedError, enqueueCommentEmail, processCommentEmailQueue } from './comment-email-outbox.js'

type Row = Record<string, any>
let rows: Row[]
let failure: string | undefined
let failureCode: string
const start = new Date('2026-09-23T00:00:00Z').getTime()

// Stateful PostgREST double exercises compare-and-swap and process restarts,
// rather than merely checking which fluent methods were called.
function database() {
  return { from: () => {
    let op = 'select'
    let values: any
    let single = false
    const filters: Array<(row: Row) => boolean> = []
    const execute = () => {
      const phase = op === 'update' ? (single ? 'claim' : 'checkpoint') : op
      if (failure === phase) { failure = undefined; return { data: null, error: { message: 'db failure', code: failureCode } } }
      if (op === 'upsert') {
        for (const value of values) {
          if (!rows.some((row) => row.delivery_id === value.delivery_id && row.batch_index === value.batch_index)) {
            rows.push({ id: `batch-${rows.length}`, status: 'pending', attempts: 0,
              next_attempt_at: new Date().toISOString(), created_at: new Date().toISOString(), ...value })
          }
        }
        return { error: null }
      }
      const matched = rows.filter((row) => filters.every((filter) => filter(row)))
      if (op === 'update') matched.forEach((row) => Object.assign(row, values))
      if (op === 'delete') rows = rows.filter((row) => !matched.includes(row))
      return { data: single ? (matched[0] ? { ...matched[0] } : null) : matched.map((row) => ({ ...row })), error: null }
    }
    const query: any = {
      upsert(value: any) { op = 'upsert'; values = value; return query },
      select() { return query },
      update(value: any) { op = 'update'; values = value; return query },
      delete() { op = 'delete'; return query },
      eq(key: string, value: any) { filters.push((row) => row[key] === value); return query },
      lte(key: string, value: any) { filters.push((row) => row[key] <= value); return query },
      lt(key: string, value: any) { filters.push((row) => row[key] < value); return query },
      order() { return query }, limit() { return query },
      maybeSingle() { single = true; return Promise.resolve(execute()) },
      then(resolve: any, reject: any) { return Promise.resolve(execute()).then(resolve, reject) },
    }
    return query
  } }
}

beforeEach(() => {
  rows = []; failure = undefined; failureCode = ''
  vi.useFakeTimers(); vi.setSystemTime(start)
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.mocked(getServiceSupabase).mockReturnValue(database() as never)
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('{}', { status: 200 })))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const queue = () => enqueueCommentEmail('delivery', ['[{"to":["one@example.com"]}]', '[{"to":["two@example.com"]}]'])

describe('durable comment email delivery', () => {
  it('persists the entire immutable snapshot and ignores duplicate enqueue', async () => {
    await queue()
    vi.setSystemTime(start + 60_000)
    await enqueueCommentEmail('delivery', ['changed', 'changed'])
    expect(rows).toHaveLength(2)
    expect(rows[0].body).toContain('one@example.com')
    expect(rows[0].expires_at).toBe(new Date(start + 20 * 3600_000).toISOString())
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['select', 'claim', 'checkpoint', 'delete'])('surfaces %s storage failures safely', async (phase) => {
    await queue()
    failure = phase
    await expect(processCommentEmailQueue()).rejects.toThrow('Comment email queue')
  })

  it.each(['23502', '40000', '40001', '40002', '40P01', '57014', '42P01', 'PGRST205', 'PGRST204'])('identifies definitive enqueue rejection %s', async (code) => {
    failure = 'upsert'; failureCode = code
    await expect(queue()).rejects.toBeInstanceOf(CommentEmailEnqueueRejectedError)
    expect(rows).toEqual([])
  })

  it.each(['40003', '08006', ''])('stops after three uncertain enqueue attempts for %s', async (code) => {
    const upsert = vi.fn().mockResolvedValue({ error: { code } })
    vi.mocked(getServiceSupabase).mockReturnValue({ from: () => ({ upsert }) } as never)
    const result = queue().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(249)
    expect(upsert).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(upsert).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(500)
    const error = await result
    expect(upsert).toHaveBeenCalledTimes(3)
    expect(error).not.toBeInstanceOf(CommentEmailEnqueueRejectedError)
    expect((error as Error).message).toContain('uncertain')
    expect(upsert.mock.calls[1]).toEqual(upsert.mock.calls[0])
    expect(upsert.mock.calls[2]).toEqual(upsert.mock.calls[0])
  })

  it('recovers from a temporary failure before commit', async () => {
    failure = 'upsert'
    const pending = queue()
    await vi.advanceTimersByTimeAsync(250)
    await pending
    expect(rows).toHaveLength(2)
    expect(rows[0].expires_at).toBe(new Date(start + 20 * 3600_000).toISOString())
  })

  it('retries a lost response after commit without duplicating rows', async () => {
    const db = database()
    const upsert = vi.fn().mockImplementation(async (values, options) => {
      const result = await db.from().upsert(values, options)
      if (upsert.mock.calls.length === 1) throw new Error('connection lost')
      return result
    })
    vi.mocked(getServiceSupabase).mockReturnValue({ from: () => ({ upsert }) } as never)
    const pending = queue()
    await vi.advanceTimersByTimeAsync(250)
    await pending
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(rows).toHaveLength(2)
    expect(upsert.mock.calls[1]).toEqual(upsert.mock.calls[0])
  })

  it('preserves uncertainty when a retry is definitively rejected', async () => {
    const upsert = vi.fn().mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValue({ error: { code: '23502' } })
    vi.mocked(getServiceSupabase).mockReturnValue({ from: () => ({ upsert }) } as never)
    const result = queue().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(250)
    expect(await result).not.toBeInstanceOf(CommentEmailEnqueueRejectedError)
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it('skips processing without provider credentials', async () => {
    await queue()
    vi.stubEnv('RESEND_API_KEY', '')
    await processCommentEmailQueue()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retries only a failed batch after restart, preserving its body and idempotency key', async () => {
    await queue()
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '90' } }))
    await processCommentEmailQueue()
    expect(rows.map((row) => row.status)).toEqual(['sent', 'pending'])
    expect(rows[1].next_attempt_at).toBe(new Date(start + 90_000).toISOString())
    const original = vi.mocked(fetch).mock.calls[1][1]!
    vi.setSystemTime(start + 90_000)
    vi.stubEnv('COMMENT_ACTIVITY_EMAIL_FROM', 'changed@example.com')
    await processCommentEmailQueue()
    expect(rows.map((row) => row.status)).toEqual(['sent', 'sent'])
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(vi.mocked(fetch).mock.calls[2][1]).toMatchObject({ body: original.body, headers: original.headers })
    expect(original.headers).toMatchObject({ 'Idempotency-Key': 'comment-activity/delivery/1' })
  })

  it('does not double-claim under concurrent workers', async () => {
    await enqueueCommentEmail('delivery', ['body'])
    await Promise.all([processCommentEmailQueue(), processCommentEmailQueue()])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(rows[0].status).toBe('sent')
  })

  it('replays the same key after acceptance when saving the checkpoint failed', async () => {
    await enqueueCommentEmail('delivery', ['body'])
    failure = 'checkpoint'
    await expect(processCommentEmailQueue()).rejects.toThrow('checkpoint')
    const first = vi.mocked(fetch).mock.calls[0][1]!
    await processCommentEmailQueue()
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.setSystemTime(start + 120_000)
    await processCommentEmailQueue()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({ body: first.body, headers: first.headers })
  })

  it.each([408, 409, 500, 503])('retries transient HTTP %s', async (status) => {
    await enqueueCommentEmail('delivery', ['body'])
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status }))
    await processCommentEmailQueue()
    expect(rows[0]).toMatchObject({ status: 'pending', last_error: `resend_${status}` })
  })

  it.each([
    ['Wed, 23 Sep 2026 00:02:00 GMT', 120_000], ['nonsense', 30_000], ['-1', 30_000],
  ])('handles Retry-After %s', async (header, delay) => {
    await enqueueCommentEmail('delivery', ['body'])
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': header } }))
    await processCommentEmailQueue()
    expect(rows[0].next_attempt_at).toBe(new Date(start + delay).toISOString())
  })

  it('marks a permanent rejection as failed without exposing response contents', async () => {
    await enqueueCommentEmail('delivery', ['body'])
    vi.mocked(fetch).mockResolvedValueOnce(new Response('private details', { status: 422 }))
    await processCommentEmailQueue()
    expect(rows[0]).toMatchObject({ status: 'failed', last_error: 'resend_422' })
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('private details')
  })

  it.each(['expired', 'exhausted', 'last-attempt', 'late-retry'])('stops safely when %s', async (scenario) => {
    await enqueueCommentEmail('delivery', ['body'])
    if (scenario === 'expired') vi.setSystemTime(start + 20 * 3600_000)
    if (scenario === 'exhausted') rows[0].attempts = 8
    if (scenario === 'last-attempt') rows[0].attempts = 7
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 429,
      headers: scenario === 'late-retry' ? { 'retry-after': '86400' } : {} }))
    await processCommentEmailQueue()
    expect(rows[0].status).toBe('failed')
    if (scenario === 'expired' || scenario === 'exhausted') expect(fetch).not.toHaveBeenCalled()
  })

  it('bounds each invocation and leaves remaining work pending', async () => {
    await queue()
    vi.mocked(fetch).mockImplementationOnce(async () => { vi.setSystemTime(start + 7_000); return new Response('{}') })
    await processCommentEmailQueue()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(rows.map((row) => row.status)).toEqual(['sent', 'pending'])
  })

  it('recovers timeouts with the same idempotency key and clears the timer', async () => {
    await enqueueCommentEmail('delivery', ['body'])
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('timeout')))
    }))
    const processing = processCommentEmailQueue(10)
    await vi.advanceTimersByTimeAsync(10)
    await processing
    expect(rows[0]).toMatchObject({ status: 'pending', last_error: 'network_or_timeout' })
    const first = vi.mocked(fetch).mock.calls[0][1]!
    vi.setSystemTime(start + 60_000)
    await processCommentEmailQueue()
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({ body: first.body, headers: first.headers })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('removes message content after seven days', async () => {
    await queue()
    rows.forEach((row) => { row.status = 'sent' })
    vi.setSystemTime(start + 8 * 24 * 3600_000)
    await processCommentEmailQueue()
    expect(rows).toEqual([])
  })
})
