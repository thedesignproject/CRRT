import { route } from './routes'

const PROOF_256 = /^[A-Za-z0-9_-]{43}$/
const CHROME_REDIRECT = /^https:\/\/[a-p]{32}\.chromiumapp\.org\/crrt-auth$/

export type ExtensionAuthRequest = {
  state: string
  codeChallenge: string
  redirectUri: string
  intent: 'signin' | 'signup'
}

export function parseExtensionAuthRequest(search: string): ExtensionAuthRequest | null {
  const params = new URLSearchParams(search)
  const state = params.get('state') ?? ''
  const codeChallenge = params.get('code_challenge') ?? ''
  const redirectUri = params.get('redirect_uri') ?? ''
  const intent = params.get('intent') === 'signup' ? 'signup' : 'signin'
  if (!PROOF_256.test(state) || !PROOF_256.test(codeChallenge) || !CHROME_REDIRECT.test(redirectUri)) return null
  return { state, codeChallenge, redirectUri, intent }
}

export function extensionAuthContinuation(): string {
  return `${window.location.pathname}${window.location.search}`
}

export function extensionAuthRecoveryDestination(search: string, origin: string): string | null {
  const continuation = new URLSearchParams(search).get('continue')
  if (!continuation) return null
  try {
    const url = new URL(continuation, origin)
    if (url.origin !== origin || url.pathname !== route('/extension-auth') || !parseExtensionAuthRequest(url.search)) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

export function validateExtensionAuthRedirect(redirectUrl: string, request: ExtensionAuthRequest): string {
  try {
    const actual = new URL(redirectUrl)
    const expected = new URL(request.redirectUri)
    const keys = [...actual.searchParams.keys()]
    if (
      actual.origin !== expected.origin
      || actual.pathname !== expected.pathname
      || actual.hash
      || keys.length !== 2
      || !keys.includes('code')
      || !keys.includes('state')
      || !PROOF_256.test(actual.searchParams.get('code') ?? '')
      || actual.searchParams.get('state') !== request.state
    ) return ''
    return actual.href
  } catch {
    return ''
  }
}
