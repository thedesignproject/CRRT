import { useEffect, useState } from 'react'
import { createExtensionAuthHandoff } from '../api'
import { extensionAuthContinuation, parseExtensionAuthRequest, validateExtensionAuthRedirect } from '../lib/extension-auth'
import { asset } from '../lib/routes'
import { LoginPage } from './LoginPage'
import { Spinner } from './primitives'

const requests = new Map<string, Promise<string>>()

function requestHandoff(apiBase: string, accessToken: string, search: string) {
  const request = parseExtensionAuthRequest(search)
  if (!request) return null
  let pending = requests.get(request.state)
  if (!pending) {
    pending = createExtensionAuthHandoff(apiBase, accessToken, {
      state: request.state,
      codeChallenge: request.codeChallenge,
      redirectUri: request.redirectUri,
    }).then(({ redirectUrl }) => {
      const safeRedirect = validateExtensionAuthRedirect(redirectUrl, request)
      if (!safeRedirect) throw new Error('CRRT returned an invalid extension callback')
      return safeRedirect
    })
    requests.set(request.state, pending)
    void pending.catch(() => requests.delete(request.state))
  }
  return { request, pending }
}

export function ExtensionAuthPage({ apiBase, accessToken }: { apiBase: string; accessToken: string | null }) {
  const [error, setError] = useState<string | null>(null)
  const parsed = parseExtensionAuthRequest(window.location.search)

  useEffect(() => {
    if (!accessToken) return
    const handoff = requestHandoff(apiBase, accessToken, window.location.search)
    if (!handoff) return
    let active = true
    handoff.pending.then((redirectUrl) => {
      if (active) window.location.replace(redirectUrl)
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not connect the extension')
    })
    return () => { active = false }
  }, [accessToken, apiBase])

  if (!parsed) return <ExtensionAuthStatus title="This sign-in link is invalid" detail="Return to the CRRT extension and start again." />
  if (!accessToken) return <LoginPage initialMode={parsed.intent} continuationPath={extensionAuthContinuation()} />
  if (error) return <ExtensionAuthStatus title="Could not connect CRRT" detail={error} />
  return <ExtensionAuthStatus title="Connecting the extension" detail="Keep this window open. You’ll return to Chrome automatically." loading />
}

function ExtensionAuthStatus({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) {
  return (
    <main className="scanlines" style={{ minHeight: '100svh', background: 'var(--background)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section style={{ width: 'min(100%, 420px)', textAlign: 'center' }}>
        <img src={asset('crrt-isologo.png')} alt="" width={48} height={48} style={{ imageRendering: 'pixelated', margin: '0 auto 28px' }} />
        <h1 style={{ margin: '0 0 12px', fontFamily: 'var(--crrt-font-mono)', fontSize: 'clamp(25px, 7vw, 34px)', color: 'var(--foreground)' }}>{title}</h1>
        <p style={{ margin: 0, fontFamily: 'var(--crrt-font-body)', fontSize: 15, lineHeight: 1.6, color: 'var(--muted-foreground)' }}>{detail}</p>
        {loading && <div aria-label="Connecting" style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}><Spinner size={20} /></div>}
      </section>
    </main>
  )
}
