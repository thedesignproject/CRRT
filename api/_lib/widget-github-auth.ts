import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const DEFAULT_TTL_SECONDS = 28_800
const MIN_TTL_SECONDS = 300
const MAX_TTL_SECONDS = 604_800
const STATE_TTL_SECONDS = 600

export type WidgetAuthTokenPayload = {
  projectKey: string
  githubUserId: string
  githubLogin: string
  githubOwner: string
  githubRepo: string
  iat: number
  exp: number
}

export type WidgetGithubState = {
  projectKey: string
  origin: string
  nonce: string
  iat: number
  exp: number
}

export type GitHubUser = { id: string; login: string }

function getSecret() {
  const value = process.env.WIDGET_AUTH_SECRET
  if (!value) throw new Error('missing_widget_auth_secret')
  return value
}

function sign(body: string) {
  return createHmac('sha256', getSecret()).update(body).digest('base64url')
}

function encodeSignedJson(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

function decodeSignedJson<T>(token: string): T | null {
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra !== undefined) return null
  const expected = sign(body)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return null
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export function getWidgetAuthTtlSeconds() {
  const parsed = Number(process.env.WIDGET_AUTH_TTL_SECONDS)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_SECONDS
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(parsed)))
}

export function createWidgetAuthToken(
  input: Omit<WidgetAuthTokenPayload, 'iat' | 'exp'>,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  return encodeSignedJson({
    ...input,
    iat: nowSeconds,
    exp: nowSeconds + getWidgetAuthTtlSeconds(),
  })
}

export function verifyWidgetAuthToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload = decodeSignedJson<WidgetAuthTokenPayload>(token)
  if (!payload || typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null
  if (
    typeof payload.projectKey !== 'string'
    || typeof payload.githubUserId !== 'string'
    || typeof payload.githubLogin !== 'string'
    || typeof payload.githubOwner !== 'string'
    || typeof payload.githubRepo !== 'string'
  ) return null
  return payload
}

export function createWidgetGithubState(
  input: Pick<WidgetGithubState, 'projectKey' | 'origin'>,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  return encodeSignedJson({
    ...input,
    nonce: randomBytes(16).toString('base64url'),
    iat: nowSeconds,
    exp: nowSeconds + STATE_TTL_SECONDS,
  })
}

export function verifyWidgetGithubState(
  state: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload = decodeSignedJson<WidgetGithubState>(state)
  if (!payload || typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null
  if (
    typeof payload.projectKey !== 'string'
    || typeof payload.origin !== 'string'
    || typeof payload.nonce !== 'string'
  ) return null
  return payload
}

export function buildGitHubAuthorizeUrl(state: string) {
  const clientId = process.env.GITHUB_APP_CLIENT_ID
  if (!clientId) throw new Error('missing_github_app_client_id')
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeGitHubCode(code: string) {
  const clientId = process.env.GITHUB_APP_CLIENT_ID
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('missing_github_app_credentials')
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })
  const body = await response.json() as { access_token?: unknown }
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error('github_code_exchange_failed')
  }
  return body.access_token
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}` },
  })
  const body = await response.json() as { id?: unknown; login?: unknown }
  if (!response.ok || body.id === undefined || typeof body.login !== 'string') {
    throw new Error('github_user_lookup_failed')
  }
  return { id: String(body.id), login: body.login }
}

export async function assertGitHubRepoAccess(accessToken: string, owner: string, repo: string) {
  const path = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const response = await fetch(`https://api.github.com/repos/${path}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'github_repo_inaccessible' : 'github_repo_lookup_failed')
  }
}

export function widgetCallbackHtml(origin: string, message: Record<string, unknown>) {
  const safeMessage = JSON.stringify(message).replace(/</g, '\\u003c')
  return `<!doctype html><meta charset="utf-8"><script>
const message = ${safeMessage};
if (window.opener) window.opener.postMessage(message, ${JSON.stringify(origin)});
window.close();
</script>`
}
