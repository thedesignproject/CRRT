import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAccessReviewLink } from './useAccessReviewLink'
import { dashboardAuthSearch } from '../lib/access-review-link'
import type { Project } from '../api'
afterEach(() => window.history.replaceState({}, '', '/'))
it('preserves only trusted continuation parameters', () => {
  expect(dashboardAuthSearch('?invite=p%2Fa&accessProject=demo&redirect=https://evil.test')).toBe('?invite=p%2Fa&accessProject=demo')
  expect(dashboardAuthSearch('?email=a@b.com')).toBe('')
})
it('waits for projects then opens only an authorized project and consumes the link', async () => {
  window.history.replaceState({}, '', '/?accessProject=p&other=1#hash')
  const open = vi.fn()
  const projects = [{ publicKey: 'p', capabilities: ['project:manage'] }] as Project[]
  const { result, rerender } = renderHook(({ loading, error }) => useAccessReviewLink(projects, loading, error, open), { initialProps: { loading: true, error: null as string | null } })
  expect(open).not.toHaveBeenCalled()
  rerender({ loading: false, error: 'Offline' })
  expect(result.current).toContain('Unable to load')
  rerender({ loading: false, error: null })
  await waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith('p'))
  expect(result.current).toBeNull()
  expect(window.location.search + window.location.hash).toBe('?other=1#hash')
})
it.each([{ projects: [] }, { projects: [{ publicKey: 'p' }] }, { projects: [{ publicKey: 'p', capabilities: [] }] }])('rejects unavailable or unauthorized review targets', async ({ projects }) => {
  window.history.replaceState({}, '', '/?accessProject=p')
  const open = vi.fn()
  const { result } = renderHook(() => useAccessReviewLink(projects as Project[], false, null, open))
  await waitFor(() => expect(result.current).toContain('owner or admin'))
  expect(open).not.toHaveBeenCalled()
})
it('does nothing without a review link', () => {
  const open = vi.fn()
  renderHook(() => useAccessReviewLink([], false, null, open))
  expect(open).not.toHaveBeenCalled()
})
