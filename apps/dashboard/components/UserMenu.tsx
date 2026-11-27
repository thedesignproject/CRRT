import { useKeyboardShortcuts } from '../../../src/lib/useKeyboardShortcuts'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { route } from '../lib/routes'
import { billingAvailabilityOnce } from '../lib/billing-availability'
import type { User } from '@supabase/supabase-js'

interface UserMenuProps {
  apiBase: string
  accessToken: string
  user: User
  onSignOut: () => void
  theme?: 'light' | 'dark'
  toggleTheme?: () => void
  /** Project tools that left the top bar and sidebar. */
  auditHref?: string
  documentsHref?: string
  /** Present only for super admins. */
  onOpenSuperAdmin?: () => void
  /** Renames the workspace shown at the top of the sidebar. */
  workspace?: { name: string | null; onRename: (name: string) => Promise<void> }
}

const itemClass = 'block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-accent transition-colors'
const inputClass = 'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

/** Account menu: everything administrative, so the sidebar and top bar stay about the work. */
export function UserMenu({ user, onSignOut, apiBase, accessToken, theme, toggleTheme, auditHref, documentsHref, onOpenSuperAdmin, workspace }: UserMenuProps) {
  const [shortcutsEnabled, setShortcutsEnabled] = useKeyboardShortcuts('dashboard')
  const [open, setOpen] = useState(false)
  // The draft name while renaming the workspace; null otherwise.
  const [draft, setDraft] = useState<string | null>(null)
  const [renameError, setRenameError] = useState('')
  const [saving, setSaving] = useState(false)
  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setRenameError('')
    try {
      await workspace!.onRename(draft!.trim())
      setDraft(null)
    } catch (error) {
      setRenameError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }
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
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setDraft(null); setRenameError('') }}
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
          {workspace && (draft === null ? (
            <button type="button" onClick={() => setDraft(workspace.name ?? '')} className={itemClass}>Rename workspace</button>
          ) : (
            <form onSubmit={(event) => { void saveName(event) }} className="flex flex-col gap-2 border-b border-border px-3 py-2">
              <label htmlFor="workspace-name" className="text-[11px] text-muted-foreground">Workspace name</label>
              <input id="workspace-name" autoFocus required maxLength={60} value={draft} onChange={(event) => setDraft(event.target.value)} className={inputClass} />
              {renameError && <p role="alert" className="text-xs text-destructive">{renameError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setDraft(null); setRenameError('') }} className="h-7 rounded-md px-2.5 text-xs font-medium text-text-body hover:bg-accent">Cancel</button>
                <button type="submit" disabled={saving || !draft.trim()} className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50">Save</button>
              </div>
            </form>
          ))}
          {auditHref && <a href={auditHref} className={itemClass}>Run audit</a>}
          {documentsHref && <a href={documentsHref} className={itemClass}>Documents</a>}
          <a href={route('/mcp-auth')} className={itemClass}>MCP connections</a>
          {billingEnabled && <a href={route('/billing')} className={itemClass}>Billing</a>}
          {toggleTheme && (
            <button type="button" onClick={() => { toggleTheme(); setOpen(false) }} className={itemClass}>
              {theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            </button>
          )}
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
          {onOpenSuperAdmin && (
            <button type="button" onClick={() => { onOpenSuperAdmin(); setOpen(false) }} className={itemClass}>Super admin</button>
          )}
          <button
            type="button"
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
