import { useEffect, useState } from 'react'
import type { DocumentResult, DocumentView } from '../../../shared/documents'
import { documentRequest, documentMessage } from './client'
import { Spinner } from '../components/primitives'

export function DocumentHistory({ document, apiBase, session, disabled, onRestore }: { document: DocumentView; apiBase: string; session: string; disabled: boolean; onRestore: (revision: number) => void }) {
  const [data, setData] = useState<DocumentResult>(),
    [comparison, setComparison] = useState<DocumentResult['comparison']>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    documentRequest(apiBase, session, { action: 'history', id: document.id })
      .then((result) => {
        if (active) setData(result)
      })
      .catch((error) => {
        if (active) setError(documentMessage(error))
      })
    return () => {
      active = false
    }
  }, [apiBase, session, document.id])
  async function load(action: 'history' | 'compare', fields: object) {
    setBusy(true)
    setError('')
    try {
      const result = await documentRequest(apiBase, session, { action, id: document.id, ...fields })
      if (action === 'compare') setComparison(result.comparison)
      else setData((current) => ({ ...result, revisions: [...current!.revisions!, ...result.revisions!] }))
    } catch (error) {
      setError(documentMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-5 p-6" aria-label="Document history">
      <div>
        <h2 className="text-sm font-semibold">Published revisions</h2>
        <p className="mt-2 text-sm text-muted-foreground">Restoring creates a draft. Published history stays intact.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-status-rejected">
          {error}
        </p>
      )}
      {!data && !error && (
        <div role="status" aria-label="Loading history">
          <Spinner />
        </div>
      )}
      {data?.revisions?.length === 0 && <p className="text-sm text-muted-foreground">Publish the first revision to start this document’s history.</p>}
      {data?.revisions?.map((revision) => (
        <div key={revision.number} className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              Revision {revision.number} · {revision.summary}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <time dateTime={revision.created_at}>{new Date(revision.created_at).toLocaleString()}</time>
              {revision.agent_id && ` · ${revision.agent_id}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="dashboard-bulk-secondary" disabled={busy} onClick={() => void load('compare', { from: revision.number })}>
              Compare with draft
            </button>
            {document.canEdit && !document.archived && (
              <button type="button" className="dashboard-bulk-secondary" disabled={disabled || busy} onClick={() => onRestore(revision.number)}>
                Restore to draft
              </button>
            )}
          </div>
        </div>
      ))}
      {data?.nextOffset != null && (
        <button type="button" className="dashboard-bulk-secondary" disabled={busy} onClick={() => void load('history', { offset: data.nextOffset })}>
          Load older revisions
        </button>
      )}
      {comparison && (
        <div className="document-comparison">
          <div>
            <h3 className="mb-3 text-xs font-semibold">Published revision</h3>
            <pre>{comparison.before}</pre>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold">Current draft</h3>
            <pre>{comparison.after}</pre>
          </div>
        </div>
      )}
    </section>
  )
}
