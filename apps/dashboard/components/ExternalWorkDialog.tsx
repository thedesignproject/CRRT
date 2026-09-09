import { useState } from 'react'
import type { ExternalWorkProvider } from '../api'

export function ExternalWorkDialog({
  provider,
  destination,
  initialDraft,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  provider: ExternalWorkProvider
  destination: string
  initialDraft: { title: string; body: string }
  busy: boolean
  error: string | null
  onCancel(): void
  onSubmit(draft: { title: string; body: string }): void
}) {
  const [title, setTitle] = useState(initialDraft.title)
  const [body, setBody] = useState(initialDraft.body)
  const valid = Boolean(title.trim() && body.trim())
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onCancel()
  }}>
    <div role="dialog" aria-modal="true" aria-labelledby="external-work-title" className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-2xl">
      <div className="mb-4">
        <h2 id="external-work-title" className="text-base font-semibold text-foreground">Send to {provider === 'github' ? 'GitHub' : provider === 'linear' ? 'Linear' : 'Jira'}</h2>
        <p className="mt-1 text-xs text-muted-foreground">Review and edit before creating in {destination}.</p>
      </div>
      <label className="block text-xs font-semibold text-muted-foreground">
        Title
        <input aria-label="External work title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
      </label>
      <label className="mt-4 block text-xs font-semibold text-muted-foreground">
        Description
        <textarea aria-label="External work description" value={body} onChange={(event) => setBody(event.target.value)} rows={12} className="mt-1.5 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none focus:border-primary" />
      </label>
      {error && <p role="alert" className="mt-3 text-xs text-status-rejected">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted-foreground disabled:opacity-50">Cancel</button>
        <button type="button" onClick={() => onSubmit({ title: title.trim(), body: body.trim() })} disabled={!valid || busy} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Sending…' : 'Create issue'}</button>
      </div>
    </div>
  </div>
}
