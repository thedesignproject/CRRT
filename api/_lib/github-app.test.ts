import { createHmac, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertGitHubInstallationRepoAccess,
  assertGitHubUserInstallationAccess,
  buildGitHubAppInstallUrl,
  createGitHubAppInstallationToken,
  createGitHubAppInstallState,
  createGitHubAppReuseAuthState,
  createGitHubAppSetupAuthState,
  createGitHubAppJwt,
  createInstallationAccessToken,
  listUserInstallationRepositories,
  verifyGitHubAppInstallationToken,
  verifyGitHubAppInstallState,
  verifyGitHubAppReuseAuthState,
  verifyGitHubAppSetupAuthState,
} from './github-app.js'

const env = { ...process.env }
const originalFetch = globalThis.fetch
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
const installStateType = 'github_app_install_state'
const installationTokenType = 'github_app_installation_token'
const setupAuthStateType = 'github_app_setup_auth_state'
const reuseAuthStateType = 'github_app_reuse_auth_state'

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
      expectedConnectionVersion: 0,
    }, 1000)
    const setupAuthState = createGitHubAppSetupAuthState({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationId: '99',
    }, 1000)
    const reuseAuthState = createGitHubAppReuseAuthState({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationRef: 'opaque-ref',
    }, 1000)

    expect(verifyGitHubAppInstallationToken(setupAuthState, 1000)).toBeNull()
    expect(verifyGitHubAppInstallationToken(installState, 1000)).toBeNull()
    expect(verifyGitHubAppSetupAuthState(installationToken, 1000)).toBeNull()
    expect(verifyGitHubAppInstallState(installationToken, 1000)).toBeNull()
    expect(verifyGitHubAppReuseAuthState(setupAuthState, 1000)).toBeNull()
    expect(verifyGitHubAppSetupAuthState(reuseAuthState, 1000)).toBeNull()

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
    expect(verifyGitHubAppReuseAuthState(legacyToken, 1000)).toBeNull()
  })

  it('signs and verifies installation tokens bound to an installation id', () => {
    const token = createGitHubAppInstallationToken({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
      expectedConnectionVersion: 3,
    }, 1000)
    expect(verifyGitHubAppInstallationToken(token, 1000)).toMatchObject({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
      expectedConnectionVersion: 3,
    })
    const encryptedBody = Buffer.from(token.split('.')[0], 'base64url').toString('utf8')
    expect(encryptedBody).not.toContain('99')
    expect(encryptedBody).not.toContain('installationId')
    expect(verifyGitHubAppInstallationToken(token, 1601)).toBeNull()
    expect(verifyGitHubAppInstallationToken('bad', 1000)).toBeNull()

    const missingInstallationId = createGitHubAppInstallationToken({
      projectKey: 'p',
      userId: 'u',
      installationId: undefined,
      expectedConnectionVersion: 0,
    } as never, 1000)
    expect(verifyGitHubAppInstallationToken(missingInstallationId, 1000)).toBeNull()

    const invalidVersion = createGitHubAppInstallationToken({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
      expectedConnectionVersion: -1,
    }, 1000)
    expect(verifyGitHubAppInstallationToken(invalidVersion, 1000)).toBeNull()

    const unsafeVersion = createGitHubAppInstallationToken({
      projectKey: 'p',
      userId: 'u',
      installationId: '99',
      expectedConnectionVersion: Number.MAX_SAFE_INTEGER + 1,
    }, 1000)
    expect(verifyGitHubAppInstallationToken(unsafeVersion, 1000)).toBeNull()
    expect(verifyGitHubAppInstallationToken(signedInstallStateBody('eA'), 1000)).toBeNull()
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

  it('signs reuse state with only an opaque user-installation reference', () => {
    const state = createGitHubAppReuseAuthState({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationRef: 'opaque-ref',
    }, 1000)
    expect(verifyGitHubAppReuseAuthState(state, 1000)).toMatchObject({
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      installationRef: 'opaque-ref',
    })
    expect(state).not.toContain('installationId')
    expect(verifyGitHubAppReuseAuthState(state, 1601)).toBeNull()

    const missingRef = Buffer.from(JSON.stringify({
      type: reuseAuthStateType,
      projectKey: 'p',
      userId: 'u',
      origin: 'https://app.example',
      nonce: 'n',
      exp: 1600,
    })).toString('base64url')
    expect(verifyGitHubAppReuseAuthState(signedInstallStateBody(missingRef), 1000)).toBeNull()
  })

  it('creates installation access tokens and maps failures', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ token: 'inst-token' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })) as never
    await expect(createInstallationAccessToken('99')).resolves.toBe('inst-token')

    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 })) as never
    await expect(createInstallationAccessToken('99')).rejects.toThrow('github_installation_token_failed')

    globalThis.fetch = vi.fn(async () => new Response('not-json', { status: 201 })) as never
    await expect(createInstallationAccessToken('99')).rejects.toThrow('github_installation_token_failed')

    globalThis.fetch = vi.fn(async () => { throw new Error('secret transport detail') }) as never
    await expect(createInstallationAccessToken('99')).rejects.toThrow('github_installation_token_failed')
  })

  it('verifies repository access with a short-lived installation token', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'inst-token' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) as never

    await expect(assertGitHubInstallationRepoAccess('99', 'acme org', 'widgets/ui')).resolves.toBeUndefined()
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      'https://api.github.com/repos/acme%20org/widgets%2Fui',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer inst-token',
        },
      },
    )
  })

  it('maps installation repository access failures without exposing credentials', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'secret-token' }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 })) as never
    await expect(assertGitHubInstallationRepoAccess('99', 'acme', 'private')).rejects.toThrow(
      'github_installation_repo_inaccessible',
    )

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'secret-token' }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 })) as never
    await expect(assertGitHubInstallationRepoAccess('99', 'acme', 'widgets')).rejects.toThrow(
      'github_installation_repo_lookup_failed',
    )

    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 403 })) as never
    await expect(assertGitHubInstallationRepoAccess('99', 'acme', 'widgets')).rejects.toThrow(
      'github_installation_token_failed',
    )

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'secret-token' }), { status: 201 }))
      .mockRejectedValueOnce(new Error('secret transport detail')) as never
    await expect(assertGitHubInstallationRepoAccess('99', 'acme', 'widgets')).rejects.toThrow(
      'github_installation_repo_lookup_failed',
    )
  })

  it('checks user access to installations across pages', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      const page = new URL(url).searchParams.get('page')
      const installations = page === '1'
        ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }))
        : [{ id: 101, account: { id: 7, login: 'acme', type: 'Organization' } }]
      return new Response(JSON.stringify({ installations }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as never
    await expect(assertGitHubUserInstallationAccess('user-token', '101')).resolves.toEqual({
      id: '7',
      login: 'acme',
      type: 'Organization',
    })

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ installations: [{ id: 1 }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as never
    await expect(assertGitHubUserInstallationAccess('user-token', '99')).rejects.toThrow('github_installation_inaccessible')

    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 })) as never
    await expect(assertGitHubUserInstallationAccess('user-token', '99')).rejects.toThrow('github_user_installations_failed')

    globalThis.fetch = vi.fn(async () => new Response('not-json', { status: 200 })) as never
    await expect(assertGitHubUserInstallationAccess('user-token', '99')).rejects.toThrow('github_user_installations_failed')

    globalThis.fetch = vi.fn(async () => { throw new Error('secret transport detail') }) as never
    await expect(assertGitHubUserInstallationAccess('user-token', '99')).rejects.toThrow('github_user_installations_failed')

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      installations: [{ id: 99, account: { id: 7, login: 'acme', type: 'Bot' } }],
    }), { status: 200 })) as never
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

    globalThis.fetch = vi.fn(async () => new Response('not-json', { status: 200 })) as never
    await expect(listUserInstallationRepositories('user-token', '99')).rejects.toThrow('github_installation_repos_failed')

    globalThis.fetch = vi.fn(async () => { throw new Error('secret transport detail') }) as never
    await expect(listUserInstallationRepositories('user-token', '99')).rejects.toThrow('github_installation_repos_failed')
  })
})
