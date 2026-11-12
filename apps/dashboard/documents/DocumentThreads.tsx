import { useCallback, useState } from 'react'
import { FeedbackWidget } from '../../../src'
import type { ConversationDraft } from '../../../src'
import type { FeedbackDraft } from './DocumentRecovery'
import type { DocumentComment, DocumentTarget } from '../../../shared/documents'
import { quoteMatches, type DocumentQuote, type DocumentSelection } from './DocumentBody'
import { documentMessage } from './client'
import { getDashboardTheme } from '../lib/theme'

type Props = {
  feedback: DocumentComment[]
  revision: number
  source: string
  selection: DocumentSelection
  onClearSelection: () => void
  onComment: (input: { body: string; author: string; parentId?: string; revision?: number; target?: DocumentTarget } & DocumentQuote) => Promise<void>
  onReview?: (comment: DocumentComment, status: 'accepted' | 'rejected', done?: boolean) => void
  authorName?: string
  onPendingChange?: (pending: boolean) => void
  onDiscard?: () => void
  disabled?: boolean
  draftLocked?: boolean
  initialDraft?: FeedbackDraft
  onDraftChange?: (draft: FeedbackDraft | null) => void
  concealed?: boolean
  readOnly?: boolean
}

export function DocumentThreads({ feedback, revision, source, selection, onComment, onReview, initialDraft, onDraftChange, ...props }: Props) {
  const [hasDraft, setHasDraft] = useState(Boolean(initialDraft?.body))
  const saveDraft = useCallback((draft: ConversationDraft | null) => {
    setHasDraft(Boolean(draft?.body))
    onDraftChange?.(draft ? { ...draft, reply: draft.reply ? { id: draft.reply.id, revision: draft.reply.version, author: draft.reply.author } : null } : null)
  }, [onDraftChange])
  return <FeedbackWidget projectId="document" disabled={props.readOnly && !hasDraft} theme={getDashboardTheme()} conversation={{
    ...props,
    containerSelector: '.document-prose',
    feedback: feedback.map(comment => ({
      id: comment.id, parentId: comment.parent_id, version: comment.revision,
      body: comment.body, author: comment.author, quote: comment.quote,
      createdAt: comment.created_at,
      target: comment.target,
      reviewStatus: comment.review_status, implementationStatus: comment.implementation_status,
      progressUpdates: comment.progress_updates,
      contextLabel: comment.revision === revision ? undefined : `${quoteMatches(source, comment) ? 'Carried from' : 'Text changed since'} revision ${comment.revision}`,
    })),
    selection: selection.quote,
    selectionTarget: selection.selectionTarget,
    initialDraft: initialDraft ? { ...initialDraft, reply: initialDraft.reply ? { id: initialDraft.reply.id, version: initialDraft.reply.revision, author: initialDraft.reply.author } : null } : undefined,
    onDraftChange: saveDraft,
    onComment: ({ version, ...input }) => onComment({ ...input, ...(input.parentId ? { revision: version, quote: '', prefix: '', suffix: '' } : { quote: selection.quote, prefix: selection.prefix, suffix: selection.suffix }) }),
    onReview: onReview ? (comment, status, done) => onReview(feedback.find(item => item.id === comment.id)!, status, done) : undefined,
    errorMessage: documentMessage,
  }} />
}
