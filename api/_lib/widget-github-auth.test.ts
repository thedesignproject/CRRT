import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertGitHubRepoAccess,
  buildGitHubAuthorizeUrl,
  createWidgetAuthToken,
  createWidgetGithubState,
  exchangeGitHubCode,
  getGitHubUser,
  getWidgetAuthTtlSeconds,
  verifyWidgetAuthToken,
  verifyWidgetGithubState,
  widgetCallbackHtml,
} from './widget-github-auth.js'

const env = { ...process.env }
const originalFetch = globalThis.fetch

beforeEach(() => {
  process.env = { ...env, WIDGET_AUTH_SECRET: 'secret', GITHUB_APP_CLIENT_ID: 'client', GITHUB_APP_CLIENT_SECRET: 'client-secret' }
})

afterEach(() => {
  process.env = { ...env }
  globalThis.fetch = originalFetch
})

describe('widget github auth tokens', () => {
  const input = {
    projectKey: 'p',
    githubUserId: '42',
    githubLogin: 'octo',
    githubOwner: 'acme',
    githubRepo: 'widgets',
  }

  it('defaults and clamps token TTL', () => {
    delete process.env.WIDGET_AUTH_TTL_SECONDS
    expect(getWidgetAuthTtlSeconds()).toBe(28_800)
    process.env.WIDGET_AUTH_TTL_SECONDS = '60'
    expect(getWidgetAuthTtlSeconds()).toBe(300)
    process.env.WIDGET_AUTH_TTL_SECONDS = '9999999'
    expect(getWidgetAuthTtlSeconds()).toBe(604_800)
    process.env.WIDGET_AUTH_TTL_SECONDS = '900.9'
    expect(getWidgetAuthTtlSeconds()).toBe(900)
  })

  it('signs, verifies, expires, and rejects tampered widget tokens', () => {
    process.env.WIDGET_AUTH_TTL_SECONDS = '300'
    const token = createWidgetAuthToken(input, 1000)
    expect(verifyWidgetAuthToken(token, 1299)).toMatchObject({ projectKey: 'p', githubLogin: 'octo' })
    expect(verifyWidgetAuthToken(token, 1301)).toBeNull()
    expect(verifyWidgetAuthToken(`${token}x`, 1000)).toBeNull()
    expect(verifyWidgetAuthToken('not-json.nope', 1000)).toBeNull()
  })

  it('signs and verifies expiring popup state', () => {
    const state = createWidgetGithubState({ projectKey: 'p', origin: 'https://app.example' }, 1000)
    expect(verifyWidgetGithubState(state, 1599)).toMatchObject({
      projectKey: 'p',
      origin: 'https://app.example',
    })
    expect(verifyWidgetGithubState(state, 1601)).toBeNull()
    expect(verifyWidgetGithubState(`${state}.extra`, 1000)).toBeNull()
  })

  it('requires auth secret', () => {
    delete process.env.WIDGET_AUTH_SECRET
    expect(() => createWidgetAuthToken(input, 1000)).toThrow('missing_widget_auth_secret')
  })
})

describe('github api helpers', () => {
  it('builds the GitHub App authorize URL', () => {
    const url = new URL(buildGitHubAuthorizeUrl('state-1'))
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('client')
    expect(url.searchParams.get('state')).toBe('state-1')
  })

  it('exchanges a code and rejects bad exchange responses', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ access_token: 'ghu_1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as never
    await expect(exchangeGitHubCode('code')).resolves.toBe('ghu_1')

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'bad' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })) as never
    await expect(exchangeGitHubCode('code')).rejects.toThrow('github_code_exchange_failed')

    delete process.env.GITHUB_APP_CLIENT_SECRET
    await expect(exchangeGitHubCode('code')).rejects.toThrow('missing_github_app_credentials')
  })

  it('loads the GitHub user and checks repo access', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) {
        return new Response(JSON.stringify({ id: 42, login: 'octo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('{}', { status: 204, headers: { 'content-type': 'application/json' } })
    }) as never
    await expect(getGitHubUser('tok')).resolves.toEqual({ id: '42', login: 'octo' })
    await expect(assertGitHubRepoAccess('tok', 'acme', 'widgets')).resolves.toBeUndefined()

    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as never
    await expect(assertGitHubRepoAccess('tok', 'acme', 'widgets')).rejects.toThrow('github_repo_inaccessible')

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as never
    await expect(getGitHubUser('tok')).rejects.toThrow('github_user_lookup_failed')
  })

  it('escapes callback messages before posting to the opener', () => {
    const html = widgetCallbackHtml('https://app.example', { token: '<token>' })
    expect(html).toContain('postMessage')
    expect(html).toContain('"https://app.example"')
    expect(html).toContain('\\u003ctoken>')
  })
})
