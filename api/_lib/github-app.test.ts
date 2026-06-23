import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildGitHubAppInstallUrl,
  createGitHubAppJwt,
  createInstallationAccessToken,
  listInstallationRepositories,
} from './github-app.js'

const env = { ...process.env }
const originalFetch = globalThis.fetch
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()

beforeEach(() => {
  process.env = {
    ...env,
    GITHUB_APP_ID: '123',
    GITHUB_APP_SLUG: 'crrt-test',
    GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
  }
})

afterEach(() => {
  process.env = { ...env }
  globalThis.fetch = originalFetch
})

describe('github app install helpers', () => {
  it('builds install URLs and app JWTs from env', () => {
    expect(buildGitHubAppInstallUrl()).toBe('https://github.com/apps/crrt-test/installations/new')
    const jwt = createGitHubAppJwt(1000)
    expect(jwt.split('.')).toHaveLength(3)

    delete process.env.GITHUB_APP_SLUG
    expect(() => buildGitHubAppInstallUrl()).toThrow('missing_github_app_slug')
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

  it('lists installation repositories across pages', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('/access_tokens')) {
        return new Response(JSON.stringify({ token: 'inst-token' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
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
    const repos = await listInstallationRepositories('99')
    expect(repos).toHaveLength(101)
    expect(repos[0]).toMatchObject({ owner: 'acme', repoUrl: 'https://github.com/acme/repo-0' })
    expect(repos[100]).toMatchObject({ fullName: 'acme/last', private: false })
  })

  it('rejects malformed repository responses', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('/access_tokens')) {
        return new Response(JSON.stringify({ token: 'inst-token' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ repositories: [{ owner: {}, name: 'x' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as never
    await expect(listInstallationRepositories('99')).rejects.toThrow('github_installation_repos_failed')

    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('/access_tokens')) {
        return new Response(JSON.stringify({ token: 'inst-token' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })
    }) as never
    await expect(listInstallationRepositories('99')).rejects.toThrow('github_installation_repos_failed')
  })
})
