import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import type { DocumentView } from '../../../shared/documents'
import type { Project } from '../api'
import { route } from '../lib/routes'
import { documentMessage } from './client'

export function DocumentSharing({
  document,
  disabled,
  onAction,
  projects = [],
  invites = []
}: {
  document: DocumentView
  disabled: boolean
  onAction: (action: string, fields: object) => Promise<boolean>
  projects?: Pick<Project, 'publicKey' | 'name' | 'role'>[]
  invites?: string[]
}) {
  const [mode, setMode] = useState(document.accessMode),
    [password, setPassword] = useState(''),
    [email, setEmail] = useState(''),
    [project, setProject] = useState(document.projectId ?? ''),
    [confirm, setConfirm] = useState(''),
    [notice, setNotice] = useState('')
  const url = new URL(route(`/doc/${document.shareKey}`), window.location.origin).href
  const assignableProjects = projects.filter((item) => ['owner', 'admin', 'member'].includes(item.role ?? ''))
  const projectAvailable = !project || assignableProjects.some((item) => item.publicKey === project)
  const projectChanged = project !== (document.projectId ?? '')
  return (
    <section className="max-w-2xl space-y-6 p-6" aria-label="Document sharing">
      <div>
        <h2 className="text-sm font-semibold">Share for review</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Readers see the latest published revision and its feedback. Draft changes stay private to people with editing access.</p>
      </div>
      <label className="block text-xs font-medium">
        Review link
        <div className="mt-2 flex gap-2">
          <input className="document-input" value={url} readOnly />
          <button
            type="button"
            className="dashboard-bulk-secondary"
            aria-label="Copy review link"
            onClick={() =>
              void navigator.clipboard
                .writeText(url)
                .then(() => setNotice('Link copied.'))
                .catch((error) => setNotice(documentMessage(error)))
            }
          >
            <Copy size={14} />
          </button>
        </div>
      </label>
      {document.sharing && document.publishedRevision && !document.archived && (
        <a className="document-text-button" href={url} target="_blank" rel="noopener noreferrer">
          Open published document
          <ExternalLink size={13} />
        </a>
      )}
      <form
        className="space-y-5 border-y border-border py-6"
        onSubmit={(event) => {
          event.preventDefault()
          void onAction('sharing', { accessMode: mode, ...(mode === 'password' && password ? { password } : {}), userRequested: true })
        }}
      >
        <label className="block text-xs font-medium">
          Who can open this document?
          <select className="document-input mt-2" value={mode} disabled={!document.canManage || disabled || document.archived} onChange={(event) => setMode(event.target.value as DocumentView['accessMode'])}>
            <option value="private">Private</option>
            {document.projectId && <option value="project">Project members only</option>}
            <option value="link">Anyone with the link</option>
            <option value="password">Anyone with the link + password</option>
          </select>
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          {mode === 'private'
            ? 'Only you and people you explicitly invite can open it.'
            : mode === 'project'
              ? 'Requires project membership and login. Project guests can view, but cannot comment or change the document.'
              : mode === 'link'
                ? 'Unlisted links can be forwarded. Anyone with this link can read and leave feedback.'
                : 'The password protects both the document and its conversation.'}
        </p>
        {mode === 'password' && (
          <label className="block text-xs font-medium">
            {document.passwordProtected ? 'Replace password' : 'Password'}
            <input
              className="document-input mt-2"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              required={!document.passwordProtected}
              disabled={!document.canManage || disabled || document.archived}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={document.passwordProtected ? 'Leave blank to keep the current password' : 'At least 8 characters'}
            />
          </label>
        )}
        {document.canManage && (
          <button className="dashboard-bulk-primary" disabled={disabled || document.archived}>
            Save access
          </button>
        )}
      </form>
      {document.canManage && (
        <form
          className="space-y-3 border-b border-border pb-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (disabled || document.archived || !projectAvailable || !projectChanged) return
            void onAction('assign', { projectId: project || null, userRequested: true })
          }}
        >
          <label className="block text-xs font-medium">
            Project (optional)
            <select className="document-input mt-2" value={project} disabled={disabled || document.archived} onChange={(event) => setProject(event.target.value)}>
              <option value="">No project</option>
              {project && !projectAvailable && <option value={project} disabled>{projects.find((item) => item.publicKey === project)?.name ?? 'Project unavailable'}</option>}
              {assignableProjects.map((item) => (
                <option key={item.publicKey} value={item.publicKey}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">Assignment does not grant access. Removing a project-only document makes it Private.</p>
          <button className="dashboard-bulk-secondary" disabled={disabled || document.archived || !projectAvailable || !projectChanged}>
            Save project
          </button>
        </form>
      )}
      {document.canManage && mode === 'private' && (
        <section aria-label="Private invitations" className="space-y-3 border-b border-border pb-6">
          <h3 className="text-sm font-semibold">Invited people</h3>
          <form
            className="flex items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void onAction('invite', { email, remove: false, userRequested: true })
            }}
          >
            <label className="min-w-0 flex-1 text-xs font-medium">
              Email
              <input type="email" className="document-input mt-2" value={email} required maxLength={254} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <button className="dashboard-bulk-secondary" disabled={disabled || document.archived}>
              Invite
            </button>
          </form>
          {invites.map((address) => (
            <div key={address} className="flex items-center justify-between gap-3 text-sm">
              <span className="break-all">{address}</span>
              <button type="button" className="document-text-button" disabled={disabled || document.archived} onClick={() => void onAction('invite', { email: address, remove: true, userRequested: true })}>
                Remove invitation
              </button>
            </div>
          ))}
        </section>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {document.canManage && (
        <details className="border-b border-border pb-6">
          <summary className="cursor-pointer text-sm font-medium">Replace this link</summary>
          <p className="my-4 text-sm leading-6 text-muted-foreground">The old URL and existing password sessions will stop working. Share the replacement link with reviewers.</p>
          <button type="button" className="dashboard-bulk-secondary" disabled={disabled || document.archived} onClick={() => void onAction('sharing', { accessMode: document.accessMode, rotateLink: true, userRequested: true })}>
            Replace review link
          </button>
        </details>
      )}
      {document.canManage && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Archive or delete</summary>
          <p className="my-4 text-sm leading-6 text-muted-foreground">Archiving preserves history and disables reader access. You can restore an archived document.</p>
          <button type="button" className="dashboard-bulk-secondary" disabled={disabled} onClick={() => void onAction('archive', { archived: !document.archived, userRequested: true })}>
            {document.archived ? 'Restore document' : 'Archive document'}
          </button>
          <div className="mt-6 space-y-3">
            <label className="block text-xs font-medium">
              To delete permanently, type “{document.title}”<input className="document-input mt-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <p className="text-xs leading-5 text-muted-foreground">This deletes the document, all revisions, and all feedback. It cannot be undone.</p>
            <button type="button" className="dashboard-bulk-secondary text-status-rejected" disabled={disabled || confirm !== document.title} onClick={() => void onAction('delete', { userRequested: true })}>
              Delete permanently
            </button>
          </div>
        </details>
      )}
    </section>
  )
}
