import { useEffect, useRef, useState } from 'react'
import type { Notification } from '../api'
import { useNotifications } from '../hooks/useNotifications'
import { cn } from '../lib/utils'
import { BellIcon } from './icons'
import { Spinner } from './primitives'

interface NotificationBellProps {
  apiBase: string
  accessToken: string
  userId: string
  onProjectsChanged: () => void
}

function describe(n: Notification): string {
  const p = n.payload as { projectKey?: string; email?: string }
  const project = p.projectKey ?? 'a project'
  switch (n.kind) {
    case 'invite.received': return `You were invited to ${project}`
    case 'invite.accepted': return `${p.email ?? 'Someone'} joined ${project}`
    case 'invite.declined': return `${p.email ?? 'Someone'} declined your invite to ${project}`
    default: return 'Notification'
  }
}

export function NotificationBell({ apiBase, accessToken, userId, onProjectsChanged }: NotificationBellProps) {
  const { notifications, invites, unreadCount, loading, markRead, markAllRead, accept, decline } =
    useNotifications(apiBase, accessToken, userId, onProjectsChanged)
  const [open, setOpen] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  async function runInvite(action: () => Promise<void>, key: string) {
    setPendingKey(key)
    try { await action() } finally { setPendingKey(null) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        className={cn(
          'relative w-7 h-7 rounded-md flex items-center justify-center transition-colors',
          open ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        )}
      >
        <BellIcon size={15} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-80 rounded-lg border border-border bg-card shadow-2xl shadow-black/50 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-auto">
            {invites.length > 0 && (
              <div className="border-b border-border">
                {invites.map((inv) => (
                  <div key={inv.projectKey} className="px-3 py-2.5">
                    <div className="text-[12px] text-foreground">
                      Invitation to <span className="font-mono">{inv.projectKey}</span>
                      <span className="text-muted-foreground"> · {inv.role}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        onClick={() => runInvite(() => accept(inv.projectKey), inv.projectKey)}
                        disabled={pendingKey === inv.projectKey}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-primary text-primary-foreground hover:opacity-90 btn-press disabled:opacity-50"
                      >
                        {pendingKey === inv.projectKey ? 'Joining…' : 'Accept'}
                      </button>
                      <button
                        onClick={() => runInvite(() => decline(inv.projectKey), inv.projectKey)}
                        disabled={pendingKey === inv.projectKey}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8"><Spinner size={16} /></div>
            ) : notifications.length === 0 && invites.length === 0 ? (
              <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">You're all caught up.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { if (!n.readAt) markRead(n.id) }}
                  className="w-full text-left flex items-start gap-2 px-3 py-2.5 hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                >
                  <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', n.readAt ? 'bg-transparent' : 'bg-primary')} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] text-foreground">{describe(n)}</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
