import { beforeEach, expect, it, vi } from 'vitest'
import type { LocalRecording } from './recording'

const rows = new Map<string, unknown>()
let openFailure = false
let requestFailure = false
let transactionFailure = false

function request(result?: unknown, error?: Error) {
  const value: Record<string, unknown> = { result, error: error ?? null, onsuccess: null, onerror: null }
  queueMicrotask(() => {
    const handler = error ? value.onerror : value.onsuccess
    if (typeof handler === 'function') handler({})
  })
  return value
}

const objectStore = {
  put(value: { id: string }) { if (!requestFailure) rows.set(value.id, value); return request(value.id, requestFailure ? new Error('put failed') : undefined) },
  get(id: string) { return request(rows.get(id), requestFailure ? new Error('get failed') : undefined) },
  getAll() { return request([...rows.values()], requestFailure ? new Error('list failed') : undefined) },
  delete(id: string) { if (!requestFailure) rows.delete(id); return request(undefined, requestFailure ? new Error('delete failed') : undefined) },
}

const database = {
  objectStoreNames: { contains: vi.fn(() => false) },
  createObjectStore: vi.fn(), close: vi.fn(),
  transaction: vi.fn(() => {
    const tx: Record<string, unknown> = { objectStore: () => objectStore, oncomplete: null, onerror: null, error: new Error('transaction failed') }
    queueMicrotask(() => {
      const handler = transactionFailure ? tx.onerror : tx.oncomplete
      if (typeof handler === 'function') handler({})
    })
    return tx
  }),
}

beforeEach(() => {
  vi.resetModules(); rows.clear(); openFailure = false; requestFailure = false; transactionFailure = false
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open: vi.fn(() => {
      const opened: Record<string, unknown> = { result: database, error: openFailure ? new Error('open failed') : null, onupgradeneeded: null, onsuccess: null, onerror: null }
      queueMicrotask(() => {
        if (openFailure) (opened.onerror as (() => void) | null)?.()
        else { (opened.onupgradeneeded as (() => void) | null)?.(); (opened.onsuccess as (() => void) | null)?.() }
      })
      return opened
    }),
  } })
})

it('persists recordings through IndexedDB and creates the object store on upgrade', async () => {
  const store = await import('./recording-store')
  const older: LocalRecording = { id: 'older', title: 'Older', source: 'tab', status: 'ready', durationMs: 1, createdAt: '2026-10-23', authorName: 'Tomás', marks: [], transcript: [], transcriptionStatus: 'ready' }
  const newer = { ...older, id: 'newer', title: 'Newer', createdAt: '2026-10-24' }
  await store.saveLocalRecording(older)
  await store.saveLocalRecording(newer)
  expect(database.createObjectStore).toHaveBeenCalledWith('recordings', { keyPath: 'id' })
  expect((await store.listLocalRecordings()).map((item) => item.id)).toEqual(['newer', 'older'])
  expect((await store.getLocalRecording('older'))?.title).toBe('Older')
  await store.deleteLocalRecording('older')
  expect(await store.getLocalRecording('older')).toBeUndefined()
})

it('reports database, request, and transaction failures', async () => {
  const store = await import('./recording-store')
  openFailure = true
  await expect(store.getLocalRecording('x')).rejects.toThrow('open failed')
  openFailure = false; requestFailure = true
  await expect(store.getLocalRecording('x')).rejects.toThrow('get failed')
  requestFailure = false; transactionFailure = true
  await expect(store.getLocalRecording('x')).rejects.toThrow('transaction failed')
})
