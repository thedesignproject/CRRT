import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: false, get: vi.fn(), rename: vi.fn() }))
vi.mock('../api', () => ({ getWorkspace: mocks.get, renameWorkspace: mocks.rename }))
vi.mock('../lib/mocks', () => ({ get mocksEnabled() { return mocks.enabled }, MOCK_WORKSPACE_NAME: 'Mock Studio' }))
import { useWorkspace } from './useWorkspace'

beforeEach(() => { mocks.enabled = false; mocks.get.mockReset(); mocks.rename.mockReset() })

it('loads the name and renames the workspace', async () => {
  mocks.get.mockResolvedValue({ name: 'Acme' })
  mocks.rename.mockResolvedValue({ name: 'Acme Studio' })
  const { result } = renderHook(() => useWorkspace('/api', 'token'))
  await waitFor(() => expect(result.current.name).toBe('Acme'))
  expect(mocks.get).toHaveBeenCalledWith('/api', 'token')
  await act(() => result.current.rename('Acme Studio'))
  expect(mocks.rename).toHaveBeenCalledWith('/api', 'token', 'Acme Studio')
  expect(result.current.name).toBe('Acme Studio')
})

it('stays unnamed when loading fails and lets rename errors reach the form', async () => {
  mocks.get.mockRejectedValue(new Error('Offline'))
  mocks.rename.mockRejectedValue(new Error('Too long'))
  const { result } = renderHook(() => useWorkspace('/api', 'token'))
  await waitFor(() => expect(mocks.get).toHaveBeenCalled())
  expect(result.current.name).toBeNull()
  await expect(result.current.rename('x')).rejects.toThrow('Too long')
})

it('ignores a load that finishes after the token changed', async () => {
  let finish: (value: { name: string }) => void = () => {}
  mocks.get.mockReturnValueOnce(new Promise((resolve) => { finish = resolve })).mockResolvedValueOnce({ name: 'New' })
  const { result, rerender } = renderHook(({ token }) => useWorkspace('/api', token), { initialProps: { token: 'a' } })
  rerender({ token: 'b' })
  await waitFor(() => expect(result.current.name).toBe('New'))
  await act(async () => finish({ name: 'Old' }))
  expect(result.current.name).toBe('New')
})

it('uses the mock name and renames locally in preview mode', async () => {
  mocks.enabled = true
  const { result } = renderHook(() => useWorkspace('/api', 'token'))
  expect(result.current.name).toBe('Mock Studio')
  await act(() => result.current.rename('Preview'))
  expect(result.current.name).toBe('Preview')
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.rename).not.toHaveBeenCalled()
})
