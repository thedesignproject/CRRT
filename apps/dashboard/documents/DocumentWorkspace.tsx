import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Plus, RefreshCw } from 'lucide-react'
import type { DocumentResult, DocumentView } from '../../../shared/documents'
import type { Project } from '../api'
import { useDocumentComment } from './useDocumentComment'
import { documentRequest, documentMessage, DocumentRequestError, mergeFeedback } from './client'
import { DocumentEditor } from './DocumentEditor'
import { DocumentBody, quoteMatches, type DocumentSelection } from './DocumentBody'
import { DocumentHistory } from './DocumentHistory'
import { DocumentSharing } from './DocumentSharing'
import { DocumentRecoveryPanel, useDocumentRecovery, type EditorDraft, type FeedbackDraft } from './DocumentRecovery'
import type { DocumentCommentOperation } from './useDocumentComment'
import { DocumentThreads } from './DocumentThreads'
import { Spinner } from '../components/primitives'
import './documents.css'

const emptySelection: DocumentSelection = { quote: '', prefix: '', suffix: '' }

export function DocumentWorkspace({
  apiBase,
  session,
  projectId,
  listScope,
  canCreate,
  author,
  projects = [],
  onPendingChange,
  userId = null
}: {
  apiBase: string
  session: string
  projectId: string | null
  listScope?: 'all' | 'mine'
  canCreate: boolean
  author: string
  projects?: Pick<Project, 'publicKey' | 'name' | 'role'>[]
  onPendingChange?: (pending: boolean) => void
  userId?: string | null
}) {
  const recovery = useDocumentRecovery(userId)
  const cached = recovery.read()
  const resume = useRef(cached)
  const [selection, setSelection] = useState<DocumentSelection>(resume.current?.feedback?.selection ?? emptySelection)
  const [publication, setPublication] = useState<{ context: object; id: string; number: number; body: string } | null>(null)
  const [denied, setDenied] = useState(false)
  const [documents, setDocuments] = useState<DocumentView[]>([]),
    [data, setData] = useState<DocumentResult>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [tab, setTab] = useState<string>(resume.current?.tab ?? 'Edit'),
    [creating, setCreating] = useState(false),
    [newTitle, setNewTitle] = useState(''),
    [summary, setSummary] = useState(''),
    [dirty, setDirty] = useState(Boolean(resume.current?.editor)),
    [search, setSearch] = useState(''),
    [next, setNext] = useState<number | null>(null),
    [editorGeneration, setEditorGeneration] = useState(0),
    [conflict, setConflict] = useState(false),
    [reading, setReading] = useState(false),
    [feedbackPending, setFeedbackPending] = useState(Boolean(resume.current?.feedback?.body))
  useEffect(() => onPendingChange?.(dirty || busy || conflict || feedbackPending), [dirty, busy, conflict, feedbackPending, onPendingChange])
  const pending = useRef({ fingerprint: '', key: '', id: '' }),
    mounted = useRef(true),
    working = useRef(false)
  const context = useMemo(() => ({}), [apiBase, session, projectId, listScope, userId])
  const listFilter = useMemo(() => ({ projectId, ...(listScope ? { scope: listScope } : {}) }), [projectId, listScope])
  const [validatedContext, setValidatedContext] = useState(context)
  const concealed = denied || validatedContext !== context
  const feedbackPages = useRef(1), selected = useRef(data), draft = useRef({ dirty, conflict, tab })
  selected.current = data
  draft.current = { dirty, conflict, tab }
  const activeContext = useRef(context)
  activeContext.current = context
  const isCurrent = useCallback(() => mounted.current && activeContext.current === context, [context])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const reportError = useCallback((error: unknown) => {
    if (!isCurrent()) return
    if (error instanceof DocumentRequestError && ['Unauthorized', 'login_required', 'forbidden', 'document_not_found'].includes(error.code)) {
      setDenied(true)
      setDocuments([])
    }
    setError(documentMessage(error))
  }, [isCurrent])
  const onOperation = useCallback((operation: DocumentCommentOperation, event: 'started' | 'pending' | 'discarded' | 'confirmed') => {
    const saved = recovery.read()
    const location = { projectId, listScope, documentId: operation.input.id, tab: 'Feedback' as const }
    if (event === 'started') recovery.update(location, { operation })
    else if (saved?.operation?.key === operation.key) recovery.update(location, {
      operation: event === 'pending' ? operation : undefined,
      ...(event === 'confirmed' ? { feedback: undefined } : {}),
    })
  }, [recovery, projectId, listScope])
  const feedback = useDocumentComment(apiBase, session, userId, { initialOperation: resume.current?.operation, onOperation })
  const request = useCallback((input: object) => documentRequest(apiBase, session, input), [apiBase, session])
  const readLoaded = useCallback(async (id: string, count = feedbackPages.current) => {
    const pages = await Promise.all(Array.from({ length: count }, (_, page) => request({ action: 'read', id, ...(page ? { offset: page * 50 } : {}) })))
    return { ...pages[0], feedback: mergeFeedback([], pages.flatMap(page => page.feedback ?? [])), nextOffset: pages[pages.length - 1].nextOffset ?? null }
  }, [request])
  useEffect(() => {
    working.current = false
    setBusy(false)
    setReading(false)
    request({ action: 'list', ...listFilter })
      .then((result) => {
        if (isCurrent()) {
          setDocuments(result.documents!)
          setNext(result.nextOffset!)
        }
      })
      .catch((error) => {
        reportError(error)
      })
      .finally(() => {
        if (isCurrent()) setLoading(false)
      })
  }, [request, listFilter, reportError, isCurrent])
  useEffect(() => {
    const opened = selected.current?.document
    const recovering = resume.current
    const openedId = opened?.id ?? recovering?.documentId
    if (!openedId) return
    working.current = true
    setBusy(true)
    setReading(true)
    const restore = async () => {
      const result = await readLoaded(openedId)
      if (recovering?.feedback?.reply) {
        const parent = await request({ action: 'read', id: openedId, feedbackId: recovering.feedback.reply.id })
        return { ...result, feedback: mergeFeedback(result.feedback, parent.feedback!) }
      }
      return result
    }
    restore().then(result => {
      if (!isCurrent()) return
      const keepDraft = draft.current.dirty || draft.current.conflict
      setValidatedContext(context)
      setDenied(false)
      setData(result)
      setConflict(keepDraft)
      if (recovering) {
        resume.current = undefined
        setNotice('Your unsaved work was restored in this tab. Review it before continuing.')
      }
      if (!keepDraft && ((!result.document!.canEdit && ['Edit', 'History'].includes(draft.current.tab)) || (!result.document!.canManage && draft.current.tab === 'Sharing'))) setTab('Preview')
    }).catch(reportError).finally(() => {
      if (isCurrent()) { working.current = false; setBusy(false); setReading(false) }
    })
  }, [context, readLoaded, isCurrent, reportError, request])
  async function select(id: string, preserve = false) {
    if (working.current) return
    setSelection(emptySelection)
    working.current = true
    setReading(true)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await readLoaded(id, 1)
      if (isCurrent()) {
        setValidatedContext(context)
        feedbackPages.current = 1
        setDenied(false)
        setData(result)
        // Explicit open/reload resets the editor; save responses must preserve later typing.
        if (!preserve) setEditorGeneration((generation) => generation + 1)
        setTab(preserve || result.document!.canEdit ? 'Edit' : 'Preview')
        setDirty(preserve)
        setConflict(preserve)
      }
    } catch (error) {
      reportError(error)
    } finally {
      if (isCurrent()) {
        working.current = false
        setBusy(false)
        setReading(false)
      }
    }
  }
  const document = concealed && data?.document
    ? { ...data.document, title: denied ? 'Document unavailable' : 'Checking document access', body: '', canEdit: false, canPublish: false, canManage: false, canComment: false }
    : data?.document
  const documentId = data?.document?.id
  const publishedBody = document?.canEdit
    ? publication?.context === context && publication.id === document.id && publication.number === document.publishedRevision ? publication.body : null
    : document?.body ?? ''
  const publicationPending = Boolean(document?.canEdit && document.publishedRevision && publishedBody === null)
  useEffect(() => {
    if (tab !== 'Feedback' || concealed || !document?.publishedRevision || !publicationPending) return
    let active = true
    const controller = new AbortController()
    documentRequest(apiBase, session, { action: 'revision', id: document.id, revision: document.publishedRevision }, controller.signal)
      .then((result) => {
        if (active && isCurrent()) setPublication({ context, id: document.id, number: document.publishedRevision!, body: result.revision!.body! })
      })
      .catch((error) => { if (active) reportError(error) })
    return () => { active = false; controller.abort() }
  }, [tab, concealed, document?.id, document?.publishedRevision, publicationPending, context, editorGeneration, apiBase, session, isCurrent, reportError])
  const rememberEditor = useCallback((editor: EditorDraft | null) => {
    recovery.update({ projectId, listScope, documentId: documentId!, tab: 'Edit' }, { editor: editor ?? undefined })
  }, [documentId, projectId, listScope, recovery])
  const rememberFeedback = useCallback((feedback: FeedbackDraft | null) => {
    recovery.update({ projectId, listScope, documentId: documentId!, tab: 'Feedback' }, { feedback: feedback ? { ...feedback, selection } : undefined })
  }, [documentId, projectId, listScope, recovery, selection])
  const action = useCallback(
    async (action: string, fields: object): Promise<boolean> => {
      if (working.current) return false
      working.current = true
      setBusy(true)
      setError('')
      setNotice('')
      const fingerprint = JSON.stringify({ action, id: document?.id, version: document?.version, fields })
      if (pending.current.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID(), id: crypto.randomUUID() }
      const current = action === 'create' ? undefined : document
      const input = {
        action,
        id: current?.id ?? pending.current.id,
        key: pending.current.key,
        ...(current && !['comment', 'review', 'progress'].includes(action) ? { expectedVersion: current.version } : {}),
        ...fields
      }
      try {
        const result = await request(input)
        if (!isCurrent()) return false
        const list = await request({ action: 'list', ...listFilter })
        if (!isCurrent()) return false
        let unavailable = false
        setDocuments(list.documents!)
        setNext(list.nextOffset!)
        if (action !== 'delete') {
          try {
            const updated = await readLoaded(result.id!, action === 'create' ? 1 : feedbackPages.current)
            if (!isCurrent()) return false
            if (action === 'save' && updated.document!.version !== result.version) throw new DocumentRequestError('version_conflict')
            setValidatedContext(context)
            if (action === 'create') feedbackPages.current = 1
            setDenied(false)
            setData(current => ({ ...updated, feedback: current?.document?.id === updated.document!.id ? mergeFeedback(current.feedback!, updated.feedback) : updated.feedback }))
            setConflict(false)
            if (['sharing', 'assign'].includes(action) && !updated.document!.canManage) setTab('Preview')
          } catch (error) {
            if (!isCurrent()) return false
            if (!['sharing', 'assign'].includes(action) || !(error instanceof DocumentRequestError) || !['forbidden', 'document_not_found'].includes(error.code)) throw error
            unavailable = true
            setData(undefined)
            setDirty(false)
            setConflict(false)
          }
        } else setData(undefined)
        setCreating(false)
        setNewTitle('')
        setSummary('')
        setNotice(
          unavailable
            ? 'Changes saved. This document is no longer available in this workspace.'
            : action === 'save'
              ? ''
              : action === 'publish'
                ? 'Revision published.'
                : action === 'delete'
                  ? 'Document deleted.'
                  : 'Changes saved.'
        )
        if (action === 'create' || action === 'restore') setTab('Edit')
        pending.current = { fingerprint: '', key: '', id: '' }
        return true
      } catch (error) {
        if (isCurrent()) {
          reportError(error)
          if (error instanceof DocumentRequestError && error.code === 'version_conflict') setConflict(true)
        }
        return false
      } finally {
        if (isCurrent()) {
          working.current = false
          setBusy(false)
        }
      }
    },
    [document, listFilter, request, reportError, isCurrent, readLoaded, context]
  )
  const save = useCallback((title: string, body: string) => action('save', { title, body }), [action])
  async function more(kind: 'feedback' | 'documents') {
    if (working.current) return
    working.current = true
    setBusy(true)
    try {
      const page = await request(kind === 'feedback' ? { action: 'read', id: document!.id, offset: data!.nextOffset } : { action: 'list', ...listFilter, offset: next })
      if (isCurrent()) {
        if (kind === 'feedback') {
          feedbackPages.current++
          setData((current) => ({ ...page, feedback: mergeFeedback(current!.feedback!, page.feedback!) }))
        }
        else {
          setDocuments((current) => [...current, ...page.documents!])
          setNext(page.nextOffset!)
        }
      }
    } catch (error) {
      reportError(error)
    } finally {
      if (isCurrent()) {
        working.current = false
        setBusy(false)
      }
    }
  }
  return (
    <div className="document-workspace">
      <aside className="document-library" aria-label="Documents">
        <div className="flex items-center justify-between gap-3 px-5 py-5">
          <h1 className="text-base font-semibold">Documents</h1>
          {canCreate && (
            <button type="button" aria-label="New document" className="dashboard-bulk-secondary" disabled={busy || dirty || feedbackPending} onClick={() => setCreating(true)}>
              <Plus size={15} />
            </button>
          )}
        </div>
        <label className="mx-5 mb-4 block">
          <span className="sr-only">Search documents</span>
          <input className="document-input" placeholder="Search documents…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {loading && (
          <div className="px-5" role="status" aria-label="Loading documents">
            <Spinner />
          </div>
        )}
        {!loading && !documents.length && (
          <p className="px-5 text-sm leading-6 text-muted-foreground">{canCreate ? 'Create your first document and share it for review.' : 'No documents in this project yet.'}</p>
        )}
        {documents
          .filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
          .map((d) => (
            <button
              key={d.id}
              type="button"
              className="document-library-item"
              aria-current={d.id === document?.id ? 'page' : undefined}
              disabled={busy || dirty || feedbackPending}
              onClick={() => void select(d.id)}
            >
              <FileText size={16} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{d.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{d.archived ? 'Archived' : d.publishedRevision ? `Revision ${d.publishedRevision}` : 'Draft'}</span>
              </span>
            </button>
          ))}
        {next !== null && (
          <button type="button" className="document-text-button m-5" disabled={busy} onClick={() => void more('documents')}>
            Load more documents
          </button>
        )}
      </aside>
      <main className="min-w-0 overflow-y-auto">
        <div className="border-b border-border px-6 py-4">
          <p className="text-xs text-muted-foreground">Documents · Markdown</p>
        </div>
        {error && (
          <p role="alert" className="border-b border-border px-6 py-4 text-sm text-status-rejected">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="border-b border-border px-6 py-3 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {creating ? (
          <form
            className="mx-auto max-w-lg space-y-5 px-6 py-12"
            onSubmit={(event) => {
              event.preventDefault()
              void action('create', { projectId, title: newTitle, body: '' })
            }}
          >
            <h2 className="text-xl font-semibold">Create a document</h2>
            <p className="text-sm leading-6 text-muted-foreground">Start with a private draft. Publish and configure sharing when you’re ready for feedback.</p>
            <label className="block text-xs font-medium">
              Document title
              <input className="document-input mt-2" value={newTitle} required maxLength={200} onChange={(e) => setNewTitle(e.target.value)} />
            </label>
            <div className="flex gap-3">
              <button className="dashboard-bulk-primary" disabled={busy || !newTitle.trim()}>
                Create draft
              </button>
              <button type="button" className="dashboard-bulk-secondary" disabled={busy} onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : document ? (
          <>
            <header className="space-y-4 border-b border-border p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-semibold">{document.title}</h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {document.archived
                      ? 'Archived · sharing disabled'
                      : document.publishedRevision
                        ? `Published revision ${document.publishedRevision} · draft version ${document.version}`
                        : 'Private draft · not published'}
                  </p>
                </div>
                <button type="button" className="dashboard-bulk-secondary gap-2" disabled={busy || feedbackPending} onClick={() => void select(document.id, dirty || conflict)}>
                  <RefreshCw size={13} />
                  Reload latest
                </button>
              </div>
              <nav className="flex flex-wrap gap-2" aria-label="Document sections">
                {[...(document.canEdit || conflict ? ['Edit'] : []), 'Preview', 'Feedback', ...(document.canEdit ? ['History'] : []), ...(document.canManage ? ['Sharing'] : [])].map((name) => (
                  <button key={name} type="button" className="document-tab" aria-pressed={tab === name} disabled={busy || dirty || feedbackPending} onClick={() => setTab(name)}>
                    {name === 'Edit' && !document.canEdit ? 'Your draft' : name}
                  </button>
                ))}
              </nav>
              {feedbackPending && <p className="text-xs text-muted-foreground">Send or discard your feedback before switching sections.</p>}
              {dirty && (
                <p className="text-xs text-muted-foreground">
                  {document.canEdit ? 'Save or discard your changes before switching sections.' : 'Copy or discard your draft before switching sections.'}
                </p>
              )}
            </header>
            {tab === 'Edit' && (!concealed || dirty || conflict) && (
              <>
                <DocumentEditor
                  key={`${document.id}:${editorGeneration}`}
                  document={document}
                  initialDraft={cached?.documentId === document.id ? cached.editor : undefined}
                  onDraftChange={rememberEditor}
                  disabled={busy}
                  loading={reading}
                  onSave={save}
                  onDirty={setDirty}
                  conflict={conflict && !concealed}
                  onDiscard={() => {
                    setConflict(false)
                    setDirty(false)
                    if (!document.canEdit) setTab('Preview')
                  }}
                />
                {document.canPublish && !document.archived && (
                  <form
                    className="space-y-3 border-t border-border p-6"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void action('publish', { summary, userRequested: true })
                    }}
                  >
                    <label className="block text-xs font-medium">
                      What changed?
                      <input className="document-input mt-2" value={summary} maxLength={1000} required onChange={(e) => setSummary(e.target.value)} placeholder="A short summary for this revision" />
                    </label>
                    <p className="text-xs leading-5 text-muted-foreground">Publishing saves an immutable revision. Reviewers with access see it at the same link.</p>
                    <button className="dashboard-bulk-primary" disabled={busy || dirty || !summary.trim()}>
                      Publish revision
                    </button>
                  </form>
                )}
              </>
            )}
            {tab === 'Preview' && !concealed && (
              <div className="document-reading-surface">
                <DocumentBody source={document.body} />
              </div>
            )}
            {tab === 'History' && !concealed && <DocumentHistory onError={reportError} document={document} apiBase={apiBase} session={session} disabled={busy} onRestore={(revision) => void action('restore', { revision })} />}
            {tab === 'Sharing' && !concealed && <DocumentSharing key={`${document.id}:${document.version}`} document={document} disabled={busy} onAction={action} projects={projects} invites={data!.invites ?? []} />}
            {tab === 'Feedback' && (
              <>
                {!concealed && <div className="document-reading-surface">
                  {publicationPending ? <div role="status" aria-label="Loading published document"><Spinner /></div>
                    : document.publishedRevision ? <DocumentBody source={publishedBody!} onQuote={(quote) => {
                      if (!feedback.hasPending()) setSelection({ ...quote, revision: document.publishedRevision! })
                    }} /> : <p className="text-sm text-muted-foreground">Publish a revision to collect feedback.</p>}
                </div>}
                <DocumentThreads
                  disabled={busy || publicationPending}
                  initialDraft={cached?.documentId === document.id ? cached.feedback : undefined}
                  onDraftChange={rememberFeedback}
                  draftLocked={feedback.locked}
                  onDiscard={() => {
                    feedback.discard()
                    if (!concealed) setError('')
                  }}
                  onPendingChange={setFeedbackPending}
                  concealed={concealed}
                  feedback={concealed ? [] : data!.feedback!}
                  revision={document.publishedRevision ?? 0}
                  source={publishedBody ?? ''}
                  selection={selection}
                  onClearSelection={() => setSelection(emptySelection)}
                  authorName={author}
                  readOnly={!document.canComment}
                  onComment={async (input) => {
                    if (working.current) throw new DocumentRequestError('document_busy')
                    if (!feedback.hasPending() && input.quote && selection.revision !== document.publishedRevision && !quoteMatches(publishedBody!, input)) throw new DocumentRequestError('selection_changed')
                    working.current = true
                    setBusy(true)
                    setError('')
                    try {
                      const updated = await feedback.submit({ ...input, id: document.id, revision: input.revision ?? document.publishedRevision! })
                      if (isCurrent()) setData((current) => ({ ...current, document: updated.document, feedback: mergeFeedback(current!.feedback!, updated.feedback!) }))
                    } catch (error) {
                      reportError(error)
                      throw error
                    } finally {
                      if (isCurrent()) {
                        working.current = false
                        setBusy(false)
                      }
                    }
                  }}
                  onReview={
                    document.canEdit
                      ? (comment, status, done) =>
                          void action('review', {
                            feedbackId: comment.id,
                            feedbackVersion: comment.version,
                            reviewStatus: status,
                            ...(done ? { implementationStatus: 'done' } : {}),
                            userRequested: true
                          })
                      : undefined
                  }
                />
                {!concealed && data!.nextOffset !== null && (
                  <button type="button" className="document-text-button m-6" disabled={busy} onClick={() => void more('feedback')}>
                    Load more feedback
                  </button>
                )}
              </>
            )}
          </>
        ) : resume.current && error ? (
          <DocumentRecoveryPanel draft={resume.current} disabled={busy} onDiscard={() => {
            feedback.discard()
            recovery.clear()
            resume.current = undefined
            setDirty(false)
            setConflict(false)
            setFeedbackPending(false)
            setError('')
          }} />
        ) : (
          !loading && (
            <div className="mx-auto max-w-lg px-6 py-16">
              <FileText size={28} className="mb-5 text-muted-foreground" />
              <h2 className="text-xl font-semibold">A document. One review link.</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Publish your work, collect feedback on specific passages, and turn accepted changes into the next revision.</p>
              <p className="mt-4 text-xs text-muted-foreground">Select a document to get started.</p>
            </div>
          )
        )}
      </main>
    </div>
  )
}
