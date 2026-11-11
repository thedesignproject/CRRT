import { useEffect, useState } from 'react'
import { route } from '../lib/routes'
import { LoginPage } from './LoginPage'
import { Spinner } from './primitives'

export const DASHBOARD_PERMISSION_DESCRIPTION = 'Read and manage your projects, feedback, inbox, repository settings, members, invitations, access rules, integrations, external work, shares, recordings, audits, notifications, MCP connections, and billing flows. Administrative views require your actual administrator role. Your project roles, ownership, plan limits, and feature availability still apply.'

type Upgrade = { name: string; state: 'pending' | 'approved' | 'declined' | 'expired'; bundle: string }
export function McpDashboardUpgrade({ apiBase, accessToken, requestId }: { apiBase: string; accessToken: string | null; requestId: string }) {
  const [upgrade, setUpgrade] = useState<Upgrade | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!accessToken) return
    let active = true
    setUpgrade(null); setError('')
    fetch(`${apiBase}/mcp/oauth/dashboard-upgrade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ requestId, decision: 'inspect' }),
    }).then(async response => {
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (active) setUpgrade(data)
    }).catch(() => { if (active) setError('This permission request is unavailable. Sign in to the CRRT account connected to your agent, or ask the agent for a new link.') })
    return () => { active = false }
  }, [apiBase, accessToken, requestId])
  if (!accessToken) return <LoginPage continuationPath={`${route('/mcp-auth')}?${new URLSearchParams({ upgrade: requestId })}`} />
  async function decide(decision: 'approve' | 'deny') {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${apiBase}/mcp/oauth/dashboard-upgrade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ requestId, decision }),
      })
      if (!response.ok) throw new Error()
      setUpgrade(await response.json())
    } catch { setError('Could not update permissions. Retry this request; your existing connection remains available.') }
    finally { setBusy(false) }
  }
  return <main className="mx-auto max-w-xl space-y-6 px-5 py-12 text-foreground">
    <a className="text-sm text-muted-foreground underline" href={route('/mcp-auth')}>MCP connections</a>
    <h1 className="text-2xl font-semibold">Upgrade CRRT permissions</h1>
    {error && <p role="alert" className="rounded-lg border border-border p-4 text-sm">{error}</p>}
    {!upgrade && !error && <span role="status" aria-label="Loading permission request"><Spinner size={20} /></span>}
    {upgrade && <section className="space-y-5 rounded-xl border border-border bg-card p-6">
      <p className="font-semibold">{upgrade.name}</p>
      {upgrade.state === 'pending' ? <>
        <p className="text-sm">Approve the complete dashboard suite once for this connected client.</p>
        <p className="text-sm leading-6 text-muted-foreground">{DASHBOARD_PERMISSION_DESCRIPTION}</p>
        <p className="text-sm leading-6 text-muted-foreground">This includes requested deletions, membership changes, and sending work to connected services. Payment and third-party consent steps remain in your browser. It does not enable automatic implementation, merge, or deployment.</p>
        <p className="text-sm leading-6 text-muted-foreground">Your existing connection stays in place. Approval covers all features in this bundle; you will not approve each feature separately. You can revoke access from MCP connections.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void decide('approve')} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Approve full dashboard access</button>
          <button type="button" disabled={busy} onClick={() => void decide('deny')} className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50">Keep existing permissions</button>
        </div>
      </> : <p role="status" className="text-sm leading-6">{upgrade.state === 'approved' ? 'Permissions upgraded. Return to your agent to continue. No reinstall or new setup is needed.' : upgrade.state === 'declined' ? 'Existing permissions kept. Your connection still works.' : 'This request expired. Ask your agent for a new permission link; no reinstall is needed.'}</p>}
    </section>}
  </main>
}
