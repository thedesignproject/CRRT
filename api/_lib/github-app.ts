import { createSign } from 'node:crypto'

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

export function buildGitHubAppInstallUrl() {
  return `https://github.com/apps/${encodeURIComponent(requiredEnv('GITHUB_APP_SLUG'))}/installations/new`
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

export async function listInstallationRepositories(installationId: string): Promise<InstalledGitHubRepo[]> {
  const token = await createInstallationAccessToken(installationId)
  const repos: InstalledGitHubRepo[] = []
  let page = 1

  for (;;) {
    const url = new URL('https://api.github.com/installation/repositories')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    })
    const body = await response.json() as { repositories?: Array<Record<string, unknown>> }
    if (!response.ok || !Array.isArray(body.repositories)) {
      throw new Error('github_installation_repos_failed')
    }

    repos.push(...body.repositories.map((repo) => {
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
    }))

    if (body.repositories.length < 100) return repos
    page += 1
  }
}
