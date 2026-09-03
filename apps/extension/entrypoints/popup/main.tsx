import { FormEvent, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import type { AuthMessage, SessionSummary } from '../../lib/auth'
import './style.css'

type Response = { ok: true; data?: unknown } | { ok: false; error: string }

async function send(message: AuthMessage | { type: 'comment:activate' }) {
  const response = await browser.runtime.sendMessage(message) as Response
  if (!response?.ok) throw new Error(response?.error || 'Extension background is unavailable')
  return response.data
}

export function Popup() {
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => { send({ type: 'auth:get' }).then((value) => setSession(value as SessionSummary | null)).catch((e) => setError(e.message)).finally(() => setBusy(false)) }, [])

  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { setSession(await send({ type: 'auth:sign-in', email, password }) as SessionSummary) }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign in failed') }
    finally { setBusy(false) }
  }

  async function signOut() {
    setBusy(true); setError('')
    try { await send({ type: 'auth:sign-out' }); setSession(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign out failed') }
    finally { setBusy(false) }
  }

  async function activate() {
    setBusy(true); setError('')
    try { await send({ type: 'comment:activate' }); window.close() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start commenting') }
    finally { setBusy(false) }
  }

  if (busy && !session && !error) return <main><p className="eyebrow">CRRT.&gt;_</p><p>Loading…</p></main>
  return <main>
    <p className="eyebrow">CRRT.&gt;_</p><h1>{session ? 'Drop a carrot' : 'Sign in to CRRT'}</h1>
    {session ? <>
      <p className="muted">Signed in as {session.email}</p>
      <button className="primary" disabled={busy} onClick={activate}>Start commenting</button>
      <div className="row"><a href={`${import.meta.env.WXT_DASHBOARD_URL}?view=extension-comments`} target="_blank" rel="noopener noreferrer">Dashboard</a><button className="link" disabled={busy} onClick={signOut}>Sign out</button></div>
    </> : <form onSubmit={signIn}>
      <label>Email<input name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="primary" disabled={busy}>Sign in</button>
      <div className="row"><a href={`${import.meta.env.WXT_DASHBOARD_URL}signup`} target="_blank" rel="noopener noreferrer">Create account</a><a href={`${import.meta.env.WXT_DASHBOARD_URL}forgot-password`} target="_blank" rel="noopener noreferrer">Reset password</a></div>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
  </main>
}

createRoot(document.getElementById('root')!).render(<Popup />)
