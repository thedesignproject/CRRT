import type { ReactNode } from 'react'
import { XIcon } from './icons'

export function BulkActionBar({ selectedCount, busy = false, onClose, children }: {
  selectedCount: number
  busy?: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (selectedCount < 1) return null
  const noun = selectedCount === 1 ? 'item' : 'items'
  return (
    <div className="dashboard-bulk-bar" role="toolbar" aria-label={`Bulk actions for ${selectedCount} selected ${noun}`}>
      <span className="dashboard-bulk-count" aria-live="polite">{selectedCount} selected</span>
      <span className="dashboard-bulk-divider" aria-hidden="true" />
      <div className="dashboard-bulk-actions">{children}</div>
      <button type="button" className="dashboard-bulk-close" onClick={onClose} disabled={busy} aria-label="Clear selection">
        <XIcon size={17} />
      </button>
    </div>
  )
}

export function BulkDeleteDialog({ selectedCount, busy, onCancel, onConfirm }: {
  selectedCount: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel()
    }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="bulk-delete-title" aria-describedby="bulk-delete-description"
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl">
        <h2 id="bulk-delete-title" className="text-base font-semibold text-foreground">Delete selected feedback?</h2>
        <p id="bulk-delete-description" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This permanently deletes {selectedCount} Inbox item{selectedCount === 1 ? '' : 's'} and their screenshots.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus disabled={busy} onClick={onCancel}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-40">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm}
            className="rounded-lg bg-status-rejected px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
            {busy ? 'Deleting…' : `Delete ${selectedCount}`}
          </button>
        </div>
      </div>
    </div>
  )
}
