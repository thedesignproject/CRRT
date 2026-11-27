import { useMemo } from 'react'
import { domainAccessApi } from '../domain-access-api'
import { useAccessResource } from '../hooks/useAccessResource'

export function SuggestedProjects({ apiBase, accessToken, onProjectsChanged }: {
  apiBase: string; accessToken: string; onProjectsChanged: () => void
}) {
  const api = useMemo(() => domainAccessApi(apiBase, accessToken), [apiBase, accessToken])
  const state = useAccessResource(api.suggestions)
  async function request(project: string) {
    if (await state.run(() => api.submit(project))) onProjectsChanged()
  }
  const refresh = () => { void state.refresh(); onProjectsChanged() }
  // Without matches, joining a team stays a quiet one-liner instead of an empty section.
  if (state.data?.length === 0 && !state.error) {
    return <section className="w-full" aria-label="Suggested projects">
      <p className="text-xs text-muted-foreground">No suggested projects for your email yet. Ask a project admin to invite you. <button type="button" className="underline focus-visible:outline focus-visible:outline-primary disabled:opacity-50" disabled={state.loading || state.busy} onClick={refresh}>Refresh suggestions</button></p>
    </section>
  }
  return <section className="w-full space-y-3" aria-label="Suggested projects">
    <h2 className="text-sm font-semibold">Suggested projects</h2>
    <p className="text-xs text-muted-foreground">Projects matching your verified company email. An admin will review your request.</p>
    {state.loading && <p role="status" className="text-xs text-muted-foreground">Loading suggestions…</p>}
    {state.error && <p role="alert" className="text-xs">{state.error}</p>}
    <button type="button" className="text-xs underline focus-visible:outline focus-visible:outline-primary disabled:opacity-50" disabled={state.loading || state.busy} onClick={refresh}>Refresh suggestions</button>
    <ul className="divide-y divide-border">
      {state.data?.map(project => {
        const pending = project.status === 'pending'
        const cooldown = project.status === 'declined' && project.retry_at !== null && Date.parse(project.retry_at) > Date.now()
        return <li key={project.project_key} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{project.name}</p><p className="break-all text-xs text-muted-foreground">@{project.domain}</p></div>
          {pending ? <span role="status" className="text-xs text-muted-foreground">Pending approval</span>
            : cooldown ? <span className="w-full text-xs text-muted-foreground">Declined. Request again after {new Date(project.retry_at!).toLocaleString()}.</span>
            : <button type="button" className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-accent focus-visible:outline focus-visible:outline-primary disabled:opacity-50" disabled={state.loading || state.busy} aria-label={`Request access to ${project.name}`} onClick={() => { void request(project.project_key) }}>{project.status === 'declined' ? 'Request again' : 'Request access'}</button>}
        </li>
      })}
    </ul>
  </section>
}
