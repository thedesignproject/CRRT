import { useEffect, useState } from 'react'
import { MessageSquare, CornerDownRight, X } from 'lucide-react'
import type { DocumentComment } from '../../../shared/documents'
import { ActionBtn } from '../components/primitives'
import { quoteMatches, type DocumentQuote } from './DocumentBody'
import { documentMessage } from './client'

export function DocumentThreads({
  feedback,
  revision,
  source,
  selection,
  onClearSelection,
  onComment,
  onReview,
  authorName = '',
  onPendingChange,
  onDiscard,
  disabled = false,
  draftLocked = false,
  concealed = false,
  readOnly = false
}: {
  feedback: DocumentComment[]
  revision: number
  source: string
  selection: DocumentQuote
  onClearSelection: () => void
  onComment: (input: { body: string; author: string; parentId?: string; revision?: number } & DocumentQuote) => Promise<void>
  onReview?: (comment: DocumentComment, status: 'accepted' | 'rejected', done?: boolean) => void
  authorName?: string
  onPendingChange?: (pending: boolean) => void
  onDiscard?: () => void
  disabled?: boolean
  draftLocked?: boolean
  concealed?: boolean
  readOnly?: boolean
}) {
  const [body, setBody] = useState(''),
    [author, setAuthor] = useState(authorName),
    [reply, setReply] = useState<DocumentComment | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const locked = busy || disabled,
    editingLocked = locked || draftLocked || readOnly,
    recovering = readOnly && Boolean(body)
  useEffect(() => {
    if (!body) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [body])
  useEffect(() => {
    onPendingChange?.(Boolean(body) || busy)
  }, [body, busy, onPendingChange])
  useEffect(() => () => onPendingChange?.(false), [onPendingChange])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (locked || readOnly) return
    setBusy(true)
    setError('')
    try {
      await onComment({ body, author, ...selection, ...(reply ? { parentId: reply.id, revision: reply.revision, quote: '', prefix: '', suffix: '' } : {}) })
      setBody('')
      setReply(null)
      onClearSelection()
    } catch (error) {
      setError(documentMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const roots = feedback.filter((f) => !f.parent_id)
  return (
    <section className="document-conversation" aria-label="Document feedback">
      <div className="flex items-center gap-2 border-b border-border px-6 py-5">
        <MessageSquare size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">Feedback</h2>
        <span className="ml-auto text-xs text-muted-foreground">{roots.length}</span>
      </div>
      <div className="document-thread-list">
        {!roots.length && (
          <div className="px-6 py-8">
            <p className="text-sm font-medium">Start the conversation</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Select a passage to leave specific feedback, or add a note below.</p>
          </div>
        )}
        {roots.map((thread) => (
          <article key={thread.id} className="border-b border-border px-6 py-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold">{thread.author}</span>
              <span className="text-muted-foreground">{thread.implementation_status === 'unassigned' ? thread.review_status : thread.implementation_status.replace(/_/g, ' ')}</span>
            </div>
            {thread.quote && <blockquote className="document-quote">{thread.quote}</blockquote>}
            {thread.revision !== revision && (
              <p className="mb-3 text-xs text-muted-foreground">
                {quoteMatches(source, thread) ? 'Carried from' : 'Text changed since'} revision {thread.revision}
              </p>
            )}
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{thread.body}</p>
            {feedback
              .filter((f) => f.parent_id === thread.id)
              .map((item) => (
                <div key={item.id} className="mt-4 border-l border-border pl-3">
                  <p className="text-xs font-semibold">{item.author}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
                </div>
              ))}
            {Boolean(thread.progress_updates?.length) && (
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground">Work updates</summary>
                <ol className="mt-3 space-y-3 border-l border-border pl-3">
                  {thread.progress_updates!.map((update, index) => (
                    <li key={`${update.createdAt}:${index}`}>
                      <p className="flex flex-wrap gap-2 font-semibold"><span>{update.agentId}</span><span>{update.operation}</span></p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{update.summary}</p>
                      <time className="mt-1 block text-muted-foreground" dateTime={update.createdAt}>{new Date(update.createdAt).toLocaleString()}</time>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!readOnly && (
                <button
                  type="button"
                  className="document-text-button"
                  disabled={editingLocked}
                  onClick={() => {
                    setReply(thread)
                    document.getElementById('document-comment-body')!.focus()
                  }}
                >
                  <CornerDownRight size={13} />
                  Reply
                </button>
              )}
              {onReview && (
                <>
                  <ActionBtn disabled={locked} variant="accept" active={thread.review_status === 'accepted'} onClick={() => onReview(thread, 'accepted')}>
                    Accept
                  </ActionBtn>
                  <ActionBtn disabled={locked} variant="reject" active={thread.review_status === 'rejected'} onClick={() => onReview(thread, 'rejected')}>
                    Reject
                  </ActionBtn>
                  <ActionBtn disabled={locked} variant="done" active={thread.implementation_status === 'done'} onClick={() => onReview(thread, 'accepted', true)}>
                    Done
                  </ActionBtn>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {readOnly && !recovering ? (
        <p className="p-6 text-sm text-muted-foreground">View-only access</p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-3 border-t border-border p-6">
          {recovering && (
            <p role="alert" className="text-sm text-muted-foreground">
              Your access changed. Your feedback is preserved. Copy it or discard it to continue.
            </p>
          )}
          {reply && !concealed && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Replying to {reply.author} · revision {reply.revision}
              </span>
              <button type="button" disabled={editingLocked} aria-label="Cancel reply" onClick={() => setReply(null)}>
                <X size={14} />
              </button>
            </div>
          )}
          {selection.quote && !reply && !concealed && (
            <div className="flex items-start gap-2">
              <blockquote className="document-quote min-w-0 flex-1">{selection.quote}</blockquote>
              <button type="button" disabled={editingLocked} aria-label="Clear selected passage" onClick={onClearSelection}>
                <X size={14} />
              </button>
            </div>
          )}
          {!authorName && (
            <label className="block text-xs font-medium">
              Your name
              <input
                className="document-input mt-2"
                value={author}
                readOnly={recovering}
                disabled={editingLocked && !recovering}
                onChange={(e) => setAuthor(e.target.value)}
                required
                maxLength={100}
                autoComplete="name"
              />
            </label>
          )}
          <label className="block text-xs font-medium">
            {reply ? 'Reply' : 'Leave feedback'}
            <textarea
              id="document-comment-body"
              className="document-input mt-2 min-h-24 resize-y"
              value={body}
              readOnly={recovering}
              disabled={editingLocked && !recovering}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={8000}
              placeholder="What would you change?"
            />
          </label>
          {body && (
            <button
              type="button"
              className="document-text-button"
              disabled={locked}
              onClick={() => {
                setBody('')
                setError('')
                onDiscard?.()
                setReply(null)
                onClearSelection()
              }}
            >
              Discard feedback
            </button>
          )}
          {error && (
            <p role="alert" className="text-sm text-status-rejected">
              {error}
            </p>
          )}
          <button className="dashboard-bulk-primary" disabled={locked || readOnly || !body.trim() || !author.trim()}>
            {busy ? 'Sending…' : reply ? 'Send reply' : 'Add feedback'}
          </button>
        </form>
      )}
    </section>
  )
}
