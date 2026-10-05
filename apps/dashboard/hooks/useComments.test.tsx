import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFlags = vi.hoisted(() => ({ mocksEnabled: false }))
vi.mock('../lib/mocks', () => ({
  get mocksEnabled() { return mockFlags.mocksEnabled },
  getMockComments: vi.fn(() => []),
}))
vi.mock('../api', () => ({ listComments: vi.fn() }))

import { listComments, type CommentRecord } from '../api'
import { useComments } from './useComments'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const comment = (body: string) => ({ id: body, body }) as CommentRecord

const linkedComment = (lifecycleStatus: 'closing' | 'closed') => ({
  ...comment('linked'),
  externalWork: [{ provider: 'linear', lifecycleStatus }],
}) as CommentRecord

beforeEach(() => {
  mockFlags.mocksEnabled = false
  vi.mocked(listComments).mockReset()
})

describe('useComments refresh ordering', () => {
  it('polls closing external work without showing a loading state and stops when it is terminal', async () => {
    vi.useFakeTimers()
    try {
      const terminal = deferred<CommentRecord[]>()
      vi.mocked(listComments)
        .mockResolvedValueOnce([linkedComment('closing')])
        .mockReturnValueOnce(terminal.promise)
      const { result } = renderHook(() => useComments('/api', 'token', 'project'))
      await act(async () => {})
      expect(result.current.comments[0]?.externalWork?.[0]?.lifecycleStatus).toBe('closing')

      await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
      expect(listComments).toHaveBeenCalledTimes(2)
      expect(result.current.loading).toBe(false)

      terminal.resolve([linkedComment('closed')])
      await act(async () => { await terminal.promise })
      expect(result.current.comments[0]?.externalWork?.[0]?.lifecycleStatus).toBe('closed')
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
      expect(listComments).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a scheduled lifecycle poll when the project changes', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(listComments)
        .mockResolvedValueOnce([linkedComment('closing')])
        .mockResolvedValueOnce([comment('other')])
      const view = renderHook(({ project }) => useComments('/api', 'token', project), {
        initialProps: { project: 'first' },
      })
      await act(async () => {})
      view.rerender({ project: 'second' })
      await act(async () => {})
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
      expect(listComments).toHaveBeenCalledTimes(2)
      expect(view.result.current.comments[0]?.body).toBe('other')
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops an older response for the same project', async () => {
    const first = deferred<CommentRecord[]>()
    const second = deferred<CommentRecord[]>()
    vi.mocked(listComments)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useComments('/api', 'token', 'project'))
    await waitFor(() => expect(listComments).toHaveBeenCalledTimes(1))
    let refresh!: Promise<void>
    act(() => { refresh = result.current.refresh() })
    await waitFor(() => expect(listComments).toHaveBeenCalledTimes(2))

    second.resolve([comment('new')])
    await act(async () => refresh)
    expect(result.current.comments[0]?.body).toBe('new')
    first.resolve([comment('old')])
    await act(async () => first.promise)
    expect(result.current.comments[0]?.body).toBe('new')
  })

  it('drops an older failure and retains the latest successful state', async () => {
    const first = deferred<CommentRecord[]>()
    vi.mocked(listComments)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([comment('new')])
    const { result } = renderHook(() => useComments('/api', 'token', 'project'))
    await waitFor(() => expect(listComments).toHaveBeenCalledTimes(1))
    await act(() => result.current.refresh())
    first.reject(new Error('old failure'))
    await act(async () => { await first.promise.catch(() => undefined) })
    expect(result.current.error).toBeNull()
    expect(result.current.comments[0]?.body).toBe('new')
    expect(result.current.loading).toBe(false)
  })

  it('reports the current failure and ignores a failure from another project', async () => {
    vi.mocked(listComments).mockRejectedValueOnce('opaque failure')
    const first = renderHook(() => useComments('/api', 'token', 'project'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.error).toBe('Failed to load comments')
    first.unmount()

    const pending = deferred<CommentRecord[]>()
    vi.mocked(listComments)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([comment('other')])
    const second = renderHook(({ project }) => useComments('/api', 'token', project), {
      initialProps: { project: 'first' },
    })
    await waitFor(() => expect(listComments).toHaveBeenCalledTimes(2))
    second.rerender({ project: 'second' })
    await waitFor(() => expect(second.result.current.comments[0]?.body).toBe('other'))
    pending.reject(new Error('old project failure'))
    await act(async () => { await pending.promise.catch(() => undefined) })
    expect(second.result.current.error).toBeNull()
  })
})

it('clears previously loaded private comments when focus revalidation denies access', async () => {
  vi.mocked(listComments).mockResolvedValueOnce([comment('private')]).mockRejectedValueOnce(Object.assign(new Error('Forbidden'),{status:403}))
  const {result}=renderHook(()=>useComments('/api','token','project'))
  await waitFor(()=>expect(result.current.comments).toHaveLength(1))
  await act(async()=>window.dispatchEvent(new Event('focus')))
  await waitFor(()=>expect(result.current.comments).toEqual([]))
  expect(result.current.commentsProjectId).toBeNull()
  expect(result.current.error).toBe('Forbidden')
})

it('revalidates on visible tabs, ignores hidden transitions, and removes listeners on unmount', async () => {
  vi.mocked(listComments).mockResolvedValue([comment('private')])
  const {result,unmount}=renderHook(()=>useComments('/api','token','project'))
  await waitFor(()=>expect(result.current.comments).toHaveLength(1))
  const before=listComments.mock.calls.length
  const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden')
  await act(async()=>document.dispatchEvent(new Event('visibilitychange')))
  expect(listComments).toHaveBeenCalledTimes(before)
  visibility.mockReturnValue('visible')
  vi.mocked(listComments).mockRejectedValueOnce(Object.assign(new Error('Expired'),{status:401}))
  await act(async()=>document.dispatchEvent(new Event('visibilitychange')))
  expect(result.current.comments).toEqual([])
  expect(result.current.error).toBe('Expired')
  const after=listComments.mock.calls.length
  unmount()
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
  expect(listComments).toHaveBeenCalledTimes(after)
  visibility.mockRestore()
})
