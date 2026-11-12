import { useEffect, useState, type ReactNode } from 'react'
import type { RecordingSummary } from './client'
import { Film, Play, Trash2 } from 'lucide-react'
import './Library.css'

const states = { recording: 'Recording', uploading: 'Uploading', processing: 'Processing', ready: 'Ready', failed: 'Processing failed' }
function RecordingCard({ row, href, actions }: { row: RecordingSummary; href: string; actions?: (row: RecordingSummary) => ReactNode }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const preview = row.thumbnailUrl && row.thumbnailUrl !== failedUrl
  const seconds = Math.ceil((row.durationMs || 0) / 1000)
  return <article className="recording-card"><a className="block focus-visible:outline-primary" href={href}>
    <div className="recording-thumb">
      {preview ? <img src={row.thumbnailUrl!} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(row.thumbnailUrl!)} />
        : <span className="recording-preview-placeholder"><Film size={28} aria-hidden="true" /><span>{row.state === 'ready' || row.state === 'failed' ? 'Preview unavailable' : 'Preparing preview'}</span></span>}
      <span className="recording-play" aria-hidden="true"><Play size={20} fill="currentColor" /></span>
      {row.durationMs !== null && <span className="recording-duration">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>}
    </div>
    <div className="recording-copy">
      <strong title={row.title}>{row.title}</strong>
      <p><span className="recording-status" data-state={row.state}>{states[row.state]}</span><span>{row.markCount} {row.markCount === 1 ? 'mark' : 'marks'}</span></p>
    </div>
  </a>{actions && <div className="px-4 pb-4">{actions(row)}</div>}</article>
}

export type RecordingPage = { recordings: RecordingSummary[]; next: string | null }
export function RecordingLibrary({ load, href, actions, remove }: { load: (before?: string) => Promise<RecordingPage>; href: (id: string) => string; actions?: (row: RecordingSummary) => ReactNode; remove?: (id: string) => Promise<unknown> }) {
  const [rows, setRows] = useState<RecordingSummary[]>([]), [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  async function deleteRecording(row: RecordingSummary) {
    if (!window.confirm(`Delete “${row.title}” from the cloud? Its share links will stop working. Local copies are kept. Your quota is released after file cleanup, which can take up to 26 hours.`)) return
    setDeleting(row.id); setError(''); setNotice('')
    try {
      await remove!(row.id)
      setRows(previous => previous.filter(item => item.id !== row.id))
      setNotice('Recording deleted. Your quota will be released after file cleanup (up to 26 hours). Local copies are kept.')
    } catch (error) { setError((error as Error).message) }
    finally { setDeleting(null) }
  }
  useEffect(() => {
    let disposed = false
    load().then(page => { if (!disposed) { setRows(page.recordings); setNext(page.next) } }).catch(error => { if (!disposed) setError(error.message) }).finally(() => { if (!disposed) setBusy(false) })
    return () => { disposed = true }
  }, [load])
  async function more() {
    setBusy(true); setError('')
    try { const page = await load(next!); setRows(previous => [...previous, ...page.recordings]); setNext(page.next) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section aria-label="Private recording library">
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {busy && <p>Loading recordings…</p>}
    {!busy && !error && rows.length === 0 && <p>No uploaded recordings yet. Start a recording with the CRRT extension.</p>}
    <div className="recordings-grid">{rows.map(row => <RecordingCard key={row.id} row={row} href={href(row.id)} actions={item => <div className="recording-card-actions">
      {actions?.(item)}
      {remove && <button type="button" className="recording-delete" disabled={deleting !== null} aria-label={`Delete ${item.title}`} onClick={() => { void deleteRecording(item) }}><Trash2 size={14} aria-hidden="true" />{deleting === item.id ? 'Deleting…' : 'Delete'}</button>}
    </div>} />)}</div>
    {next && <button className="recordings-load-more" disabled={busy} onClick={() => { void more() }}>Load more recordings</button>}
  </section>
}
