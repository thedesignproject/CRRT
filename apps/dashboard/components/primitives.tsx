import { useKeyboardShortcuts } from '../../../src/lib/useKeyboardShortcuts'
import { cn } from '../lib/utils'
import { getDisplayStatus } from '../lib/comment'
import { DISPLAY_STATUS_LABELS, type Comment, type DisplayStatus } from '../lib/types'
import { StatusChip, type CommentStatus } from '@crrt/ui/crrt'

export function Spinner({ size = 20, strokeWidth = 2.5, className = 'text-muted-foreground' }: {
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('animate-spin', className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] px-1 py-0.5 rounded border border-border bg-muted text-[9px] font-mono font-semibold text-muted-foreground">
      {children}
    </kbd>
  )
}

/** Studio lifecycle status for each feedback state; rejected has no Studio chip yet. */
export const STUDIO_STATUS: Record<Exclude<DisplayStatus, 'rejected'>, CommentStatus> = {
  open: 'open',
  ready: 'agent',
  ready_for_testing: 'testing',
  done: 'fixed',
}

export function StatusBadge({ comment, className }: { comment: Comment; className?: string }) {
  const ds = getDisplayStatus(comment)
  if (ds === 'rejected') {
    return <span className={cn('inline-flex h-5 items-center rounded-md bg-status-rejected-bg px-1.5 text-xs font-medium text-status-rejected', className)}>{DISPLAY_STATUS_LABELS.rejected}</span>
  }
  // Only a claimed comment has an agent on it right now; a queued one stays still.
  return <StatusChip status={STUDIO_STATUS[ds]} working={Boolean(comment.claimedByAgentId)} className={className} />
}

export function ActionBtn({ children, variant, active, onClick, shortcut, disabled }: {
  children: React.ReactNode
  variant: 'accept' | 'reject' | 'neutral' | 'done'
  active?: boolean
  onClick?: () => void
  shortcut?: string
  disabled?: boolean
}) {
  const [shortcutsEnabled] = useKeyboardShortcuts('dashboard')
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcutsEnabled ? shortcut : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
        'disabled:opacity-40 disabled:pointer-events-none btn-press',
        variant === 'accept' && (active
          ? 'bg-status-accepted-bg text-status-accepted border border-status-accepted/30'
          : 'border border-border bg-card text-foreground hover:bg-status-accepted-bg hover:text-status-accepted hover:border-status-accepted/30'
        ),
        variant === 'reject' && (active
          ? 'bg-status-rejected-bg text-status-rejected border border-status-rejected/30'
          : 'border border-border bg-card text-foreground hover:bg-status-rejected-bg hover:text-status-rejected hover:border-status-rejected/30'
        ),
        variant === 'done' && (active
          ? 'bg-status-done-bg text-status-done border border-status-done/30'
          : 'border border-border bg-card text-foreground hover:bg-status-done-bg hover:text-status-done hover:border-status-done/30'
        ),
        variant === 'neutral' && 'border border-border bg-card text-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}
