import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildLinearAuthorizeUrl,
  createLinearIssue,
  createLinearOAuthState,
  exchangeLinearCode,
  getLinearWorkspace,
  verifyLinearOAuthState,
} from './linear.js'

beforeEach(() => {
  process.env.LINEAR_CLIENT_ID = 'linear-client'
  process.env.LINEAR_CLIENT_SECRET = 'linear-secret'
  process.env.WIDGET_AUTH_SECRET = 'state-secret'
})
afterEach(() => vi.unstubAllGlobals())

describe('Linear integration client', () => {
  it('signs expiring OAuth state and builds the least-privilege authorize URL', () => {
    const state = createLinearOAuthState({ projectKey: 'p', userId: 'u', origin: 'https://crrt.ai', redirectUri: 'https://crrt.ai/v1/integrations/linear/callback' }, 100)
    expect(verifyLinearOAuthState(state, 101)).toMatchObject({ projectKey: 'p', userId: 'u' })
    expect(verifyLinearOAuthState(state, 701)).toBeNull()
    expect(verifyLinearOAuthState(`${state}x`, 101)).toBeNull()
    const url = new URL(buildLinearAuthorizeUrl(state, 'https://crrt.ai/v1/integrations/linear/callback'))
    expect(url.origin + url.pathname).toBe('https://linear.app/oauth/authorize')
    expect(url.searchParams.get('scope')).toBe('read,issues:create')
    expect(url.searchParams.get('actor')).toBe('user')
  })

  it('exchanges codes using form encoding and parses rotating refresh tokens', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await expect(exchangeLinearCode('code', 'https://crrt.ai/callback')).resolves.toMatchObject({ accessToken: 'access', refreshToken: 'refresh' })
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    expect(String(fetch.mock.calls[0]?.[1]?.body)).toContain('grant_type=authorization_code')
  })

  it('loads teams and creates issues while treating transport ambiguity as indeterminate', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { viewer: { organization: { id: 'w', name: 'Workspace' } }, teams: { nodes: [{ id: 't', key: 'WEB', name: 'Web' }] } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { issueCreate: { success: true, issue: { id: 'i', identifier: 'WEB-1', url: 'https://linear.app/issue/WEB-1' } } } }), { status: 200 }))
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetch)
    await expect(getLinearWorkspace('token')).resolves.toEqual({ id: 'w', name: 'Workspace', teams: [{ id: 't', key: 'WEB', name: 'Web' }] })
    await expect(createLinearIssue('token', { teamId: 't', title: 'Title', description: 'Body' })).resolves.toEqual({ externalId: 'i', externalKey: 'WEB-1', externalUrl: 'https://linear.app/issue/WEB-1' })
    await expect(createLinearIssue('token', { teamId: 't', title: 'Title', description: 'Body' })).rejects.toThrow('linear_result_indeterminate')
  })
})
