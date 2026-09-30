import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../lib/widgetLogin', async (importOriginal) => ({ ...await importOriginal<typeof import('../lib/widgetLogin')>(), startWidgetLogin: vi.fn(), widgetComments: vi.fn(() => ({ label: 'mine' })), widgetRequest: vi.fn() }))
import { WidgetRequestError, startWidgetLogin, widgetRequest } from '../lib/widgetLogin'
import { useWidgetLogin } from '../components/FeedbackWidget/useWidgetLogin'
const session = { accessToken: 'token', displayName: 'Ada', expiresAt: '2099-01-01' }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(startWidgetLogin).mockResolvedValue(session); vi.mocked(widgetRequest).mockResolvedValue({} as never) })
it('logs in, exposes the adapter, revokes and clears the session', async () => {
  const { result } = renderHook(() => useWidgetLogin('https://crrt.ai/api', 'p'))
  await act(() => result.current.logout()); expect(widgetRequest).not.toHaveBeenCalled()
  await act(() => result.current.login()); expect(result.current.session).toEqual(session); expect(result.current.comments).toEqual({ label: 'mine' })
  await act(() => result.current.logout()); expect(widgetRequest).toHaveBeenCalledWith('https://crrt.ai/api', '/v1/widget/auth/exchange', session, { method: 'DELETE' }); expect(result.current.session).toBeNull()
})
it('keeps errors visible and does not silently sign out on failed revocation', async () => {
  const { result } = renderHook(() => useWidgetLogin('api', 'p'))
  vi.mocked(startWidgetLogin).mockRejectedValueOnce(new Error('blocked')); await act(() => result.current.login()); expect(result.current.error).toBe('blocked')
  await act(() => result.current.login()); vi.mocked(widgetRequest).mockRejectedValueOnce(new Error('offline')); await act(() => result.current.logout()); expect(result.current.session).toEqual(session); expect(result.current.error).toBe('offline')
})
it('clears an expired session without trying to revoke it', async () => {
  vi.mocked(startWidgetLogin).mockResolvedValue({ ...session, expiresAt: '2000-01-01' })
  const { result } = renderHook(() => useWidgetLogin('api', 'p')); await act(() => result.current.login()); await act(() => result.current.logout()); expect(widgetRequest).not.toHaveBeenCalled(); expect(result.current.session).toBeNull()
})
it('deduplicates attempts and discards a late success after cancellation', async () => {
  let finish!: (value: typeof session) => void
  vi.mocked(startWidgetLogin).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const { result } = renderHook(() => useWidgetLogin('api', 'p'))
  let pending!: Promise<void>
  act(() => { pending = result.current.login() }); await act(() => result.current.login()); expect(startWidgetLogin).toHaveBeenCalledOnce()
  act(() => result.current.cancel()); await act(async () => { finish(session); await pending }); expect(result.current.session).toBeNull(); expect(result.current.busy).toBe(false)
  act(() => result.current.cancel())
})
it('aborts pending attempts on project changes and unmount, ignoring cancellation errors', async () => {
  vi.mocked(startWidgetLogin).mockImplementation((_api, _project, signal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted'))) }))
  const { result, rerender, unmount } = renderHook(({ project }) => useWidgetLogin('api', project), { initialProps: { project: 'a' } })
  let pending!: Promise<void>; act(() => { pending = result.current.login() })
  rerender({ project: 'b' }); await act(() => pending); expect(result.current.error).toBe(''); expect(result.current.busy).toBe(false)
  act(() => { pending = result.current.login() }); unmount(); await pending
})

it('recovers when revocation succeeded but its response was lost', async () => {
  const { result } = renderHook(() => useWidgetLogin('api', 'p'))
  await act(() => result.current.login())
  vi.mocked(widgetRequest).mockRejectedValueOnce(new Error('offline'))
  await act(() => result.current.logout())
  expect(result.current.session).toEqual(session)
  vi.mocked(widgetRequest).mockRejectedValueOnce(new WidgetRequestError(401))
  await act(() => result.current.logout())
  expect(result.current.session).toBeNull()
  expect(result.current.error).toBe('')
})
it('retains the session when revocation is forbidden', async () => {
  const { result } = renderHook(() => useWidgetLogin('api', 'p'))
  await act(() => result.current.login())
  vi.mocked(widgetRequest).mockRejectedValueOnce(new WidgetRequestError(403))
  await act(() => result.current.logout())
  expect(result.current.session).toEqual(session)
  expect(result.current.error).toContain('Could not save')
})
it.each(['success', 'failure'] as const)('ignores a stale logout %s after switching projects and logging in', async (outcome) => {
  let resolve!: (value: Response) => void
  let reject!: (cause: Error) => void
  vi.mocked(widgetRequest).mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no }))
  const { result, rerender } = renderHook(({ project }) => useWidgetLogin('api', project), { initialProps: { project: 'a' } })
  await act(() => result.current.login())
  let pending!: Promise<void>
  act(() => { pending = result.current.logout() })
  rerender({ project: 'b' })
  const next = { ...session, accessToken: 'new-token' }
  vi.mocked(startWidgetLogin).mockResolvedValueOnce(next)
  await act(() => result.current.login())
  await act(async () => { if (outcome === 'success') resolve(new Response()); else reject(new Error('offline')); await pending })
  expect(result.current.session).toEqual(next)
  expect(result.current.error).toBe('')
})
