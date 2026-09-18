import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NotificationBell } from './NotificationBell'
import { useNotifications } from '../hooks/useNotifications'
import type { Notification } from '../api'
vi.mock('../hooks/useNotifications', () => ({ useNotifications: vi.fn() }))
vi.mock('../lib/routes', () => ({ route: (path: string) => `/dashboard${path}` }))
const markRead = vi.fn(), refresh = vi.fn()
const request: Notification = { userId: 'owner', id: 'request', kind: 'project.access_requested', payload: { projectKey: 'project/a', projectName: 'Demo', email: 'user@company.test' }, readAt: null, createdAt: '2026-09-17T00:00:00Z' }
function view(notifications: Notification[]) {
  vi.mocked(useNotifications).mockReturnValue({ notifications, invites: [], unreadCount: notifications.length, loading: false,
    refresh, markRead, markAllRead: vi.fn(), accept: vi.fn(), decline: vi.fn() })
  render(<NotificationBell apiBase="/api" accessToken="token" userId="owner" onProjectsChanged={vi.fn()} onOpenCommentActivity={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }))
}
beforeEach(() => { vi.clearAllMocks(); markRead.mockResolvedValue(undefined); vi.spyOn(window.location, 'assign').mockImplementation(() => {}) })
afterEach(() => vi.restoreAllMocks())
it('refreshes when opened and opens the base-aware authenticated review after marking read', async () => {
  view([request])
  expect(refresh).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: /user@company.test requested access to Demo/ }))
  await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('/dashboard/?accessProject=project%2Fa'))
  expect(markRead).toHaveBeenCalledWith('request')
  expect(markRead.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(window.location.assign).mock.invocationCallOrder[0])
  fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }))
  expect(refresh).toHaveBeenCalledTimes(1)
})
it('handles older or malformed notifications without navigating to an arbitrary destination', async () => {
  view([
    { ...request, id: 'missing', payload: {}, readAt: 'read' },
    { ...request, id: 'empty', payload: { projectKey: '', email: 'empty' }, readAt: 'read' },
    { ...request, id: 'key', payload: { projectKey: 'p' }, readAt: 'read' },
    { ...request, id: 'comment', kind: 'comment.activity', payload: {} },
  ])
  fireEvent.click(screen.getByRole('button', { name: /Someone requested access to a project/ }))
  fireEvent.click(screen.getByRole('button', { name: /empty requested access to/ }))
  expect(window.location.assign).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Someone requested access to p / }))
  expect(window.location.assign).toHaveBeenCalledWith('/dashboard/?accessProject=p')
  expect(markRead).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /1 new CRRT/ }))
  await waitFor(() => expect(markRead).toHaveBeenCalledWith('comment'))
})
