import { useId, useRef, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { recordingShareUrl, recordRequest } from '../../../shared/record/client'
import { route } from '../lib/routes'

export function RecordingShareButton({ id, title, apiBase, accessToken }: { id: string; title: string; apiBase: string; accessToken: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const label = useId()
  const [shareId, setShareId] = useState<string | null>()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false)
  const path = `recordings/${encodeURIComponent(id)}/share`
  const url = shareId ? recordingShareUrl(new URL(route('/'), window.location.origin).href, shareId) : ''
  async function load() {
    setBusy(true); setError(''); setShareId(undefined); setCopied(false)
    try { setShareId((await recordRequest<{ shareId: string | null }>(apiBase, path, accessToken)).shareId) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function change(method: 'POST' | 'DELETE') {
    setBusy(true); setError(''); setCopied(false)
    try { setShareId((await recordRequest<{ shareId: string | null }>(apiBase, path, accessToken, undefined, method)).shareId) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setError('') }
    catch { setError('Could not copy the link. Select and copy it below.') }
  }
  return <>
    <button type="button" disabled={busy} aria-label={`Share ${title}`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => { dialog.current!.showModal(); void load() }}><Share2 size={14} aria-hidden="true" />Share</button>
    <dialog ref={dialog} aria-labelledby={label} className="m-auto w-full max-w-md rounded-xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/60">
      <h2 id={label} className="break-words text-lg font-semibold">Share recording: {title}</h2>
      {busy && <p role="status" className="mt-4 text-sm">Updating sharing…</p>}
      {shareId && <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">Anyone with this link can view the recording. No account required.</p>
        <label className="block text-sm">Share link<input readOnly value={url} onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm" /></label>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { void copy() }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy share link'}</button><button type="button" disabled={busy} onClick={() => { void change('DELETE') }} className="rounded-lg border border-border px-3 py-2 text-sm">Unshare</button></div>
        <p className="text-xs text-muted-foreground">Unshare stops new access immediately. Already loaded media can remain playable for up to five minutes.</p>
      </div>}
      {shareId === null && <div className="mt-4 space-y-3"><p className="text-sm">Sharing is off. Enable sharing to create a new link.</p><button type="button" disabled={busy} onClick={() => { void change('POST') }} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">Enable sharing</button></div>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {error && shareId === undefined && <button type="button" disabled={busy} onClick={() => { void load() }} className="mt-3 text-sm underline">Retry</button>}
      <form method="dialog" className="mt-4 flex justify-end"><button type="submit" autoFocus className="rounded-lg border border-border px-3 py-2 text-sm">Done</button></form>
    </dialog>
  </>
}
