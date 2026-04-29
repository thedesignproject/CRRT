import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

interface AddProjectPopoverProps {
  onAdd: (name: string) => void
  onClose: () => void
  busy?: boolean
  error?: string | null
}

export function AddProjectPopover({ onAdd, onClose, busy, error }: AddProjectPopoverProps) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-add-project]')) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const canSubmit = !!name.trim() && !busy

  return (
    <div
      data-add-project
      className="absolute top-full left-0 mt-2 w-[260px] rounded-lg border border-border bg-card shadow-xl shadow-black/30 cmd-modal-enter z-50"
    >
      <div className="p-3">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">New project</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) onAdd(name.trim())
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            disabled={busy}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors disabled:opacity-50"
            autoComplete="off"
            spellCheck={false}
          />
          {error && (
            <p className="mt-2 text-[11px] text-status-rejected">{error}</p>
          )}
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-muted-foreground">
              Paste your snippet after creating
            </p>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold transition-all btn-press',
                canSubmit
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
