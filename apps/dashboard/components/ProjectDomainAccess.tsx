import { useCallback, useMemo, useState } from 'react'
import { domainAccessApi, type AccessRequest, type AccessRole } from '../domain-access-api'
import { useAccessResource } from '../hooks/useAccessResource'

const button = 'rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50'
const input = 'min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'

export function ProjectDomainAccess({ apiBase, accessToken, projectKey, onMembersChanged }: {
  apiBase: string; accessToken: string; projectKey: string; onMembersChanged: () => void
}) {
  const api = useMemo(() => domainAccessApi(apiBase, accessToken), [apiBase, accessToken])
  const load = useCallback(async () => {
    const [domains, requests] = await Promise.all([api.domains(projectKey), api.requests(projectKey)])
    return { domains, requests }
  }, [api, projectKey])
  const state = useAccessResource(load)
  const [domain, setDomain] = useState('')
  const disabled = state.loading || state.busy
  async function add() {
    if (await state.run(() => api.addDomain(projectKey, domain))) setDomain('')
  }
  async function review(request: AccessRequest, decision: 'approved' | 'declined', role: AccessRole) {
    if (await state.run(() => api.review(projectKey, request.id, decision, role, request.attempt))) onMembersChanged()
  }
  return <section className="mt-8 space-y-3" aria-labelledby="company-access-heading">
    <h2 id="company-access-heading" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Company access</h2>
    <p className="text-xs text-muted-foreground">People with these verified email domains can discover this project and request access. Every request needs your approval.</p>
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <form onSubmit={e => { e.preventDefault(); void add() }} className="space-y-2">
        <label htmlFor="company-email-domain" className="block text-xs font-medium">Company email domain</label>
        <div className="flex gap-2">
          <input id="company-email-domain" className={`${input} flex-1`} value={domain} onChange={e => setDomain(e.target.value)} placeholder="@company.com" disabled={disabled} required />
          <button className={button} disabled={disabled || !domain.trim()}>Add domain</button>
        </div>
        <p className="text-xs text-muted-foreground">Exact domains only. Add subdomains separately. These are separate from widget website domains.</p>
      </form>
      {state.loading && <p role="status" className="text-xs text-muted-foreground">Loading company access…</p>}
      {state.error && <div role="alert" className="text-xs space-y-2"><p>{state.error}</p><button className={button} disabled={state.busy} onClick={() => { void state.refresh() }}>Refresh access</button></div>}
      {state.data && <>
        <ul className="space-y-2" aria-label="Company email domains">
          {state.data.domains.map(({ domain: value }) => <li key={value} className="flex items-center justify-between gap-3 text-sm">
            <span className="break-all">@{value}</span>
            <button className={button} disabled={disabled} aria-label={`Remove ${value}`} onClick={() => { void state.run(() => api.removeDomain(projectKey, value)) }}>Remove</button>
          </li>)}
        </ul>
        {state.data.domains.length === 0 && <p className="text-xs text-muted-foreground">No company domains configured.</p>}
        <div className="border-t border-border pt-4 space-y-3">
          <h3 className="text-sm font-semibold">Access requests ({state.data.requests.length})</h3>
          {state.data.requests.length === 0 && <p className="text-xs text-muted-foreground">No pending access requests.</p>}
          {state.data.requests.map(request => <RequestRow key={`${request.id}:${request.attempt}`} request={request} disabled={disabled} onReview={review} />)}
        </div>
      </>}
    </div>
  </section>
}

function RequestRow({ request, disabled, onReview }: {
  request: AccessRequest; disabled: boolean
  onReview: (request: AccessRequest, decision: 'approved' | 'declined', role: AccessRole) => Promise<void>
}) {
  const [role, setRole] = useState<AccessRole>('member')
  return <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
    <span className="w-full break-all text-sm">{request.email}</span>
    <select className={input} value={role} onChange={e => setRole(e.target.value as AccessRole)} aria-label={`Access role for ${request.email}`} disabled={disabled}>
      <option value="member">Member</option><option value="guest">Guest</option><option value="admin">Admin</option>
    </select>
    <button className={`${button} bg-primary text-primary-foreground`} disabled={disabled} onClick={() => { void onReview(request, 'approved', role) }} aria-label={`Accept ${request.email}`}>Accept</button>
    <button className={button} disabled={disabled} onClick={() => { void onReview(request, 'declined', role) }} aria-label={`Deny ${request.email}`}>Deny</button>
  </div>
}
