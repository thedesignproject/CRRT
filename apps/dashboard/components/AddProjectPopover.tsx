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

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const canSubmit = !!name.trim() && !busy

  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-[18vh] px-4" role="dialog" aria-modal="true" aria-labelledby="add-project-title">
      <button
        type="button"
        aria-label="Close create project"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm cmd-backdrop-enter"
        onClick={onClose}
      />
      <div className="relative w-full max-w-[440px] h-fit rounded-xl border border-border bg-card shadow-2xl shadow-black/60 overflow-hidden cmd-modal-enter">
        <div className="px-5 pt-5 pb-2">
          <h2 id="add-project-title" className="text-base font-bold text-foreground tracking-tight">
            Create a project
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
            Name your product or app. We'll give you a public key after you save — paste the snippet into the host app to start collecting feedback.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) onAdd(name.trim())
          }}
          className="px-5 pb-5"
        >
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Marketing Site"
            disabled={busy}
            aria-label="Project name"
            className="w-full px-3 py-2.5 mt-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors disabled:opacity-50"
            autoComplete="off"
            spellCheck={false}
          />
          {error && (
            <p className="mt-2 text-[11px] text-status-rejected" role="alert" aria-live="polite">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                'px-4 py-2 rounded-md text-xs font-semibold transition-all btn-press',
                canSubmit
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              {busy ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
