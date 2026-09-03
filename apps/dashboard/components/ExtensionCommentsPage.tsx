import { useEffect, useMemo, useState } from 'react'
import { deleteExtensionComment, listExtensionComments, updateExtensionComment, type ExtensionCommentRecord } from '../api'
import { mapServerComment } from '../lib/comment'
import { CommentList } from './CommentList'
import { CommentDetail } from './CommentDetail'
import { ActionBtn } from './primitives'

function errorText(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback }

export function ExtensionCommentsPage({ apiBase, accessToken }: { apiBase: string; accessToken: string }) {
  const [items, setItems] = useState<ExtensionCommentRecord[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let current = true
    setLoading(true); setError(''); setItems([]); setSelectedId(''); setEditing(false)
    listExtensionComments(apiBase, accessToken, page).then((result) => {
      if (current) { setItems(result.items); setTotal(result.total) }
    }).catch((reason) => {
      if (current) setError(errorText(reason, 'Could not load extension comments'))
    }).finally(() => { if (current) setLoading(false) })
    // Renew images without resetting selection or unsaved edits. Focus refresh
    // also handles tabs that browsers suspended past the signed URL lifetime.
    let refreshVersion = 0
    const refreshImages = async () => {
      const version = ++refreshVersion
      try {
        const result = await listExtensionComments(apiBase, accessToken, page)
        if (current && version === refreshVersion) setItems((items) => items.map((item) => {
          const fresh = result.items.find((candidate) => candidate.id === item.id)
          return fresh ? { ...item, screenshotUrl: fresh.screenshotUrl } : item
        }))
      } catch { /* Keep the current comments usable while offline. */ }
    }
    const timer = window.setInterval(refreshImages, 240_000)
    window.addEventListener('focus', refreshImages)
    return () => { current = false; window.clearInterval(timer); window.removeEventListener('focus', refreshImages) }
  }, [apiBase, accessToken, page, reload])

  const comments = useMemo(() => items.map((item) => mapServerComment({
    ...item, projectId: '', authorName: 'You', imageUrl: item.screenshotUrl,
    reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null,
  })), [items])
  const selected = comments.find((item) => item.id === selectedId) ?? null
  const selectedIdx = comments.findIndex((item) => item.id === selectedId)
  const pages = Math.max(1, Math.ceil(total / 20))

  function select(id: string) {
    if (busy) return
    setSelectedId(id); setEditing(false); setError('')
  }
  function navigate(offset: number) {
    const next = comments[selectedIdx + offset]
    if (next) select(next.id)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return
      if (['j', 'ArrowDown', ' ', 'k', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); navigate(event.key === 'k' || event.key === 'ArrowUp' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [comments, selectedIdx, busy])

  async function save() {
    setBusy(true); setError('')
    try {
      const updated = await updateExtensionComment(apiBase, accessToken, selectedId, draft.trim())
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditing(false)
    } catch (reason) { setError(errorText(reason, 'Could not update comment')) }
    finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true); setError('')
    try {
      await deleteExtensionComment(apiBase, accessToken, selectedId)
      setItems((current) => current.filter((item) => item.id !== selectedId))
      setTotal((value) => Math.max(0, value - 1)); setSelectedId(''); setEditing(false)
      setPage(Math.min(page, Math.max(1, Math.ceil((total - 1) / 20))))
      setReload((value) => value + 1)
    } catch (reason) { setError(errorText(reason, 'Could not delete comment')) }
    finally { setBusy(false) }
  }

  return <section className="flex flex-1 min-h-0 flex-col overflow-hidden">
    {error && items.length > 0 && <div role="alert" className="border-b border-border bg-card px-4 py-2 text-xs text-status-rejected">{error}</div>}
    <main className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
      <CommentList personal filteredComments={comments} counts={{ all: total, open: 0, ready: 0, done: 0, rejected: 0 }}
        commentsLoading={loading} commentsError={items.length ? null : error} selectedCommentId={selectedId} setSelectedCommentId={select}
        footer={pages > 1 && <div className="flex items-center justify-center gap-3 border-t border-border px-4 py-3">
          <ActionBtn variant="neutral" disabled={loading || busy || page === 1} onClick={() => setPage((value) => value - 1)}>Previous</ActionBtn>
          <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
          <ActionBtn variant="neutral" disabled={loading || busy || page === pages} onClick={() => setPage((value) => value + 1)}>Next</ActionBtn>
        </div>} />
      <CommentDetail personal selectedComment={selected} selectedProject="" apiBase={apiBase} accessToken={accessToken}
        commentsLoading={loading} commentsError={error} projectComments={comments} filteredComments={comments}
        selectedIdx={selectedIdx} goPrev={() => navigate(-1)} goNext={() => navigate(1)}
        bodyEditor={editing && selected ? <textarea aria-label="Edit comment" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={8000} disabled={busy}
          className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" /> : undefined}
        personalActions={selected && <>
          {editing ? <><ActionBtn variant="neutral" disabled={busy || !draft.trim()} onClick={save}>Save</ActionBtn><ActionBtn variant="neutral" disabled={busy} onClick={() => setEditing(false)}>Cancel</ActionBtn></>
            : <ActionBtn variant="neutral" disabled={busy} onClick={() => { setEditing(true); setDraft(selected.body) }}>Edit</ActionBtn>}
          <ActionBtn variant="neutral" disabled={busy} onClick={remove}>Delete</ActionBtn>
        </>} />
    </main>
  </section>
}
