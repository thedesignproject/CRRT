import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useProjectGate } from './useProjectGate'

afterEach(() => vi.unstubAllGlobals())

it('reads the plan and trial hints once billing answers', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true, trialAvailable: true, planRequired: true }) })))
  const { result } = renderHook(() => useProjectGate('/api', 'gate-user-1', 'session'))
  expect(result.current).toEqual({ planRequired: false, trialAvailable: false })
  await waitFor(() => expect(result.current).toEqual({ planRequired: true, trialAvailable: true }))
})

it('ignores billing hints when billing is off and after unmounting', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false, trialAvailable: true, planRequired: true }) })))
  const { result } = renderHook(() => useProjectGate('/api', 'gate-user-2', 'session'))
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(result.current).toEqual({ planRequired: false, trialAvailable: false })
  let resolve!: (value: unknown) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise((done) => { resolve = done })))
  const late = renderHook(() => useProjectGate('/api', 'gate-user-3', 'session'))
  late.unmount()
  resolve({ ok: true, json: async () => ({ enabled: true, planRequired: true }) })
  await Promise.resolve()
  expect(late.result.current).toEqual({ planRequired: false, trialAvailable: false })
})
