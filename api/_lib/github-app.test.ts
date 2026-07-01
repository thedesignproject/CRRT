import { createHmac, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertGitHubUserInstallationAccess,
  buildGitHubAppInstallUrl,
  createGitHubAppInstallationToken,
  createGitHubAppInstallState,
  createGitHubAppSetupAuthState,
  createGitHubAppJwt,
  createInstallationAccessToken,
  listUserInstallationRepositories,
  verifyGitHubAppInstallationToken,
  verifyGitHubAppInstallState,
  verifyGitHubAppSetupAuthState,
} from './github-app.js'

const env = { ...process.env }
const originalFetch = globalThis.fetch
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
const installStateType = 'github_app_install_state'
const installationTokenType = 'github_app_installation_token'
const setupAuthStateType = 'github_app_setup_auth_state'

function signedInstallStateBody(body: string) {
  const signature = createHmac('sha256', 'state-secret').update(body).digest('base64url')
  return `${body}.${signature}`
}

beforeEach(() => {
  process.env = {
    ...env,
    GITHUB_APP_ID: '123',
    GITHUB_APP_SLUG: 'crrt-test',
    GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
    WIDGET_AUTH_SECRET: 'state-secret',
  }
})

afterEach(() => {
  process.env = { ...env }
  globalThis.fetch = originalFetch
})

describe('github app install helpers', () => {
  it('builds install URLs and app JWTs from env', () => {
    expect(buildGitHubAppInstallUrl()).toBe('https://github.com/apps/crrt-test/installations/new')
    expect(buildGitHubAppInstallUrl('install-state')).toBe(
      'https://github.com/apps/crrt-test/installations/new?state=install-state',
    )
    const jwt = createGitHubAppJwt(1000)
    expect(jwt.split('.')).toHaveLength(3)

    delete process.env.GITHUB_APP_SLUG
    expect(() => buildGitHubAppInstallUrl()).toThrow('missing_github_app_slug')
  })

  it('signs and verifies expiring install state', () => {
    const state = createGitHubAppInstallState({ projectKey: 'p', userId: 'u', origin: 'https://app.example' }, 1000)
    expect(verifyGitHubAppInstallState(state, 1000)).toMatchObject({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
    })
    expect(verifyGitHubAppInstallState(state, 1601)).toBeNull()
    const [body, signature] = state.split('.')
    expect(verifyGitHubAppInstallState(`${state}x`, 1000)).toBeNull()
    const replacement = signature[signature.length - 1] === 'a' ? 'b' : 'a'
    expect(verifyGitHubAppInstallState(`${body}.${signature.slice(0, -1)}${replacement}`, 1000)).toBeNull()
    expect(verifyGitHubAppInstallState('bad', 1000)).toBeNull()

    const missingNonce = Buffer.from(JSON.stringify({
      type: installStateType,
      projectKey: 'p',
      userId: 'u',
      exp: 1600,
    })).toString('base64url')
    expect(verifyGitHubAppInstallState(signedInstallStateBody(missingNonce), 1000)).toBeNull()

    const missingOrigin = Buffer.from(JSON.stringify({
      type: installStateType,
      projectKey: 'p',
      userId: 'u',
      nonce: 'n',
      exp: 1600,
    })).toString('base64url')
    expect(verifyGitHubAppInstallState(signedInstallStateBody(missingOrigin), 1000)).toBeNull()

    const malformedJson = Buffer.from('{').toString('base64url')
    expect(verifyGitHubAppInstallState(signedInstallStateBody(malformedJson), 1000)).toBeNull()
  })

  it('rejects signed GitHub App payloads with the wrong token purpose', () => {
    const installState = createGitHubAppInstallState({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
    }, 1000)
    const installationToken = createGitHubAppInstallationToken({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
    }, 1000)
    const setupAuthState = createGitHubAppSetupAuthState({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationId: '99',
    }, 1000)

    expect(verifyGitHubAppInstallationToken(setupAuthState, 1000)).toBeNull()
    expect(verifyGitHubAppInstallationToken(installState, 1000)).toBeNull()
    expect(verifyGitHubAppSetupAuthState(installationToken, 1000)).toBeNull()
    expect(verifyGitHubAppInstallState(installationToken, 1000)).toBeNull()

    const legacyPayload = Buffer.from(JSON.stringify({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
      origin: 'https://app.example',
      nonce: 'n',
      exp: 1600,
    })).toString('base64url')
    const legacyToken = signedInstallStateBody(legacyPayload)
    expect(verifyGitHubAppInstallationToken(legacyToken, 1000)).toBeNull()
    expect(verifyGitHubAppSetupAuthState(legacyToken, 1000)).toBeNull()
    expect(verifyGitHubAppInstallState(legacyToken, 1000)).toBeNull()
  })

  it('signs and verifies installation tokens bound to an installation id', () => {
    const token = createGitHubAppInstallationToken({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
    }, 1000)
    expect(verifyGitHubAppInstallationToken(token, 1000)).toMatchObject({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
    })
    expect(verifyGitHubAppInstallationToken(token, 1601)).toBeNull()

    const missingInstallationId = Buffer.from(JSON.stringify({
      type: installationTokenType,
      projectKey: 'p',
      userId: 'u',
      nonce: 'n',
      exp: 1600,
    })).toString('base64url')
    expect(verifyGitHubAppInstallationToken(signedInstallStateBody(missingInstallationId), 1000)).toBeNull()
  })

  it('signs and verifies setup auth state for GitHub user verification', () => {
    const state = createGitHubAppSetupAuthState({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationId: '99',
    }, 1000)
    expect(verifyGitHubAppSetupAuthState(state, 1000)).toMatchObject({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationId: '99',
    })
    expect(verifyGitHubAppSetupAuthState(state, 1601)).toBeNull()

    const missingOrigin = Buffer.from(JSON.stringify({
      type: setupAuthStateType,
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
      nonce: 'n',
      exp: 1600,
    })).toString('base64url')
    expect(verifyGitHubAppSetupAuthState(signedInstallStateBody(missingOrigin), 1000)).toBeNull()
  })

  it('creates installation access tokens and maps failures', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ token: 'inst-token' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })) as never
    await expect(createInstallationAccessToken('99')).resolves.toBe('inst-token')

    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 })) as never
    await expect(createInstallationAccessToken('99')).rejects.toThrow('github_installation_token_failed')
  })

  it('checks user access to installations across pages', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      const page = new URL(url).searchParams.get('page')
      const installations = page === '1'
        ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }))
        : [{ id: 101 }]
      return new Response(JSON.stringify({ installations }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as never
    await expect(assertGitHubUserInstallationAccess('user-token', '101')).resolves.toBeUndefined()

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ installations: [{ id: 1 }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as never
    await expect(assertGitHubUserInstallationAccess('user-token', '99')).rejects.toThrow('github_installation_inaccessible')

    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 })) as never
    await expect(assertGitHubUserInstallationAccess('user-token', '99')).rejects.toThrow('github_user_installations_failed')
  })

  it('lists user-accessible installation repositories across pages', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      const page = new URL(url).searchParams.get('page')
      const repositories = page === '1'
        ? Array.from({ length: 100 }, (_, i) => ({
            owner: { login: 'acme' },
            name: `repo-${i}`,
            full_name: `acme/repo-${i}`,
            private: i % 2 === 0,
          }))
        : [{ owner: { login: 'acme' }, name: 'last', full_name: 'acme/last', private: false }]
      return new Response(JSON.stringify({ repositories }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as never
    const repos = await listUserInstallationRepositories('user-token', '99')
    expect(repos).toHaveLength(101)
    expect(repos[0]).toMatchObject({ owner: 'acme', repoUrl: 'https://github.com/acme/repo-0' })
    expect(repos[100]).toMatchObject({ fullName: 'acme/last', private: false })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user/installations/99/repositories?per_page=100&page=1',
      { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer user-token' } },
    )
  })

  it('rejects malformed user repository responses', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ repositories: [{ owner: {}, name: 'x' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as never
    await expect(listUserInstallationRepositories('user-token', '99')).rejects.toThrow('github_installation_repos_failed')

    globalThis.fetch = vi.fn(async () => {
      return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })
    }) as never
    await expect(listUserInstallationRepositories('user-token', '99')).rejects.toThrow('github_installation_repos_failed')
  })
})
