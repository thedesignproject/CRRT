import { useEffect, useRef, useState } from 'react'
import type { ProjectKeyAvailability } from '../api'
import { cn, isValidProjectKey, slugify } from '../lib/utils'
import { CheckIcon, XIcon } from './icons'
import { Spinner } from './primitives'

interface AddProjectPopoverProps {
  onAdd: (projectKey: string, name: string) => void
  onClose: () => void
  checkAvailability: (key: string) => Promise<ProjectKeyAvailability>
  busy?: boolean
  error?: string | null
}

type KeyStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken'

export function AddProjectPopover({ onAdd, onClose, checkAvailability, busy, error }: AddProjectPopoverProps) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [status, setStatus] = useState<KeyStatus>('idle')
  const [suggestion, setSuggestion] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Tracks the latest key we kicked off a check for, so stale responses are ignored.
  const latestKey = useRef('')

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Until the user edits the key by hand, keep it in sync with the name.
  useEffect(() => {
    if (!keyEdited) setKey(slugify(name))
  }, [name, keyEdited])

  // Debounced availability check whenever the key changes.
  useEffect(() => {
    if (!key) {
      setStatus('idle')
      return
    }
    if (!isValidProjectKey(key)) {
      setStatus('invalid')
      return
    }
    setStatus('checking')
    latestKey.current = key
    const timer = setTimeout(async () => {
      try {
        const result = await checkAvailability(key)
        if (latestKey.current !== key) return
        setSuggestion(result.suggestion)
        setStatus(result.available ? 'available' : 'taken')
      } catch {
        if (latestKey.current !== key) return
        setStatus('idle')
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [key, checkAvailability])

  const canSubmit = !!name.trim() && status === 'available' && !busy

  function applySuggestion() {
    setKeyEdited(true)
    setKey(suggestion)
  }

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
            Name your product or app — we'll suggest a public key from the name. Paste the snippet with that key into the host app to start collecting feedback.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) onAdd(key, name.trim())
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

          <label htmlFor="project-key" className="block mt-3 mb-1 text-[11px] font-medium text-muted-foreground">
            Public key
          </label>
          <div className="relative">
            <input
              id="project-key"
              type="text"
              value={key}
              onChange={(e) => { setKeyEdited(true); setKey(e.target.value) }}
              placeholder="acme-marketing-site"
              disabled={busy}
              aria-label="Project public key"
              className="w-full pl-3 pr-9 py-2.5 rounded-md border border-border bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors disabled:opacity-50"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center" aria-hidden="true">
              {status === 'checking' && <Spinner size={14} strokeWidth={3} />}
              {status === 'available' && <span className="text-status-accepted flex"><CheckIcon size={15} /></span>}
              {(status === 'taken' || status === 'invalid') && <span className="text-status-rejected flex"><XIcon size={15} /></span>}
            </span>
          </div>

          <div className="mt-1.5 min-h-[16px] text-[11px]" aria-live="polite">
            {status === 'invalid' && (
              <span className="text-status-rejected">Use lowercase letters, numbers, and single hyphens.</span>
            )}
            {status === 'taken' && (
              <span className="text-status-rejected">
                Taken — try{' '}
                <button type="button" onClick={applySuggestion} className="font-mono underline hover:text-foreground">
                  {suggestion}
                </button>
              </span>
            )}
          </div>

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
