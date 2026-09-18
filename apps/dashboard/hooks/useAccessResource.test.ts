import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useAccessResource } from './useAccessResource'
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
it('loads, refreshes on focus and serializes mutations', async () => {
  const load = vi.fn().mockResolvedValue(['one'])
  const { result } = renderHook(() => useAccessResource(load))
  await waitFor(() => expect(result.current.data).toEqual(['one']))
  await act(async () => window.dispatchEvent(new Event('focus')))
  expect(load).toHaveBeenCalledTimes(2)
  const pending = deferred<void>()
  let first!: Promise<boolean>
  act(() => { first = result.current.run(() => pending.promise) })
  expect(result.current.busy).toBe(true)
  const duplicate = vi.fn()
  await act(async () => { expect(await result.current.run(duplicate)).toBe(false) })
  expect(duplicate).not.toHaveBeenCalled()
  await act(async () => { pending.resolve(); expect(await first).toBe(true) })
  expect(load).toHaveBeenCalledTimes(3)
  expect(result.current.busy).toBe(false)
})
it('reports loading and mutation errors including non-Error rejections', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('Load failed')).mockRejectedValueOnce('unknown').mockResolvedValue([])
  const { result } = renderHook(() => useAccessResource(load))
  await waitFor(() => expect(result.current.error).toBe('Load failed'))
  await act(async () => { await result.current.refresh() })
  expect(result.current.error).toBe('Unable to load project access')
  await act(async () => { await result.current.run(async () => { throw new Error('Permission lost') }) })
  expect(result.current.error).toBe('Permission lost')
  await act(async () => { await result.current.run(async () => { throw 'unknown' }) })
  expect(result.current.error).toBe('Unable to update project access')
})
it('ignores out-of-order responses and failures after changing screens', async () => {
  const old = deferred<string>(), next = deferred<string>()
  const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  const { result, rerender } = renderHook(({ loader }) => useAccessResource(loader), { initialProps: { loader: load } })
  act(() => { void result.current.refresh() })
  await act(async () => { next.resolve('latest') })
  await act(async () => { old.resolve('obsolete') })
  expect(result.current.data).toBe('latest')
  const obsolete = deferred<string>()
  load.mockReturnValueOnce(obsolete.promise)
  act(() => { void result.current.refresh() })
  const replacement = vi.fn().mockResolvedValue('new project')
  rerender({ loader: replacement })
  await waitFor(() => expect(result.current.data).toBe('new project'))
  await act(async () => { obsolete.reject(new Error('obsolete')) })
  expect(result.current.error).toBeNull()
})
it('discards successful loads and actions after unmount', async () => {
  const pendingLoad = deferred<string>(), pendingAction = deferred<void>()
  const load = vi.fn().mockReturnValue(pendingLoad.promise)
  const { result, unmount } = renderHook(() => useAccessResource(load))
  let action!: Promise<boolean>
  act(() => { action = result.current.run(() => pendingAction.promise) })
  unmount()
  await act(async () => { pendingLoad.resolve('late'); pendingAction.resolve(); expect(await action).toBe(false) })
  expect(load).toHaveBeenCalledTimes(1)
})
it('ignores rejected actions after unmount and old refresh failures', async () => {
  const old = deferred<string>(), latest = deferred<string>(), action = deferred<void>()
  const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
  const { result, unmount } = renderHook(() => useAccessResource(load))
  act(() => { void result.current.refresh() })
  await act(async () => { old.reject('obsolete'); latest.resolve('current') })
  expect(result.current.error).toBeNull()
  let running!: Promise<boolean>
  act(() => { running = result.current.run(() => action.promise) })
  unmount()
  await act(async () => { action.reject('late'); expect(await running).toBe(false) })
})

it('does not report success when the loader changes during a mutation refresh', async () => {
  const oldRefresh = deferred<string>()
  const load = vi.fn().mockResolvedValueOnce('initial').mockReturnValueOnce(oldRefresh.promise)
  const { result, rerender } = renderHook(({ loader }) => useAccessResource(loader), { initialProps: { loader: load } })
  await waitFor(() => expect(result.current.data).toBe('initial'))
  let running!: Promise<boolean>
  await act(async () => { running = result.current.run(async () => {}); await Promise.resolve() })
  expect(load).toHaveBeenCalledTimes(2)
  rerender({ loader: vi.fn().mockResolvedValue('new token') })
  await waitFor(() => expect(result.current.data).toBe('new token'))
  await act(async () => { oldRefresh.resolve('obsolete'); expect(await running).toBe(false) })
  expect(result.current.data).toBe('new token')
})
