import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listInvites: vi.fn(),
  listNotifications: vi.fn(),
}))
const realtime = vi.hoisted(() => ({
  handlers: {} as Record<string, (payload: { old?: unknown; new?: unknown }) => void>,
  removeChannel: vi.fn(),
}))

vi.mock('../api', () => ({
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
  listInvites: api.listInvites,
  listNotifications: api.listNotifications,
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}))
vi.mock('../lib/mocks', () => ({ mocksEnabled: false }))
vi.mock('../lib/supabase', () => {
  const channel = {
    on: vi.fn((_type: string, filter: { event: string }, handler: (payload: { old?: unknown; new?: unknown }) => void) => {
      realtime.handlers[filter.event] = handler
      return channel
    }),
    subscribe: vi.fn(() => channel),
  }
  return { supabase: { channel: vi.fn(() => channel), removeChannel: realtime.removeChannel } }
})

import { useNotifications } from './useNotifications'

const notification = {
  id: 'notification-1', userId: 'user-1', kind: 'comment.activity' as const,
  payload: {}, readAt: null, createdAt: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  realtime.handlers = {}
  api.listInvites.mockResolvedValue([])
  api.listNotifications.mockResolvedValue([notification])
})

it('removes realtime-deleted notifications and refreshes when the old row lacks an id', async () => {
  const { result, unmount } = renderHook(() => useNotifications('/api', 'token', 'user-1'))
  await waitFor(() => expect(result.current.notifications).toEqual([notification]))

  act(() => realtime.handlers.DELETE({ old: { id: 'notification-1' } }))
  expect(result.current.notifications).toEqual([])

  api.listNotifications.mockResolvedValueOnce([notification])
  await act(async () => realtime.handlers.DELETE({ old: {} }))
  await waitFor(() => expect(api.listNotifications).toHaveBeenCalledTimes(2))
  expect(result.current.notifications).toEqual([notification])

  unmount()
  expect(realtime.removeChannel).toHaveBeenCalledOnce()
})
