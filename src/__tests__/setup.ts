import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// happy-dom's localStorage is broken when --localstorage-file has no valid
// path (a vitest worker-spawn quirk). Patch it with a Map-backed shim.
function makeStorageShim(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    key(i: number) { return [...store.keys()][i] ?? null },
    getItem(k: string) { return store.has(k) ? store.get(k)! : null },
    setItem(k: string, v: string) { store.set(k, String(v)) },
    removeItem(k: string) { store.delete(k) },
    clear() { store.clear() },
  } as Storage
}

beforeEach(() => {
  if (typeof window.localStorage?.getItem !== 'function') {
    Object.defineProperty(window, 'localStorage', {
      value: makeStorageShim(),
      writable: true,
      configurable: true,
    })
  } else {
    window.localStorage.clear()
  }
})

// Unmount React trees between tests so state and window listeners don't leak.
// Without this, the widget's window click handler stacks across tests, a later
// dispatched click fires multiple handlers, and sidebars from prior tests
// remain visible in the DOM under query.
afterEach(() => {
  cleanup()
})
