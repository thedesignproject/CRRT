import { useKeyboardShortcuts } from '../../../src/lib/useKeyboardShortcuts'
import { useEffect, useRef, useState } from 'react'
import { route } from '../lib/routes'
import { billingAvailabilityOnce } from '../lib/billing-availability'
import type { User } from '@supabase/supabase-js'

interface UserMenuProps {
  apiBase: string
  accessToken: string
  user: User
  onSignOut: () => void
}

export function UserMenu({ user, onSignOut, apiBase, accessToken }: UserMenuProps) {
  const [shortcutsEnabled, setShortcutsEnabled] = useKeyboardShortcuts('dashboard')
  const [open, setOpen] = useState(false)
  const [billingEnabled, setBillingEnabled] = useState(false)
  useEffect(() => {
    let active = true
    setBillingEnabled(false)
    void billingAvailabilityOnce(apiBase, user.id, accessToken)
      .then(enabled => { if (active) setBillingEnabled(enabled) })
    return () => { active = false }
  }, [apiBase, user.id, accessToken])
  const ref = useRef<HTMLDivElement | null>(null)
  const initials = (user.email ?? '??').slice(0, 2).toUpperCase()

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
        title={user.email ?? ''}
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-9 w-56 rounded-md border border-border bg-card shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[11px] text-muted-foreground">Signed in as</div>
            <div className="text-xs font-medium text-foreground truncate">{user.email}</div>
          </div>
          <a href={route('/mcp-auth')} className="block px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors">MCP connections</a>
          {billingEnabled && <a href={route('/billing')} className="block px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors">Billing</a>}
          <button
            type="button"
            role="switch"
            aria-checked={shortcutsEnabled}
            aria-label="Keyboard shortcuts"
            title="Remembered in this browser. Escape still closes or cancels."
            onClick={() => setShortcutsEnabled(!shortcutsEnabled)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
          >
            <span>Keyboard shortcuts</span><span>{shortcutsEnabled ? 'On' : 'Off'}</span>
          </button>
          <button
            onClick={onSignOut}
            className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
