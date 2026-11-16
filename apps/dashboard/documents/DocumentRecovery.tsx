import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DocumentComment, DocumentTarget } from '../../../shared/documents'
import type { DocumentCommentOperation } from './useDocumentComment'
import type { DocumentSelection } from './DocumentBody'

export type EditorDraft = { title: string; body: string }
export type FeedbackDraft = { body: string; author: string; reply: Pick<DocumentComment, 'id' | 'revision' | 'author'> | null; target?: DocumentTarget; selection?: DocumentSelection }
type Location = { projectId: string | null; listScope?: 'all' | 'mine'; documentId: string; tab: 'Edit' | 'Feedback' }
export type RecoveryDraft = Location & { editor?: EditorDraft; feedback?: FeedbackDraft; operation?: DocumentCommentOperation }
const RecoveryContext = createContext<Map<string, RecoveryDraft> | null>(null)

// This provider lives for one App mount. Nothing is written to browser storage.
export function DocumentRecoveryProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, RecoveryDraft>())
  return <RecoveryContext.Provider value={drafts}>{children}</RecoveryContext.Provider>
}

export function useDocumentRecovery(userId: string | null) {
  const drafts = useContext(RecoveryContext)
  return useMemo(() => ({
    read: () => userId ? drafts?.get(userId) : undefined,
    update: (location: Location, update: Partial<Pick<RecoveryDraft, 'editor' | 'feedback' | 'operation'>>) => {
      if (!drafts || !userId) return
      const previous = drafts.get(userId)
      const next = { ...location, ...(previous?.documentId === location.documentId ? previous : {}), ...update, tab: location.tab, listScope: location.listScope }
      if (next.editor || next.feedback?.body || next.operation) drafts.set(userId, next)
      else drafts.delete(userId)
    },
    clear: () => { if (userId) drafts?.delete(userId) },
  }), [drafts, userId])
}

export function DocumentRecoveryPanel({ draft, disabled, onDiscard }: { draft: RecoveryDraft; disabled: boolean; onDiscard: () => void }) {
  return <section className="space-y-5 p-6" aria-label="Recovered unsaved work">
    <h2 className="text-lg font-semibold">Your unsaved work</h2>
    <p className="text-sm leading-6 text-muted-foreground">This document could not be reopened. Your unsaved text is still available in this tab. Copy it or discard it to continue.</p>
    {draft.editor && <>
      <label className="block text-xs font-medium">Recovered title<input className="document-input mt-2" value={draft.editor.title} readOnly /></label>
      <label className="block text-xs font-medium">Recovered Markdown<textarea className="document-input mt-2 min-h-48" value={draft.editor.body} readOnly /></label>
    </>}
    {draft.feedback && <label className="block text-xs font-medium">Recovered feedback<textarea className="document-input mt-2 min-h-24" value={draft.feedback.body} readOnly /></label>}
    <button type="button" className="dashboard-bulk-secondary" disabled={disabled} onClick={onDiscard}>Discard recovered work</button>
  </section>
}
