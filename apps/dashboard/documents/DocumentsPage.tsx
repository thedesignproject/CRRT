import { useEffect, useState } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import { useProjects } from '../hooks/useProjects'
import { asset, route } from '../lib/routes'
import { Spinner } from '../components/primitives'
import { useDocumentRecovery } from './DocumentRecovery'
import { DocumentWorkspace } from './DocumentWorkspace'
export function DocumentsPage({ apiBase, session, author, userId = null }: { apiBase: string; session: string; author: string; userId?: string | null }) {
  const recovery = useDocumentRecovery(userId)
  const { projects, loading, error } = useProjects(apiBase, session)
  const [choice, setChoice] = useState(() => {
    const saved = recovery.read()
    if (saved) return saved.listScope ?? (saved.projectId ? `project:${saved.projectId}` : 'mine')
    const query = new URLSearchParams(window.location.search)
    const project = query.get('project')
    return project ? `project:${project}` : query.get('view') === 'mine' ? 'mine' : 'all'
  })
  const [pending, setPending] = useState(false),
    [ready, setReady] = useState(false)
  useEffect(() => {
    if (!loading) setReady(true)
  }, [loading])
  const listScope = choice === 'all' || choice === 'mine' ? choice : undefined
  const projectId = listScope ? null : choice.slice('project:'.length)
  const project = projects.find((p) => p.publicKey === projectId)
  return (
    <div className="document-page">
      <header className="document-header">
        <a href={route('/')} className="inline-flex items-center gap-2 text-sm font-semibold">
          <img src={asset('crrt-isologo.png')} width={24} height={24} alt="" />
          CRRT
        </a>
        <a href={route('/')} className="document-text-button">
          <ArrowLeft size={14} />
          Workspace
        </a>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <FileText size={16} />
          Documents
        </span>
        <label className="flex items-center gap-3 text-xs font-medium">
          View
          <select
            className="document-input"
            value={choice}
            disabled={pending || loading}
            title={pending ? 'Save or discard changes before switching views' : undefined}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="all">All documents</option>
            <option value="mine">My documents</option>
            <optgroup label="Projects">
              {projectId && !project && <option value={choice}>Project unavailable</option>}
              {projects.map((p) => (
                <option key={p.publicKey} value={`project:${p.publicKey}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>
      {!ready ? (
        <div role="status" className="p-6" aria-label="Loading projects">
          <Spinner />
        </div>
      ) : (
        <>
          {error && (
            <p role="alert" className="p-6 text-sm">
              {error}
            </p>
          )}
          <DocumentWorkspace
            key={choice}
            userId={userId}
            apiBase={apiBase}
            session={session}
            projectId={projectId}
            listScope={listScope}
            canCreate={Boolean(listScope) || Boolean(project && ['owner', 'admin', 'member'].includes(project.role ?? ''))}
            author={author}
            projects={projects}
            onPendingChange={setPending}
          />
        </>
      )}
    </div>
  )
}
