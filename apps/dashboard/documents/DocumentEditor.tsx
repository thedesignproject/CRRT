import { useEffect, useLayoutEffect, useState } from 'react'
import type { EditorDraft } from './DocumentRecovery'
import { Upload } from 'lucide-react'
import type { DocumentView } from '../../../shared/documents'

export function DocumentEditor({
  document,
  disabled,
  loading = false,
  onSave,
  onDirty,
  conflict = false,
  onDiscard,
  initialDraft,
  onDraftChange
}: {
  document: DocumentView
  disabled: boolean
  loading?: boolean
  onSave: (title: string, body: string) => Promise<boolean>
  onDirty: (dirty: boolean) => void
  conflict?: boolean
  initialDraft?: EditorDraft
  onDraftChange?: (draft: EditorDraft | null) => void
  onDiscard?: () => void
}) {
  const [title, setTitle] = useState(initialDraft?.title ?? document.title),
    [body, setBody] = useState(initialDraft?.body ?? document.body),
    [paused, setPaused] = useState(Boolean(initialDraft)),
    [edited, setEdited] = useState(Boolean(initialDraft)),
    [fileError, setFileError] = useState('')
  const dirty = title.trim() !== document.title || body !== document.body || conflict
  const recovering = dirty && (!document.canEdit || document.archived)
  useLayoutEffect(() => {
    if (!dirty) setEdited(false)
    onDraftChange?.(dirty && edited ? { title, body } : null)
  }, [dirty, edited, title, body, onDraftChange])
  useLayoutEffect(() => {
    if (!edited) { setTitle(document.title); setBody(document.body) }
  }, [edited, document.title, document.body])
  useEffect(() => {
    if (conflict) setPaused(true)
  }, [conflict])
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    if (!dirty || !edited || !title.trim() || disabled || loading || paused || !document.canEdit || document.archived) return
    const timer = setTimeout(() => {
      void onSave(title.trim(), body).then((saved) => {
        if (!saved) setPaused(true)
      })
    }, 1200)
    return () => clearTimeout(timer)
  }, [title, body, dirty, edited, disabled, loading, paused, document.canEdit, document.archived, onSave])
  async function importFile(file: File) {
    if (file.size > 262144 || !/\.(md|markdown|txt)$/i.test(file.name)) {
      setFileError('Choose a Markdown or text file smaller than 256 KiB.')
      return
    }
    try {
      const imported = await file.text()
      setEdited(true)
      setBody(imported)
      setFileError('')
    } catch {
      setFileError('Could not read this file. Try again.')
    }
  }
  return (
    <section className="space-y-5 p-6" aria-label="Document editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          {loading ? 'Loading latest…' : disabled ? 'Saving…' : paused ? 'Autosave paused. Your changes are still here.' : dirty ? 'Unsaved changes' : 'All changes saved'}
        </p>
        {document.canEdit && !document.archived && (
          <label className="document-text-button cursor-pointer">
            <Upload size={14} />
            Import Markdown
            <input
              type="file"
              accept=".md,.markdown,.txt"
              aria-label="Import Markdown"
              className="sr-only"
              disabled={disabled || loading}
              onChange={(e) => {
                if (e.target.files?.[0]) void importFile(e.target.files[0])
              }}
            />
          </label>
        )}
      </div>
      {fileError && (
        <p role="alert" className="text-sm text-status-rejected">
          {fileError}
        </p>
      )}
      {recovering && (
        <p role="alert" className="text-sm text-muted-foreground">
          Your editing access changed. Your unsaved draft is preserved below. Copy it or discard it to continue.
        </p>
      )}
      {conflict && (
        <details open={!recovering} className="border-b border-border py-4">
          <summary className="text-sm font-medium">{recovering ? 'Current published content' : 'Loaded server content — compare before saving your draft'}</summary>
          <p className="my-2 text-sm">{document.title}</p>
          <pre className="whitespace-pre-wrap break-words text-xs">{document.body}</pre>
        </details>
      )}
      <label className="block text-xs font-medium">
        Title
        <input
          className="document-input mt-2"
          value={title}
          maxLength={200}
          readOnly={!document.canEdit || document.archived}
          disabled={loading || ((!document.canEdit || document.archived) && !recovering)}
          onChange={(e) => { setEdited(true); setTitle(e.target.value) }}
        />
      </label>
      <label className="block text-xs font-medium">
        Markdown
        <textarea
          className="document-input document-source mt-2"
          value={body}
          readOnly={!document.canEdit || document.archived}
          disabled={loading || ((!document.canEdit || document.archived) && !recovering)}
          maxLength={262144}
          onChange={(e) => { setEdited(true); setBody(e.target.value) }}
          placeholder="Write or paste your document here…"
        />
      </label>
      {((document.canEdit && !document.archived) || recovering) && (
        <div className="flex flex-wrap gap-3">
          {document.canEdit && !document.archived && (
            <button
              type="button"
              className="dashboard-bulk-primary"
              disabled={disabled || loading || !dirty || !title.trim()}
              onClick={() => {
                setEdited(true)
                setPaused(false)
                void onSave(title.trim(), body).then((saved) => {
                  if (!saved) setPaused(true)
                })
              }}
            >
              Save draft
            </button>
          )}
          <button
            type="button"
            className="dashboard-bulk-secondary"
            disabled={disabled || loading || !dirty}
            onClick={() => {
              setEdited(false)
              setTitle(document.title)
              setBody(document.body)
              setPaused(false)
              onDiscard?.()
            }}
          >
            Discard changes
          </button>
        </div>
      )}
    </section>
  )
}
