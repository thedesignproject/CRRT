import { useCallback, useEffect, useMemo, useState } from 'react'
import { route } from '../lib/routes'
import { LoginPage } from './LoginPage'
import { Spinner } from './primitives'
import { McpSetup } from './McpSetup'
import { BotIcon, ShieldIcon } from './icons'

type Connection = { id: string; scope?: string; mcp_clients: { name: string } }
export function McpAuthPage({ apiBase, accessToken }: { apiBase: string; accessToken: string | null }) {
  const [client, setClient] = useState<{ name: string; redirectUri: string; scope?: string } | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const search = window.location.search
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search])
  const connecting = Boolean(params.client_id)
  const implementation = client?.scope?.split(' ').includes('crrt:implement') ?? false
  const projects = client?.scope?.split(' ').includes('crrt:projects') ?? false
  const review = client?.scope?.split(' ').includes('crrt:review') ?? false
  const request = useCallback(async (action: string, body: unknown) => {
    const response = await fetch(`${apiBase}/mcp/oauth/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error('Could not connect to CRRT. Start again from your MCP client.')
    return response.json()
  }, [accessToken, apiBase])
  useEffect(() => {
    if (!accessToken) return
    let active = true
    setLoading(true); setError('')
    const loading = connecting ? request('consent', { ...params, decision: 'inspect' }) : request('connections', {})
    loading.then(data => { if (active) { if (connecting) setClient(data); else setConnections(data.connections) } }).catch(() => { if (active) setError('Could not load this connection. Start again from your MCP client.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, connecting, params, request])
  if (!accessToken) return <LoginPage continuationPath={`${route('/mcp-auth')}${window.location.search}`} />
  async function decide(decision: 'approve' | 'deny') {
    setBusy(true); setError('')
    try {
      const { redirectUrl } = await request('consent', { ...params, decision })
      const redirect = new URL(redirectUrl)
      const expected = new URL(client!.redirectUri)
      if (redirect.origin !== expected.origin || redirect.pathname !== expected.pathname || redirect.searchParams.get('state') !== params.state) throw new Error('Invalid callback')
      window.location.assign(redirect.href)
    } catch { setError('Could not connect. Please retry.'); setBusy(false) }
  }
  async function revoke(connectionId: string) {
    setBusy(true); setError('')
    try { setConnections((await request('connections', { connectionId })).connections) }
    catch { setError('Could not disconnect. Please retry.') }
    finally { setBusy(false) }
  }
  return <div className="min-h-screen bg-background text-foreground">
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-5 sm:px-8">
      <a href={route('/')} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">← Workspace</a>
      <span className="text-xs text-muted-foreground">Account settings</span>
    </header>
    <main className={`mx-auto w-full px-5 py-8 sm:px-8 sm:py-12 ${connecting ? 'max-w-xl' : 'max-w-5xl'}`}>
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{connecting ? 'Connect to CRRT' : 'MCP connections'}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{connecting ? 'Review what this client can access before connecting.' : 'Bring your projects and feedback into Codex, Claude Code, and other MCP clients.'}</p>
      </div>
      {error && <p role="alert" className="mb-6 rounded-lg border border-border bg-card p-4 text-sm">{error}</p>}
      {connecting ? <section className="space-y-6 rounded-xl border border-border bg-card p-6">
        {loading && <span role="status" aria-label="Loading client"><Spinner size={20} /></span>}
        {client && <>
          <div className="flex items-center gap-3"><span className="rounded-lg border border-border p-3 text-muted-foreground"><BotIcon size={20} /></span><div><p className="font-semibold">{client.name}</p><p className="text-xs text-muted-foreground">Requests access to your CRRT account</p></div></div>
          <div className="space-y-3 border-y border-border py-5">
            <p className="inline-flex items-center gap-2 text-sm font-semibold"><ShieldIcon size={16} /> {implementation || review || projects ? 'Requested permissions' : 'Read-only access'}</p>
            <p className="text-sm leading-6 text-muted-foreground">This client can read projects and feedback you have access to, including screenshot references and implementation context.</p>
            {implementation && <p className="text-sm leading-6 text-muted-foreground">Implementation updates: prepare work sessions, claim accepted feedback, and report presence, progress, blockers, and readiness for testing.</p>}
            {projects && <p className="text-sm leading-6 text-muted-foreground">Project setup: create projects under your account when you request installation, and retrieve widget configuration. Existing project permissions still apply.</p>}
            {review && <p className="text-sm leading-6 text-muted-foreground">Review changes: change review and completion statuses only when you explicitly ask. Your project permissions still apply.</p>}
            <p className="text-sm leading-6 text-muted-foreground">{!implementation && !review && !projects && 'This connection cannot change feedback, statuses, or handoffs. '}Revoke access any time from <a className="underline underline-offset-4" href={route('/mcp-auth')}>MCP connections</a>.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50" type="button" disabled={busy} onClick={() => void decide('approve')}>{implementation || review || projects ? 'Allow access' : 'Allow read access'}</button>
            <button className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50" type="button" disabled={busy} onClick={() => void decide('deny')}>Cancel</button>
          </div>
        </>}
      </section> : <>
        <McpSetup apiBase={apiBase} />
        <section aria-labelledby="mcp-connections-heading" className="mt-8 rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-5"><h2 id="mcp-connections-heading" className="text-base font-semibold">Connected clients</h2><p className="mt-1 text-sm text-muted-foreground">Disconnecting immediately revokes this client’s CRRT access.</p></div>
          {loading && <div role="status" aria-label="Loading connections" className="p-6"><Spinner size={20} /></div>}
          {connections.map(connection => <div key={connection.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4 last:border-b-0">
            <div className="flex items-center gap-3"><BotIcon size={18} /><div><p className="text-sm font-medium">{connection.mcp_clients.name}</p><p className="text-xs text-muted-foreground">Connected · {connection.scope && connection.scope !== 'crrt:read' ? 'Approved updates' : 'Read-only'}</p></div></div>
            <button className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50" type="button" disabled={busy} onClick={() => void revoke(connection.id)}>Disconnect</button>
          </div>)}
          {!loading && !error && !connections.length && <div className="px-6 py-8"><p className="text-sm font-medium">No active connections.</p><p className="mt-1 text-sm text-muted-foreground">Follow the steps above. Your client will appear here after you authorize it.</p></div>}
        </section>
      </>}
    </main>
  </div>
}
