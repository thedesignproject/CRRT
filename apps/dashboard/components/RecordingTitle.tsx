import { useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'

export function RecordingTitle({ title, rename }: { title: string; rename?: (title: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) { setError('Enter a recording title.'); return }
    setSaving(true); setError('')
    try { await rename!(draft.trim()); setEditing(false) }
    catch (error) { setError((error as Error).message) }
    finally { setSaving(false) }
  }
  return editing ? <form onSubmit={event => { void save(event) }} className="space-y-2">
    <label className="sr-only" htmlFor="recording-title">Recording title</label>
    <input id="recording-title" autoFocus maxLength={240} disabled={saving} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !saving) setEditing(false) }} className="w-full rounded-lg border border-border bg-background p-2 text-xl font-semibold focus:outline-primary" />
    <div className="flex gap-2"><button type="submit" disabled={saving} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{saving ? 'Saving…' : 'Save title'}</button><button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded-lg border border-border px-3 py-2 text-sm">Cancel</button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </form> : <div className="flex items-start gap-3">
    <h1 className="min-w-0 flex-1 break-words text-2xl font-semibold">{title}</h1>
    {rename && <button type="button" onClick={() => { setDraft(title); setError(''); setEditing(true) }} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"><Pencil size={14} aria-hidden="true" />Rename</button>}
  </div>
}
