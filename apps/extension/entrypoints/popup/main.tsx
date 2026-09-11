import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import type { AuthMessage, SessionSummary } from '../../lib/auth'
import type { HostedAuthMessage } from '../../lib/hosted-auth'
import { listExtensionProjects } from '../../lib/comments-api'
import {
  getCurrentTabUrl,
  resolveProjectForPage,
  setActiveProject,
  setProjectForPage,
  type ExtensionProject,
  type ExtensionProjectSelection,
} from '../../lib/project-context'
import './style.css'

type Response = { ok: true; data?: unknown } | { ok: false; error: string }

async function send(message: AuthMessage | HostedAuthMessage | { type: 'comment:activate' }) {
  const response = await browser.runtime.sendMessage(message) as Response
  if (!response?.ok) throw new Error(response?.error || 'Extension background is unavailable')
  return response.data
}

export function Popup() {
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [projects, setProjects] = useState<ExtensionProject[]>([])
  const [activeProject, setActiveProjectState] = useState<ExtensionProjectSelection | null>(null)
  const [pageUrl, setPageUrl] = useState<string | null>(null)

  async function loadWorkspace(nextSession: SessionSummary | null) {
    setSession(nextSession)
    if (!nextSession) {
      setProjects([])
      setActiveProjectState(null)
      return
    }
    const [available, currentPageUrl] = await Promise.all([listExtensionProjects(), getCurrentTabUrl()])
    const selected = currentPageUrl ? await resolveProjectForPage(currentPageUrl, available) : null
    setProjects(available)
    setPageUrl(currentPageUrl)
    setActiveProjectState(selected)
  }

  useEffect(() => {
    send({ type: 'auth:get' })
      .then((value) => loadWorkspace(value as SessionSummary | null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load CRRT'))
      .finally(() => setBusy(false))
  }, [])

  async function signIn(intent: HostedAuthMessage['intent']) {
    setBusy(true); setError('')
    try { await loadWorkspace(await send({ type: 'auth:hosted-sign-in', intent }) as SessionSummary) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open CRRT sign-in') }
    finally { setBusy(false) }
  }

  async function signOut() {
    setBusy(true); setError('')
    try { await send({ type: 'auth:sign-out' }); await setActiveProject(null); await loadWorkspace(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign out failed') }
    finally { setBusy(false) }
  }

  async function activate() {
    setBusy(true); setError('')
    try { await send({ type: 'comment:activate' }); window.close() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start commenting') }
    finally { setBusy(false) }
  }

  async function chooseProject(publicKey: string) {
    const next = projects.find((project) => project.publicKey === publicKey) ?? null
    const selection = next ? {
      publicKey: next.publicKey,
      name: next.name,
      ...(next.role ? { role: next.role } : {}),
      ...(next.capabilities ? { capabilities: next.capabilities } : {}),
    } : null
    setBusy(true); setError('')
    try {
      if (pageUrl) await setProjectForPage(pageUrl, selection)
      else await setActiveProject(selection)
      setActiveProjectState(selection)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save feedback destination')
    } finally {
      setBusy(false)
    }
  }

  if (busy && !session && !error) return <main><p className="eyebrow">CRRT.&gt;_</p><p>Loading…</p></main>
  return <main>
    <p className="eyebrow">CRRT.&gt;_</p><h1>{session ? 'Drop a carrot' : 'Sign in to CRRT'}</h1>
    {session ? <>
      <p className="muted">Signed in as {session.email}</p>
      <label>Feedback destination
        <select aria-label="Feedback destination" value={activeProject?.publicKey ?? ''} disabled={busy} onChange={(event) => { void chooseProject(event.target.value) }}>
          <option value="">Private</option>
          {projects.map((project) => <option key={project.publicKey} value={project.publicKey}>{project.name}</option>)}
        </select>
      </label>
      <button className="primary" disabled={busy} onClick={activate}>Start commenting</button>
      <div className="row"><a href={`${import.meta.env.WXT_DASHBOARD_URL}?view=extension-comments`} target="_blank" rel="noopener noreferrer">Dashboard</a><button className="link" disabled={busy} onClick={signOut}>Sign out</button></div>
    </> : <div className="auth-actions">
      <p className="muted">Use your CRRT account in a secure browser window. Your password stays out of the extension.</p>
      <button className="primary" disabled={busy} onClick={() => { void signIn('signin') }}>Sign in with CRRT</button>
      <button className="secondary" disabled={busy} onClick={() => { void signIn('signup') }}>Create account</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
  </main>
}

createRoot(document.getElementById('root')!).render(<Popup />)
