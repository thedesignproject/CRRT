import { useEffect, useMemo, useState } from 'react'
import {
  assignExtensionComment,
  bulkAssignExtensionComments,
  bulkDeleteExtensionComments,
  deleteExtensionComment,
  listExtensionComments,
  updateExtensionComment,
  type ExtensionCommentBulkSelection,
  type ExtensionCommentRecord,
  type Project,
} from '../api'
import { mapServerComment } from '../lib/comment'
import { BulkActionBar, BulkDeleteDialog } from './BulkActionBar'
import { CommentDetail } from './CommentDetail'
import { CommentList } from './CommentList'
import { ActionBtn } from './primitives'

type InboxSelection =
  | { mode: 'ids'; ids: Set<string> }
  | { mode: 'all'; excludedIds: Set<string> }

function errorText(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback }
function emptySelection(): InboxSelection { return { mode: 'ids', ids: new Set() } }

export function ExtensionCommentsPage({ apiBase, accessToken, projects = [], onMovedToProject }: {
  apiBase: string
  accessToken: string
  projects?: Project[]
  onMovedToProject?: (projectId: string, movedIds: string[], skippedCount: number) => void
}) {
  const [items, setItems] = useState<ExtensionCommentRecord[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [targetProject, setTargetProject] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelection, setBulkSelection] = useState<InboxSelection>(emptySelection)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  useEffect(() => {
    let current = true
    setLoading(true); setError(''); setItems([]); setSelectedId(''); setEditing(false)
    listExtensionComments(apiBase, accessToken, page).then((result) => {
      if (current) { setItems(result.items); setTotal(result.total) }
    }).catch((reason) => {
      if (current) setError(errorText(reason, 'Could not load Inbox'))
    }).finally(() => { if (current) setLoading(false) })
    // Renew images without resetting selection or unsaved edits. Focus refresh
    // also handles tabs that browsers suspended past the signed URL lifetime.
    let refreshVersion = 0
    const refreshImages = async () => {
      const version = ++refreshVersion
      try {
        const result = await listExtensionComments(apiBase, accessToken, page)
        if (current && version === refreshVersion) setItems((currentItems) => currentItems.map((item) => {
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
  const eligibleProjects = projects.filter((project) => project.capabilities?.includes('feedback:create') ?? true)
  const selectedCount = bulkSelection.mode === 'all'
    ? Math.max(0, total - bulkSelection.excludedIds.size)
    : bulkSelection.ids.size
  const isBulkSelected = (id: string) => bulkSelection.mode === 'all'
    ? !bulkSelection.excludedIds.has(id)
    : bulkSelection.ids.has(id)
  const allVisibleSelected = comments.length > 0 && comments.every((comment) => isBulkSelected(comment.id))
  const bulkDescriptor: ExtensionCommentBulkSelection = bulkSelection.mode === 'all'
    ? { mode: 'all', excludedIds: [...bulkSelection.excludedIds] }
    : { mode: 'ids', ids: [...bulkSelection.ids] }

  function exitBulkMode() {
    setBulkMode(false)
    setBulkSelection(emptySelection())
    setConfirmBulkDelete(false)
    setTargetProject('')
  }

  function select(id: string) {
    if (busy) return
    setSelectedId(id); setEditing(false); setTargetProject(''); setError(''); setNotice('')
  }

  function navigate(offset: number) {
    const next = comments[selectedIdx + offset]
    if (next) select(next.id)
  }

  function toggleBulkSelect(id: string) {
    setBulkSelection((current) => {
      if (current.mode === 'all') {
        const excludedIds = new Set(current.excludedIds)
        if (excludedIds.has(id)) excludedIds.delete(id); else excludedIds.add(id)
        return { mode: 'all', excludedIds }
      }
      const ids = new Set(current.ids)
      if (ids.has(id)) ids.delete(id); else ids.add(id)
      return { mode: 'ids', ids }
    })
  }

  function toggleSelectAllVisible() {
    const visibleIds = comments.map((comment) => comment.id)
    setBulkSelection((current) => {
      if (current.mode === 'all') {
        const excludedIds = new Set(current.excludedIds)
        const selected = visibleIds.every((id) => !excludedIds.has(id))
        for (const id of visibleIds) selected ? excludedIds.add(id) : excludedIds.delete(id)
        return { mode: 'all', excludedIds }
      }
      const ids = new Set(current.ids)
      const selected = visibleIds.every((id) => ids.has(id))
      for (const id of visibleIds) selected ? ids.delete(id) : ids.add(id)
      return { mode: 'ids', ids }
    })
  }

  useEffect(() => {
    setBulkMode(false); setBulkSelection(emptySelection()); setConfirmBulkDelete(false); setTargetProject('')
  }, [apiBase, accessToken])

  useEffect(() => {
    if (!confirmBulkDelete) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setConfirmBulkDelete(false)
      }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [confirmBulkDelete, busy])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape' && bulkMode) {
        event.preventDefault(); exitBulkMode(); return
      }
      if (bulkMode) return
      if (['j', 'ArrowDown', ' ', 'k', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); navigate(event.key === 'k' || event.key === 'ArrowUp' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [comments, selectedIdx, busy, bulkMode, confirmBulkDelete])

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

  async function addToProject() {
    setBusy(true); setError('')
    try {
      await assignExtensionComment(apiBase, accessToken, selectedId, targetProject)
      setItems((current) => current.filter((item) => item.id !== selectedId))
      setTotal((value) => Math.max(0, value - 1)); setSelectedId(''); setTargetProject('')
      setReload((value) => value + 1)
    } catch (reason) { setError(errorText(reason, 'Could not add comment to project')) }
    finally { setBusy(false) }
  }

  async function moveSelected() {
    if (!targetProject || selectedCount === 0) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await bulkAssignExtensionComments(apiBase, accessToken, bulkDescriptor, targetProject)
      if (result.processedIds.length === 0) {
        setError('No Inbox items were moved. Refresh and try again.')
        return
      }
      if (onMovedToProject) {
        onMovedToProject(targetProject, result.processedIds, result.skipped.length)
        return
      }
      const moved = new Set(result.processedIds)
      setItems((current) => current.filter((item) => !moved.has(item.id)))
      setTotal((value) => Math.max(0, value - result.processedIds.length))
      setNotice(`${result.processedIds.length} moved${result.skipped.length ? `; ${result.skipped.length} skipped` : ''}.`)
      exitBulkMode(); setReload((value) => value + 1)
    } catch (reason) { setError(errorText(reason, 'Could not move selected Inbox items')) }
    finally { setBusy(false) }
  }

  async function deleteSelected() {
    if (selectedCount === 0) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await bulkDeleteExtensionComments(apiBase, accessToken, bulkDescriptor)
      const deleted = new Set(result.processedIds)
      setItems((current) => current.filter((item) => !deleted.has(item.id)))
      setTotal((value) => Math.max(0, value - result.processedIds.length))
      const retryIds = result.skipped.filter((item) => item.reason === 'storage_delete_failed').map((item) => item.id)
      if (retryIds.length > 0) {
        setBulkSelection({ mode: 'ids', ids: new Set(retryIds) })
        setNotice(`${result.processedIds.length} deleted; ${retryIds.length} could not be deleted and remain selected.`)
      } else {
        exitBulkMode()
        setNotice(`${result.processedIds.length} deleted.`)
      }
      setPage((current) => Math.min(current, Math.max(1, Math.ceil((total - result.processedIds.length) / 20))))
      setReload((value) => value + 1)
    } catch (reason) { setError(errorText(reason, 'Could not delete selected Inbox items')) }
    finally { setBusy(false); setConfirmBulkDelete(false) }
  }

  return <section className="flex flex-1 min-h-0 flex-col overflow-hidden">
    {error && items.length > 0 && <div role="alert" className="border-b border-border bg-card px-4 py-2 text-xs text-status-rejected">{error}</div>}
    {notice && <div role="status" className="border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground">{notice}</div>}
    <main className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
      <CommentList personal filteredComments={comments} counts={{ all: total, open: 0, ready: 0, ready_for_testing: 0, done: 0, rejected: 0 }}
        commentsLoading={loading} commentsError={items.length ? null : error} selectedCommentId={selectedId} setSelectedCommentId={select}
        bulkControls={{
          bulkMode,
          enterBulkMode: () => { setBulkMode(true); setSelectedId(''); setEditing(false); setError(''); setNotice('') },
          exitBulkMode,
          selectedCount,
          isSelected: isBulkSelected,
          toggleBulkSelect,
          toggleSelectAllVisible,
          allVisibleSelected,
          allMatchingSelected: bulkSelection.mode === 'all' && bulkSelection.excludedIds.size === 0,
          canSelectAllMatching: allVisibleSelected && selectedCount < total,
          selectAllMatching: () => setBulkSelection({ mode: 'all', excludedIds: new Set() }),
          clearSelection: () => setBulkSelection(emptySelection()),
        }}
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
          {eligibleProjects.length > 0 && <>
          <select aria-label="Project for comment" value={targetProject} disabled={busy} onChange={(event) => setTargetProject(event.target.value)}
            className="h-8 max-w-48 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring">
            <option value="">Add to project…</option>
            {eligibleProjects.map((project) => <option key={project.publicKey} value={project.publicKey}>{project.name}</option>)}
          </select>
          <ActionBtn variant="neutral" disabled={busy || !targetProject} onClick={addToProject}>Add to project</ActionBtn>
          </>}
          {editing ? <><ActionBtn variant="neutral" disabled={busy || !draft.trim()} onClick={save}>Save</ActionBtn><ActionBtn variant="neutral" disabled={busy} onClick={() => setEditing(false)}>Cancel</ActionBtn></>
            : <ActionBtn variant="neutral" disabled={busy} onClick={() => { setEditing(true); setDraft(selected.body) }}>Edit</ActionBtn>}
          <ActionBtn variant="neutral" disabled={busy} onClick={remove}>Delete</ActionBtn>
        </>} />
    </main>
    <BulkActionBar selectedCount={selectedCount} busy={busy} onClose={exitBulkMode}>
      <select aria-label="Project for selected Inbox items" value={targetProject} disabled={busy || eligibleProjects.length === 0}
        onChange={(event) => setTargetProject(event.target.value)} className="dashboard-bulk-select">
        <option value="">{eligibleProjects.length > 0 ? 'Move to project…' : 'No available projects'}</option>
        {eligibleProjects.map((project) => <option key={project.publicKey} value={project.publicKey}>{project.name}</option>)}
      </select>
      <button type="button" className="dashboard-bulk-primary" disabled={busy || !targetProject} onClick={() => { void moveSelected() }}>
        {busy ? 'Moving…' : 'Move'}
      </button>
      <details className="dashboard-bulk-menu">
        <summary>Actions</summary>
        <div role="menu">
          <button type="button" role="menuitem" disabled={busy} onClick={() => setConfirmBulkDelete(true)}>Delete selected</button>
        </div>
      </details>
    </BulkActionBar>
    {confirmBulkDelete && <BulkDeleteDialog selectedCount={selectedCount} busy={busy} onCancel={() => setConfirmBulkDelete(false)} onConfirm={() => { void deleteSelected() }} />}
  </section>
}
