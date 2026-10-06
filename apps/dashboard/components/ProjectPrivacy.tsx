import { useState } from 'react'
import type { Project } from '../api'

export function ProjectPrivacy({ project, apiBase, accessToken, canEdit, onSaved }: { project: Project; apiBase: string; accessToken: string; canEdit: boolean; onSaved: () => void }) {
  const [privateProject, setPrivate] = useState(project.widgetPrivate === true)
  const [access, setAccess] = useState(project.feedbackAccess ?? 'team')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${apiBase}/v1/projects/${encodeURIComponent(project.publicKey)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ widgetPrivate: privateProject, feedbackAccess: access }),
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save privacy settings')
      onSaved()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="mt-8">
    <h2 className="text-sm font-semibold text-foreground">Feedback privacy</h2>
    <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
      <input type="checkbox" checked={privateProject} disabled={!canEdit || busy} onChange={(event) => setPrivate(event.target.checked)} />
      Private project
    </label>
    <p className="mt-2 text-xs text-muted-foreground">Require commenters to log in. Each commenter sees only their own feedback in the website widget. Existing screenshots are protected when you save.</p>
    {privateProject && <label className="mt-3 block text-xs text-muted-foreground">Who can see all feedback in CRRT?
      <select aria-label="Who can see all feedback in CRRT?" value={access} disabled={!canEdit || busy} onChange={(event) => setAccess(event.target.value as 'team' | 'admins')} className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
        <option value="team">Project team</option><option value="admins">Owner and admins</option>
      </select>
    </label>}
    {canEdit && <button disabled={busy} onClick={() => void save()} className="mt-3 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">{busy ? 'Protecting feedback…' : 'Save privacy'}</button>}
    {error && <p role="alert" className="mt-2 text-xs text-muted-foreground">{error}</p>}
  </section>
}
