import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LockKeyhole, RefreshCw } from 'lucide-react'
import type { DocumentResult } from '../../../shared/documents'
import { asset, route } from '../lib/routes'
import { Spinner } from '../components/primitives'
import { documentRequest, documentMessage, DocumentRequestError, mergeFeedback } from './client'
import { DocumentBody, quoteMatches, type DocumentQuote, type DocumentSelection } from './DocumentBody'
import { useDocumentComment } from './useDocumentComment'
import { DocumentThreads } from './DocumentThreads'
import './documents.css'

const emptyQuote: DocumentSelection = { quote: '', prefix: '', suffix: '' }
export function DocumentReader({ apiBase, shareKey, session = null, userId = null, authorName = '' }: { apiBase: string; shareKey: string; session?: string | null; userId?: string | null; authorName?: string }) {
  const [denied, setDenied] = useState(false)
  const deniedRef = useRef(false)
  const [loadedUser, setLoadedUser] = useState<string | null>(userId)
  const [data, setData] = useState<DocumentResult>(),
    [error, setError] = useState<unknown>(),
    [loading, setLoading] = useState(true)
  const [password, setPassword] = useState(''),
    [grant, setGrant] = useState(''),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false)
  const [selection, setSelection] = useState(emptyQuote),
    pages = useRef(1),
    selectionRevision = useRef<number | null>(null),
    updates = useRef(0)
  const reportError = useCallback((error: unknown) => {
    if (error instanceof DocumentRequestError && ['Unauthorized', 'forbidden', 'login_required', 'document_not_found', 'password_required', 'incorrect_password'].includes(error.code)) {
      deniedRef.current = true
      updates.current++
      setDenied(true)
    }
    setError(error)
  }, [])
  const principal = useRef({ userId })
  if (principal.current.userId !== userId) principal.current = { userId }
  const feedback = useDocumentComment(apiBase, session, userId)
  const context = useMemo(() => ({ apiBase, shareKey, session, userId, grant }), [apiBase, shareKey, session, userId, grant])
  const currentContext = useRef(context)
  currentContext.current = context
  const request = useCallback((input: object, signal?: AbortSignal) => documentRequest(apiBase, session, input, signal), [apiBase, session])
  useEffect(() => {
    let active = true
    const generation = updates.current
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    Promise.all(Array.from({ length: pages.current }, (_, page) => request({ action: 'read', id: shareKey, shareKey, accessToken: grant, offset: page * 50 }, controller.signal)))
      .then((results) => {
        if (active && generation === updates.current) {
          deniedRef.current = false
          setDenied(false)
          setLoadedUser(userId)
          updates.current++
          setData((current) => ({
            ...results[0],
            feedback: mergeFeedback(
              current && current.document!.id === results[0].document!.id ? current.feedback! : [],
              results.flatMap((page) => page.feedback!)
            ),
            nextOffset: results[results.length - 1].nextOffset
          }))
        }
      })
      .catch((error) => {
        if (active && generation === updates.current) reportError(error)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [request, shareKey, grant, refresh, userId, reportError])
  function clearSelection() {
    setSelection(emptyQuote)
    selectionRevision.current = null
  }
  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await request({ action: 'unlock', shareKey, password })
      setGrant(result.accessToken!)
      setPassword('')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }
  async function comment(input: { body: string; author: string; parentId?: string; revision?: number } & DocumentQuote) {
    let confirmedIn = context
    let generation = updates.current
    setSending(true)
    try {
      if (!feedback.hasPending() && input.quote && selectionRevision.current !== data!.document!.publishedRevision && !quoteMatches(data!.document!.body, input))
        throw new DocumentRequestError('selection_changed')
      const updated = await feedback.submit({ ...input, id: data!.document!.id, revision: input.revision ?? data!.document!.publishedRevision!, shareKey, accessToken: grant }, (reader) => {
        const current = currentContext.current
        if (reader.session === current.session && reader.userId === current.userId && apiBase === current.apiBase && shareKey === current.shareKey && grant === current.grant) {
          confirmedIn = current
          generation = updates.current
        }
      })
      if (currentContext.current !== confirmedIn || generation !== updates.current) {
        if (!deniedRef.current) setRefresh((n) => n + 1)
        return
      }
      deniedRef.current = false
      setDenied(false)
      setLoadedUser(confirmedIn.userId)
      setLoading(false)
      updates.current++
      setData((current) => ({ ...current, document: updated.document, feedback: mergeFeedback(current!.feedback!, updated.feedback!) }))
      setError(undefined)
    } catch (error) {
      if (currentContext.current === confirmedIn && generation === updates.current) reportError(error)
      else if (!deniedRef.current) setRefresh((n) => n + 1)
      throw error
    } finally {
      setSending(false)
    }
  }
  async function more() {
    const startedAs = principal.current
    const generation = updates.current
    setBusy(true)
    try {
      const offset = data!.nextOffset!,
        page = await request({ action: 'read', id: shareKey, shareKey, accessToken: grant, offset })
      if (generation !== updates.current || principal.current !== startedAs) return
      updates.current++
      pages.current = Math.max(pages.current, offset / 50 + 1)
      setData((current) => ({ ...page, feedback: mergeFeedback(current!.feedback!, page.feedback!) }))
    } catch (error) {
      if (generation === updates.current && principal.current === startedAs) reportError(error)
    } finally {
      setBusy(false)
    }
  }
  const concealed = loadedUser !== userId || denied
  const locked = error instanceof DocumentRequestError && ['password_required', 'incorrect_password', 'rate_limited'].includes(error.code)
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="document-header">
        <a href={route('/')} className="inline-flex items-center gap-2 text-sm font-semibold">
          <img src={asset('crrt-isologo.png')} width={24} height={24} alt="" />
          CRRT
        </a>
        <span className="text-xs text-muted-foreground">Document review</span>
      </header>
      {loading && !data ? (
        <div role="status" aria-label="Loading document" className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : data?.document ? (
        <>
          {!concealed && <div className="document-title">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              Revision {data.document.publishedRevision}
              {data.document.passwordProtected && (
                <>
                  <span>·</span>
                  <LockKeyhole size={12} />
                  Protected link
                </>
              )}
            </div>
            <h1 className="break-words text-2xl font-semibold tracking-tight">{data.document.title}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{data.document.canComment ? 'Select text to leave feedback. Changes stay connected to this document.' : 'You have view-only access to this document.'}</p>
          </div>}
          {error && (
            <p role="alert" className="px-6 py-3 text-sm text-status-rejected">
              {documentMessage(error)}
            </p>
          )}
          {locked && (
            <form aria-label="Unlock document" onSubmit={(event) => void unlock(event)} className="flex flex-wrap items-end gap-3 border-b border-border px-6 py-4">
              <label className="text-sm font-medium">
                Password
                <input
                  className="document-input mt-2"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  maxLength={128}
                  required
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button className="dashboard-bulk-primary" disabled={busy}>
                Open document
              </button>
              <span className="text-xs text-muted-foreground">Your feedback draft is preserved.</span>
            </form>
          )}
          {error && !locked && (
            <button type="button" className="document-text-button m-6" disabled={loading || sending || busy} onClick={() => setRefresh((n) => n + 1)}>
              Reload latest revision
            </button>
          )}
          {concealed && !locked && <a className="document-text-button m-6" href={route('/doc/' + shareKey + '/login')}>Log in to CRRT</a>}
          {feedback.locked && !sending && <p className="px-6 py-3 text-sm text-muted-foreground">Retry this feedback or discard it to start a new note.</p>}
          <main className="document-reader-layout">
            <div className="document-reading-surface">
              {!concealed && <DocumentBody
                source={data.document.body}
                onQuote={(quote) => {
                  if (feedback.hasPending()) return
                  setSelection(quote)
                  selectionRevision.current = data.document!.publishedRevision
                }}
              />}
            </div>
            <div>
              <DocumentThreads
                authorName={authorName}
                disabled={sending || loading || busy}
                draftLocked={feedback.locked}
                onDiscard={() => {
                  feedback.discard()
                  if (!concealed) setError(undefined)
                }}
                concealed={concealed}
                feedback={concealed ? [] : data.feedback!}
                revision={data.document.publishedRevision!}
                source={concealed ? '' : data.document.body}
                selection={selection}
                onClearSelection={clearSelection}
                readOnly={concealed || !data.document.canComment}
                onComment={comment}
              />
              {!concealed && data.document.canComment && data.nextOffset !== null && (
                <button type="button" className="document-text-button m-6" disabled={busy || loading || sending} onClick={() => void more()}>
                  Load more feedback
                </button>
              )}
            </div>
          </main>
        </>
      ) : (
        <main className="mx-auto max-w-md px-6 py-16">
          {locked ? (
            <form onSubmit={(event) => void unlock(event)} className="space-y-5">
              <LockKeyhole size={24} className="text-muted-foreground" />
              <div>
                <h1 className="text-xl font-semibold">This document is protected</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter the password shared with you to read and leave feedback.</p>
              </div>
              <label className="block text-sm font-medium">
                Password
                <input className="document-input mt-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required maxLength={128} />
              </label>
              <p role="alert" className="text-sm text-muted-foreground">
                {documentMessage(error)}
              </p>
              <button className="dashboard-bulk-primary" disabled={busy}>
                {busy ? 'Opening…' : 'Open document'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold">Document unavailable</h1>
              <a className="document-text-button" href={route('/doc/' + shareKey + '/login')}>
                Log in to CRRT
              </a>
              <p role="alert" className="text-sm leading-6 text-muted-foreground">
                {documentMessage(error)}
              </p>
              <button type="button" className="dashboard-bulk-secondary gap-2" onClick={() => setRefresh((n) => n + 1)}>
                <RefreshCw size={14} />
                Try again
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
