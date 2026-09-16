import { afterEach, describe, expect, it, vi } from 'vitest'
import { reserveExtensionComment } from './extension-comment-limit'

// In-memory PostgREST model: reads snapshot state, guarded updates are atomic.
function ledger() {
  const rows = new Map<string, { version: string; attempts: string[] }>()
  const faults = { init: false, read: false, update: false, contention: false }
  const client = { from: vi.fn((table: string) => {
    expect(table).toBe('extension_comment_limits')
    let userId = '', version = '', patch: { version: string; attempts: string[] } | undefined
    const query = {
      async upsert(input: { user_id: string }, options: unknown) {
        expect(options).toEqual({ onConflict: 'user_id', ignoreDuplicates: true })
        if (faults.init) return { error: { message: 'init failed' } }
        if (!rows.has(input.user_id)) rows.set(input.user_id, { version: crypto.randomUUID(), attempts: [] })
        return { error: null }
      },
      select() { return query },
      eq(column: string, value: string) { if (column === 'user_id') userId = value; else version = value; return query },
      update(value: NonNullable<typeof patch>) { patch = value; return query },
      async single() {
        return faults.read ? { error: { message: 'read failed' } } : { data: structuredClone(rows.get(userId)), error: null }
      },
      async maybeSingle() {
        if (faults.update) return { error: { message: 'update failed' } }
        if (faults.contention || rows.get(userId)?.version !== version) return { data: null, error: null }
        rows.set(userId, patch!)
        return { data: { user_id: userId }, error: null }
      },
    }
    return query
  }) }
  return { rows, faults, client: client as never }
}

afterEach(() => vi.useRealTimers())

describe('durable extension create limit', () => {
  it('allows exactly 30 concurrent reservations and isolates users', async () => {
    const { client, rows } = ledger()
    const allowed = await Promise.all(Array.from({ length: 40 }, () => reserveExtensionComment(client, 'user')))
    expect(allowed.filter(Boolean)).toHaveLength(30)
    expect(rows.get('user')?.attempts).toHaveLength(30)
    // Deleting comments cannot refund quota: this ledger has no comments dependency.
    expect(await reserveExtensionComment(client, 'user')).toBe(false)
    expect(await reserveExtensionComment(client, 'other')).toBe(true)
  })

  it('expires reservations only after a full rolling hour', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-03T10:00:00Z'))
    const { client, rows } = ledger()
    for (let i = 0; i < 30; i++) expect(await reserveExtensionComment(client, 'user')).toBe(true)
    vi.setSystemTime(new Date('2026-09-03T10:59:59Z'))
    expect(await reserveExtensionComment(client, 'user')).toBe(false)
    vi.setSystemTime(new Date('2026-09-03T11:00:00Z'))
    expect(await reserveExtensionComment(client, 'user')).toBe(true)
    expect(rows.get('user')?.attempts).toEqual(['2026-09-03T11:00:00.000Z'])
  })

  it('fails closed on database errors and bounded contention', async () => {
    for (const fault of ['init', 'read', 'update'] as const) {
      const { client, faults } = ledger(); faults[fault] = true
      await expect(reserveExtensionComment(client, 'user')).rejects.toThrow(`${fault} failed`)
    }
    const { client, faults, rows } = ledger(); faults.contention = true
    expect(await reserveExtensionComment(client, 'user')).toBe(false)
    expect(rows.get('user')?.attempts).toEqual([])
  })
})
