import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), mocksEnabled: false }))
vi.mock('../api', () => ({ getStorybookIntegration: mocks.get }))
vi.mock('../lib/mocks', () => ({ get mocksEnabled() { return mocks.mocksEnabled } }))
import { useStorybookConnected } from './useStorybookConnected'

beforeEach(() => { mocks.get.mockReset(); mocks.mocksEnabled = false })

describe('useStorybookConnected', () => {
  it('reports whether the project has a connected Storybook', async () => {
    mocks.get.mockResolvedValueOnce({ state: 'connected' }).mockResolvedValueOnce({ state: 'waiting' })
    const { result, rerender } = renderHook(({ key }) => useStorybookConnected('/api', 'token', key, true), { initialProps: { key: 'a' } })
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe(true))
    expect(mocks.get).toHaveBeenCalledWith('/api', 'token', 'a')
    rerender({ key: 'b' })
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('stays unknown when disabled, without a project, in mock mode, or when the check fails', async () => {
    renderHook(() => useStorybookConnected('/api', 'token', 'a', false))
    renderHook(() => useStorybookConnected('/api', 'token', '', true))
    mocks.mocksEnabled = true
    renderHook(() => useStorybookConnected('/api', 'token', 'a', true))
    expect(mocks.get).not.toHaveBeenCalled()

    mocks.mocksEnabled = false
    mocks.get.mockRejectedValue(new Error('offline'))
    const failed = renderHook(() => useStorybookConnected('/api', 'token', 'a', true))
    await waitFor(() => expect(mocks.get).toHaveBeenCalled())
    await Promise.resolve()
    expect(failed.result.current).toBeNull()
  })

  it('ignores an answer that arrives after unmount', async () => {
    let resolve!: (value: { state: string }) => void
    mocks.get.mockReturnValue(new Promise((r) => { resolve = r }))
    const { result, unmount } = renderHook(() => useStorybookConnected('/api', 'token', 'a', true))
    unmount()
    resolve({ state: 'connected' })
    await Promise.resolve()
    expect(result.current).toBeNull()
  })
})
