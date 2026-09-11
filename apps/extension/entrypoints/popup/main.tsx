import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import type { AuthMessage, SessionSummary } from '../../lib/auth'
import type { HostedAuthMessage } from '../../lib/hosted-auth'
import { listExtensionProjects } from '../../lib/comments-api'
import { acceptDisclosure, hasAcceptedDisclosure, publicCrrtUrl } from '../../lib/disclosure'
import {
  getCurrentTabUrl,
  matchingProjects,
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
  const [disclosureAccepted, setDisclosureAccepted] = useState<boolean | null>(null)
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [projects, setProjects] = useState<ExtensionProject[]>([])
  const [activeProject, setActiveProjectState] = useState<ExtensionProjectSelection | null>(null)
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [pageState, setPageState] = useState<'matched' | 'none' | 'ambiguous' | 'restricted'>('none')

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
    setPageState(!currentPageUrl ? 'restricted' : selected ? 'matched' : matchingProjects(currentPageUrl, available).length > 1 ? 'ambiguous' : 'none')
  }

  useEffect(() => {
    hasAcceptedDisclosure()
      .then(async (accepted) => {
        setDisclosureAccepted(accepted)
        if (accepted) await loadWorkspace(await send({ type: 'auth:get' }) as SessionSummary | null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load CRRT'))
      .finally(() => setBusy(false))
  }, [])

  async function continueAfterDisclosure() {
    setBusy(true); setError('')
    try {
      await acceptDisclosure()
      setDisclosureAccepted(true)
      await loadWorkspace(await send({ type: 'auth:get' }) as SessionSummary | null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your choice')
    } finally { setBusy(false) }
  }

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

  if ((busy || disclosureAccepted === null) && !session && !error) return <main><p className="eyebrow">CRRT.&gt;_</p><p>Loading…</p></main>
  if (!disclosureAccepted) return <Disclosure busy={busy} error={error} onContinue={() => { void continueAfterDisclosure() }} />
  return <main>
    <p className="eyebrow">CRRT.&gt;_</p><h1>{session ? 'Drop a carrot' : 'Sign in to CRRT'}</h1>
    {session ? <>
      <p className="muted">Signed in as {session.email}</p>
      <div className="context" aria-label="Current feedback context">
        <p><span>Page</span>{pageUrl ? new URL(pageUrl).hostname : 'Unavailable in Chrome'}</p>
        <p><span>Audience</span>{activeProject ? 'Project collaborators' : 'Only you'}</p>
      </div>
      <label>Feedback destination
        <select aria-label="Feedback destination" value={activeProject?.publicKey ?? ''} disabled={busy} onChange={(event) => { void chooseProject(event.target.value) }}>
          <option value="">Private</option>
          {projects.map((project) => <option key={project.publicKey} value={project.publicKey}>{project.name}</option>)}
        </select>
      </label>
      {pageState === 'ambiguous' && !activeProject && <p className="notice">More than one project matches this page. Choose the destination.</p>}
      {pageState === 'none' && projects.length === 0 && <p className="notice">No shared projects yet. You can still leave private feedback.</p>}
      {pageState === 'restricted' && <p className="notice">Open a regular website to start commenting.</p>}
      <button className="primary" disabled={busy || !pageUrl} onClick={activate}>Start commenting</button>
      <div className="row"><a href={`${import.meta.env.WXT_DASHBOARD_URL}?view=extension-comments`} target="_blank" rel="noopener noreferrer">Dashboard</a><button className="link" disabled={busy} onClick={signOut}>Sign out</button></div>
    </> : <div className="auth-actions">
      <p className="muted">Use your CRRT account in a secure browser window. Your password stays out of the extension.</p>
      <button className="primary" disabled={busy} onClick={() => { void signIn('signin') }}>Sign in with CRRT</button>
      <button className="secondary" disabled={busy} onClick={() => { void signIn('signup') }}>Create account</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
  </main>
}

function Disclosure({ busy, error, onContinue }: { busy: boolean; error: string; onContinue: () => void }) {
  return <main>
    <p className="eyebrow">CRRT.&gt;_</p>
    <h1>Before you drop a carrot</h1>
    <p className="muted">CRRT acts only when you open it and choose to comment.</p>
    <ul>
      <li>We read the current URL to find an authorized project.</li>
      <li>Page content and screenshots are captured only after your feedback action.</li>
      <li>The microphone starts only when you press it and Chrome supports local speech input.</li>
      <li>Project feedback is shared with project collaborators. Private feedback stays yours.</li>
      <li>Tracker drafts are sent only after an authorized collaborator confirms them.</li>
    </ul>
    <button className="primary" disabled={busy} onClick={onContinue}>I understand — continue</button>
    <div className="row"><a href={publicCrrtUrl('/privacy')} target="_blank" rel="noopener noreferrer">Privacy</a><a href={publicCrrtUrl('/support')} target="_blank" rel="noopener noreferrer">Support</a></div>
    {error && <p className="error" role="alert">{error}</p>}
  </main>
}

createRoot(document.getElementById('root')!).render(<Popup />)
