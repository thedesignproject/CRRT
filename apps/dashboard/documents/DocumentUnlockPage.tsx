import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { LockKeyhole } from 'lucide-react'
import { LoginPage } from '../components/LoginPage'
import { Spinner } from '../components/primitives'
import { asset, route } from '../lib/routes'
import { DocumentRequestError, documentMessage } from './client'
import './documents.css'

type Approval = { clientName: string; shareKey: string; status: 'pending' | 'approved' }
function message(error: unknown) {
  if (error instanceof DocumentRequestError) {
    if (error.code === 'connection_unavailable') return 'Sign in with the CRRT account that connected this agent, or start again from your agent.'
    if (error.code === 'unlock_request_expired') return 'This unlock request expired. Ask your agent to start a new one.'
    if (error.code === 'unlock_request_changed') return 'This request changed. Reload to check its status.'
  }
  return documentMessage(error)
}

function subscribeToTicket(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
export function DocumentUnlockPage(props: { apiBase: string; accessToken: string | null }) {
  const hash = useSyncExternalStore(subscribeToTicket, () => window.location.hash)
  return <DocumentUnlockRequest key={hash} {...props} hash={hash} />
}
function DocumentUnlockRequest({ apiBase, accessToken, hash }: { apiBase: string; accessToken: string | null; hash: string }) {
  const ticket = useMemo(() => Object.fromEntries(new URLSearchParams(hash.slice(1))), [hash])
  const [approval, setApproval] = useState<Approval>(), [password, setPassword] = useState(''), [error, setError] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0)
  const context = useMemo(() => ({}), [apiBase, accessToken]), active = useRef(context)
  active.current = context
  const request = useCallback(async (fields: object) => {
    const response = await fetch(`${apiBase}/mcp/document-unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ requestId: ticket.requestId, proof: ticket.proof, ...fields }) })
    const result = await response.json()
    if (!response.ok) throw new DocumentRequestError(result.error)
    return result
  }, [apiBase, accessToken, ticket])
  useEffect(() => {
    let mounted = true
    setApproval(undefined); setPassword(''); setError(''); setBusy(false); setLoading(true)
    if (!accessToken) return
    if (!ticket.requestId || !ticket.proof) { setError('This unlock link is incomplete. Ask your agent for a new one.'); setLoading(false); return }
    request({ action: 'inspect' }).then(result => { if (mounted) setApproval(result) })
      .catch(error => { if (mounted) setError(message(error)) }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [accessToken, request, ticket, refresh])
  useEffect(() => () => { active.current = {} }, [])
  async function approve(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await request({ action: 'approve', password })
      if (active.current === context) { setPassword(''); setApproval(current => ({ ...current!, status: 'approved' })) }
    } catch (error) { if (active.current === context) setError(message(error)) }
    finally { if (active.current === context) setBusy(false) }
  }
  if (!accessToken) return <LoginPage continuationPath={`${route('/document-unlock')}${window.location.hash}`} />
  return <div className="min-h-screen bg-background text-foreground">
    <header className="document-header"><a href={route('/')} className="inline-flex items-center gap-2 text-sm font-semibold"><img src={asset('crrt-isologo.png')} width={24} height={24} alt="" />CRRT</a><span className="text-xs text-muted-foreground">Document access</span></header>
    <main className="mx-auto max-w-lg space-y-6 px-6 py-12">
      <LockKeyhole size={24} className="text-muted-foreground" />
      <h1 className="text-2xl font-semibold tracking-tight">{approval?.status === 'approved' ? 'Document unlocked' : 'Unlock for your agent'}</h1>
      {loading && <div role="status" aria-label="Loading unlock request"><Spinner /></div>}
      {error && <p role="alert" className="text-sm leading-6 text-status-rejected">{error}</p>}
      {approval?.status === 'approved' ? <p className="text-sm leading-6 text-muted-foreground">Return to {approval.clientName}. Your agent can continue. The password was not sent to it.</p> : approval && <form className="space-y-5" onSubmit={event => void approve(event)}>
        <p className="text-sm leading-6">Allow <strong>{approval.clientName}</strong> to read the published document and its feedback. This grants access only to this connection for up to one hour.</p>
        <a className="document-text-button" href={route('/doc/' + approval.shareKey)} target="_blank" rel="noreferrer">View document link</a>
        <label className="block text-sm font-medium">Document password<input className="document-input mt-2" type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        <p className="text-xs leading-5 text-muted-foreground">CRRT checks the password privately. Your agent receives access, not the password. Changing document access invalidates this grant.</p>
        <button className="dashboard-bulk-primary" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock for this connection'}</button>
      </form>}
      {!loading && !approval && <button type="button" className="dashboard-bulk-secondary" onClick={() => setRefresh(n => n + 1)}>Try again</button>}
    </main>
  </div>
}
