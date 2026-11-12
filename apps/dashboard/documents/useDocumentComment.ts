import { useCallback, useRef, useState } from 'react'
import type { DocumentInput, DocumentResult } from '../../../shared/documents'
import { documentRequest, DocumentRequestError } from './client'

type Input = Omit<Extract<DocumentInput, { action: 'comment' }>, 'action' | 'key'>
export type DocumentCommentOperation = { fingerprint: string; key: string; input: Input; principal: string | null; anonymous: boolean; feedbackId?: string }
export function useDocumentComment(apiBase: string, session: string | null, userId: string | null, recovery?: { initialOperation?: DocumentCommentOperation; onOperation: (operation: DocumentCommentOperation, event: 'started' | 'pending' | 'discarded' | 'confirmed') => void }) {
  const observer = useRef(recovery)
  observer.current = recovery
  const auth = useRef({ session, userId })
  auth.current = { session, userId }
  const operation = useRef<DocumentCommentOperation | undefined>(recovery?.initialOperation)
  const [locked, setLocked] = useState(Boolean(recovery?.initialOperation))
  const hasPending = useCallback(() => Boolean(operation.current), [])
  const discard = useCallback(() => {
    const previous = operation.current
    operation.current = undefined
    if (previous) observer.current?.onOperation(previous, 'discarded')
    setLocked(false)
  }, [])
  async function submit(input: Input, onConfirmationRead?: (principal: { session: string | null; userId: string | null }) => void): Promise<DocumentResult> {
    const { revision, accessToken, shareKey, ...draft } = input
    const fingerprint = JSON.stringify(draft)
    if (!operation.current) {
      if (session && !userId) throw new DocumentRequestError('feedback_account_changed')
      operation.current = { fingerprint, key: crypto.randomUUID(), input: { ...draft, revision }, principal: userId, anonymous: !session }
      observer.current?.onOperation(operation.current, 'started')
    }
    const pending = operation.current
    if (pending.fingerprint !== fingerprint) throw new DocumentRequestError('feedback_draft_changed')
    setLocked(true)
    if (!pending.feedbackId) {
      if (!pending.anonymous && (pending.principal !== userId || !session)) throw new DocumentRequestError('feedback_account_changed')
      try {
        const result = await documentRequest(apiBase, pending.anonymous ? null : session, { ...pending.input, action: 'comment', key: pending.key, shareKey, accessToken })
        pending.feedbackId = result.feedbackId
        observer.current?.onOperation(pending, 'pending')
      } catch (error) {
        if (error instanceof DocumentRequestError && error.code === 'revision_not_found') discard()
        throw error
      }
    }
    const reader = auth.current
    onConfirmationRead?.(reader)
    const result = await documentRequest(apiBase, reader.session, { action: 'read', id: input.id, ...(shareKey ? { shareKey, accessToken } : {}), feedbackId: pending.feedbackId })
    observer.current?.onOperation(pending, 'confirmed')
    discard()
    return result
  }
  return { submit, locked, discard, hasPending }
}
