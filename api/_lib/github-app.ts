import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createSign,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

const INSTALL_STATE_TTL_SECONDS = 600
const INSTALL_STATE_TYPE = 'github_app_install_state'
const INSTALLATION_TOKEN_TYPE = 'github_app_installation_token'
const SETUP_AUTH_STATE_TYPE = 'github_app_setup_auth_state'
const REUSE_AUTH_STATE_TYPE = 'github_app_reuse_auth_state'

type GitHubAppSignedPayload = {
  type: string
  projectKey: string
  userId: string
  nonce: string
  iat: number
  exp: number
}

export type GitHubAppInstallState = GitHubAppSignedPayload & {
  origin: string
}

export type GitHubAppInstallationToken = GitHubAppSignedPayload & {
  installationId: string
  expectedConnectionVersion: number
}

export type GitHubAppSetupAuthState = GitHubAppSignedPayload & {
  installationId: string
  origin: string
}

export type GitHubAppReuseAuthState = GitHubAppSignedPayload & {
  installationRef: string
  origin: string
}

export type InstalledGitHubRepo = {
  owner: string
  name: string
  fullName: string
  private: boolean
  repoUrl: string
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function privateKey() {
  return requiredEnv('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n')
}

function stateSecret() {
  return requiredEnv('WIDGET_AUTH_SECRET')
}

function signInstallState(body: string) {
  return createHmac('sha256', stateSecret()).update(body).digest('base64url')
}

function installationTokenKey() {
  return createHash('sha256')
    .update(INSTALLATION_TOKEN_TYPE)
    .update('\0')
    .update(stateSecret())
    .digest()
}

function verifiedSignedBody(token: string) {
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra !== undefined) return null

  const expected = signInstallState(body)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return null
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null
  return body
}

function validateSignedPayload<T extends GitHubAppSignedPayload>(
  payload: T,
  expectedType: string,
  nowSeconds: number,
) {
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null
  if (
    payload.type !== expectedType
    || typeof payload.projectKey !== 'string'
    || typeof payload.userId !== 'string'
    || typeof payload.nonce !== 'string'
  ) return null
  return payload
}

export function createGitHubAppInstallState(
  input: Pick<GitHubAppInstallState, 'projectKey' | 'userId' | 'origin'>,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload: GitHubAppInstallState = {
    ...input,
    type: INSTALL_STATE_TYPE,
    nonce: randomBytes(16).toString('base64url'),
    iat: nowSeconds,
    exp: nowSeconds + INSTALL_STATE_TTL_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signInstallState(body)}`
}

function decodeSignedInstallPayload<T extends GitHubAppSignedPayload>(
  token: string,
  expectedType: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const body = verifiedSignedBody(token)
  if (!body) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
    return validateSignedPayload(payload, expectedType, nowSeconds)
  } catch {
    return null
  }
}

function decodeInstallationToken(token: string, nowSeconds: number) {
  const body = verifiedSignedBody(token)
  if (!body) return null

  try {
    const encrypted = Buffer.from(body, 'base64url')
    if (encrypted.length <= 28) return null
    const decipher = createDecipheriv('aes-256-gcm', installationTokenKey(), encrypted.subarray(0, 12))
    decipher.setAAD(Buffer.from(INSTALLATION_TOKEN_TYPE))
    decipher.setAuthTag(encrypted.subarray(12, 28))
    const plaintext = Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()])
    const payload = JSON.parse(plaintext.toString('utf8')) as GitHubAppInstallationToken
    return validateSignedPayload(payload, INSTALLATION_TOKEN_TYPE, nowSeconds)
  } catch {
    return null
  }
}

export function verifyGitHubAppInstallState(
  state: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload = decodeSignedInstallPayload<GitHubAppInstallState>(state, INSTALL_STATE_TYPE, nowSeconds)
  if (!payload || typeof payload.origin !== 'string') return null
  return payload
}

export function createGitHubAppInstallationToken(
  input: Pick<GitHubAppInstallationToken, 'projectKey' | 'userId' | 'installationId' | 'expectedConnectionVersion'>,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload: GitHubAppInstallationToken = {
    ...input,
    type: INSTALLATION_TOKEN_TYPE,
    nonce: randomBytes(16).toString('base64url'),
    iat: nowSeconds,
    exp: nowSeconds + INSTALL_STATE_TTL_SECONDS,
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', installationTokenKey(), iv)
  cipher.setAAD(Buffer.from(INSTALLATION_TOKEN_TYPE))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const body = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
  return `${body}.${signInstallState(body)}`
}

export function createGitHubAppSetupAuthState(
  input: Pick<GitHubAppSetupAuthState, 'projectKey' | 'userId' | 'origin' | 'installationId'>,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload: GitHubAppSetupAuthState = {
    ...input,
    type: SETUP_AUTH_STATE_TYPE,
    nonce: randomBytes(16).toString('base64url'),
    iat: nowSeconds,
    exp: nowSeconds + INSTALL_STATE_TTL_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signInstallState(body)}`
}

export function createGitHubAppReuseAuthState(
  input: Pick<GitHubAppReuseAuthState, 'projectKey' | 'userId' | 'origin' | 'installationRef'>,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload: GitHubAppReuseAuthState = {
    ...input,
    type: REUSE_AUTH_STATE_TYPE,
    nonce: randomBytes(16).toString('base64url'),
    iat: nowSeconds,
    exp: nowSeconds + INSTALL_STATE_TTL_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signInstallState(body)}`
}

export function verifyGitHubAppInstallationToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload = decodeInstallationToken(token, nowSeconds)
  if (
    !payload
    || typeof payload.installationId !== 'string'
    || !Number.isSafeInteger(payload.expectedConnectionVersion)
    || payload.expectedConnectionVersion < 0
  ) return null
  return payload
}

export function verifyGitHubAppSetupAuthState(
  state: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload = decodeSignedInstallPayload<GitHubAppSetupAuthState>(state, SETUP_AUTH_STATE_TYPE, nowSeconds)
  if (!payload || typeof payload.installationId !== 'string' || typeof payload.origin !== 'string') return null
  return payload
}

export function verifyGitHubAppReuseAuthState(
  state: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload = decodeSignedInstallPayload<GitHubAppReuseAuthState>(state, REUSE_AUTH_STATE_TYPE, nowSeconds)
  if (!payload || typeof payload.installationRef !== 'string' || typeof payload.origin !== 'string') return null
  return payload
}

export function buildGitHubAppInstallUrl(state?: string) {
  const url = new URL(`https://github.com/apps/${encodeURIComponent(requiredEnv('GITHUB_APP_SLUG'))}/installations/new`)
  if (state) url.searchParams.set('state', state)
  return url.toString()
}

export function createGitHubAppJwt(nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iat: nowSeconds - 60,
    exp: nowSeconds + 540,
    iss: requiredEnv('GITHUB_APP_ID'),
  }))
  const body = `${header}.${payload}`
  const signature = createSign('RSA-SHA256').update(body).end().sign(privateKey(), 'base64url')
  return `${body}.${signature}`
}

export async function createInstallationAccessToken(installationId: string) {
  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${createGitHubAppJwt()}`,
      },
    },
  )
  const body = await response.json() as { token?: unknown }
  if (!response.ok || typeof body.token !== 'string') {
    throw new Error('github_installation_token_failed')
  }
  return body.token
}

export async function assertGitHubUserInstallationAccess(accessToken: string, installationId: string) {
  let page = 1

  for (;;) {
    const url = new URL('https://api.github.com/user/installations')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}` },
    })
    const body = await response.json() as { installations?: Array<Record<string, unknown>> }
    if (!response.ok || !Array.isArray(body.installations)) {
      throw new Error('github_user_installations_failed')
    }

    if (body.installations.some((installation) => String(installation.id) === installationId)) return
    if (body.installations.length < 100) throw new Error('github_installation_inaccessible')
    page += 1
  }
}

function parseInstalledRepository(repo: Record<string, unknown>) {
  const owner = (repo.owner as { login?: unknown } | undefined)?.login
  const name = repo.name
  const fullName = repo.full_name
  if (typeof owner !== 'string' || typeof name !== 'string' || typeof fullName !== 'string') {
    throw new Error('github_installation_repos_failed')
  }
  return {
    owner,
    name,
    fullName,
    private: repo.private === true,
    repoUrl: `https://github.com/${fullName}`,
  }
}

export async function listUserInstallationRepositories(
  accessToken: string,
  installationId: string,
): Promise<InstalledGitHubRepo[]> {
  const repos: InstalledGitHubRepo[] = []
  let page = 1

  for (;;) {
    const url = new URL(`https://api.github.com/user/installations/${encodeURIComponent(installationId)}/repositories`)
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}` },
    })
    const body = await response.json() as { repositories?: Array<Record<string, unknown>> }
    if (!response.ok || !Array.isArray(body.repositories)) {
      throw new Error('github_installation_repos_failed')
    }

    repos.push(...body.repositories.map(parseInstalledRepository))

    if (body.repositories.length < 100) return repos
    page += 1
  }
}
