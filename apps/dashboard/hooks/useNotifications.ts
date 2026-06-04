import { useCallback, useEffect, useState } from 'react'
import {
  acceptInvite as apiAccept,
  declineInvite as apiDecline,
  listInvites,
  listNotifications,
  markAllNotificationsRead as apiMarkAll,
  markNotificationRead as apiMarkRead,
  type Notification,
  type ProjectInvite,
} from '../api'
import { supabase } from '../lib/supabase'
import { mocksEnabled } from '../lib/mocks'

export interface UseNotificationsResult {
  notifications: Notification[]
  invites: ProjectInvite[]
  unreadCount: number
  loading: boolean
  refresh: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  accept: (projectKey: string) => Promise<void>
  decline: (projectKey: string) => Promise<void>
}

type NotificationRow = {
  id: string
  user_id: string
  kind: Notification['kind']
  payload: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

/**
 * Loads the current user's notifications + pending invites, and live-appends
 * new notifications via a Supabase realtime subscription scoped to this user.
 * Accept/decline mutate the invite and bubble up via `onProjectsChanged` so a
 * newly-joined project shows up in the tab bar.
 */
export function useNotifications(
  apiBase: string,
  accessToken: string,
  userId: string,
  onProjectsChanged?: () => void,
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [invites, setInvites] = useState<ProjectInvite[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    if (mocksEnabled) {
      setNotifications([])
      setInvites([])
      setLoading(false)
      return
    }
    try {
      const [n, i] = await Promise.all([
        listNotifications(apiBase, accessToken),
        listInvites(apiBase, accessToken).catch(() => [] as ProjectInvite[]),
      ])
      setNotifications(n)
      setInvites(i)
    } catch {
      /* leave prior state; surfaced elsewhere */
    } finally {
      setLoading(false)
    }
  }, [apiBase, accessToken])

  useEffect(() => { refresh() }, [refresh])

  // Live-append inserts for this user. Falls back silently to the polled list
  // above if realtime isn't available.
  useEffect(() => {
    if (mocksEnabled || !userId) return
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow
          const next: Notification = {
            id: row.id,
            userId: row.user_id,
            kind: row.kind,
            payload: row.payload ?? {},
            readAt: row.read_at,
            createdAt: row.created_at,
          }
          setNotifications((prev) => (prev.some((p) => p.id === next.id) ? prev : [next, ...prev]))
          // An incoming invite notification may mean a new pending invite.
          if (next.kind === 'invite.received') refresh()
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, refresh])

  const unreadCount = notifications.filter((n) => !n.readAt).length

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)))
    try { await apiMarkRead(apiBase, accessToken, id) } catch { await refresh() }
  }, [apiBase, accessToken, refresh])

  const markAllRead = useCallback(async () => {
    const ts = new Date().toISOString()
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: ts })))
    try { await apiMarkAll(apiBase, accessToken) } catch { await refresh() }
  }, [apiBase, accessToken, refresh])

  const accept = useCallback(async (projectKey: string) => {
    await apiAccept(apiBase, accessToken, projectKey)
    onProjectsChanged?.()
    await refresh()
  }, [apiBase, accessToken, onProjectsChanged, refresh])

  const decline = useCallback(async (projectKey: string) => {
    await apiDecline(apiBase, accessToken, projectKey)
    await refresh()
  }, [apiBase, accessToken, refresh])

  return { notifications, invites, unreadCount, loading, refresh, markRead, markAllRead, accept, decline }
}
