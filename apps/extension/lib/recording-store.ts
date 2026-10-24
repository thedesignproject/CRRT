import type { LocalRecording } from './recording'

const DATABASE = 'crrt-record-demo'
const STORE = 'recordings'
const VERSION = 1
const memory = new Map<string, LocalRecording>()

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open local recordings.'))
    request.onsuccess = () => resolve(request.result)
  })
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = operation(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local recording storage failed.'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error ?? new Error('Local recording storage failed.'))
  })
}

export function saveLocalRecording(recording: LocalRecording) {
  if (!hasIndexedDb()) { memory.set(recording.id, recording); return Promise.resolve(recording.id) }
  return transaction('readwrite', (store) => store.put(recording))
}

export function getLocalRecording(id: string) {
  if (!hasIndexedDb()) return Promise.resolve(memory.get(id))
  return transaction<LocalRecording | undefined>('readonly', (store) => store.get(id))
}

export async function listLocalRecordings() {
  const recordings = hasIndexedDb()
    ? await transaction<LocalRecording[]>('readonly', (store) => store.getAll())
    : [...memory.values()]
  return recordings.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function deleteLocalRecording(id: string) {
  if (!hasIndexedDb()) { memory.delete(id); return Promise.resolve(undefined) }
  return transaction('readwrite', (store) => store.delete(id))
}
