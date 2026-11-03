import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  configured: true, identify: vi.fn(), reset: vi.fn(), unsubscribe: vi.fn(),
  getSession: vi.fn(), listener: null as null | ((event: string, next: any) => void),
}))
vi.mock('../../posthog', () => ({
  get isPostHogConfigured() { return mocks.configured },
  default: { identify: mocks.identify, reset: mocks.reset },
}))
vi.mock('../lib/mocks', () => ({ mocksEnabled: false }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: {
  getSession: mocks.getSession,
  onAuthStateChange: (fn: typeof mocks.listener) => {
    mocks.listener = fn
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
  },
  signOut: vi.fn(),
} } }))
import { useAuth } from './useAuth'
const session = (id: string, email?: string) => ({ user: { id, email }, access_token: 'token' })
beforeEach(() => { vi.clearAllMocks(); mocks.configured = true; mocks.getSession.mockResolvedValue({ data: { session: session('one', 'one@example.com') } }) })
afterEach(cleanup)
it('identifies once per user, resets on account switch and sign-out, and unsubscribes', async () => {
  const view = renderHook(useAuth)
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  expect(mocks.identify).toHaveBeenCalledWith('one', { email: 'one@example.com' })
  act(() => mocks.listener!('TOKEN_REFRESHED', session('one')))
  expect(mocks.identify).toHaveBeenCalledTimes(1)
  act(() => mocks.listener!('SIGNED_IN', session('two')))
  expect(mocks.reset).toHaveBeenCalledTimes(1)
  expect(mocks.identify).toHaveBeenLastCalledWith('two', undefined)
  act(() => mocks.listener!('SIGNED_OUT', null))
  expect(mocks.reset).toHaveBeenCalledTimes(2)
  expect(view.result.current.user).toBeNull()
  act(() => mocks.listener!('INITIAL_SESSION', null))
  view.unmount()
  expect(mocks.unsubscribe).toHaveBeenCalledOnce()
})
it('keeps authentication working when analytics is not configured', async () => {
  mocks.configured = false
  const view = renderHook(useAuth)
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  expect(view.result.current.user?.id).toBe('one')
  act(() => mocks.listener!('SIGNED_OUT', null))
  expect(mocks.identify).not.toHaveBeenCalled()
  expect(mocks.reset).not.toHaveBeenCalled()
})
