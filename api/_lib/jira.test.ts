import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildJiraAuthorizeUrl,
  createJiraIssue,
  createJiraOAuthState,
  exchangeJiraCode,
  getJiraDestinations,
  verifyJiraOAuthState,
} from './jira.js'

beforeEach(() => {
  process.env.JIRA_CLIENT_ID = 'jira-client'
  process.env.JIRA_CLIENT_SECRET = 'jira-secret'
  process.env.WIDGET_AUTH_SECRET = 'state-secret'
})
afterEach(() => vi.unstubAllGlobals())

describe('Jira integration client', () => {
  it('signs expiring OAuth state and builds the Atlassian 3LO URL', () => {
    const state = createJiraOAuthState({
      projectKey: 'p', userId: 'u', origin: 'https://crrt.ai',
      redirectUri: 'https://crrt.ai/v1/integrations/jira/callback',
    }, 100)
    expect(verifyJiraOAuthState(state, 101)).toMatchObject({ projectKey: 'p', userId: 'u' })
    expect(verifyJiraOAuthState(state, 701)).toBeNull()
    expect(verifyJiraOAuthState(`${state}.extra`, 101)).toBeNull()
    const url = new URL(buildJiraAuthorizeUrl(state, 'https://crrt.ai/v1/integrations/jira/callback'))
    expect(url.origin + url.pathname).toBe('https://auth.atlassian.com/authorize')
    expect(url.searchParams.get('audience')).toBe('api.atlassian.com')
    expect(url.searchParams.get('scope')).toBe('read:jira-work write:jira-work offline_access')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })

  it('exchanges codes with JSON and retains rotating refresh tokens', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access', refresh_token: 'refresh', expires_in: 3600,
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await expect(exchangeJiraCode('code', 'https://crrt.ai/callback')).resolves.toMatchObject({
      accessToken: 'access', refreshToken: 'refresh',
    })
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    })
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      grant_type: 'authorization_code', code: 'code', client_id: 'jira-client',
    })
  })

  it('loads projects across authorized Jira sites', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 'cloud', name: 'Acme Jira', url: 'https://acme.atlassian.net', scopes: ['read:jira-work'] },
        { id: 'confluence', name: 'Acme Confluence', url: 'https://acme.atlassian.net/wiki', scopes: ['read:confluence-content.all'] },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: [{ id: '100', key: 'WEB', name: 'Website' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await expect(getJiraDestinations('access')).resolves.toEqual([{
      id: 'cloud:100', cloudId: 'cloud', siteName: 'Acme Jira', siteUrl: 'https://acme.atlassian.net',
      projectId: '100', projectKey: 'WEB', projectName: 'Website',
    }])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('creates a task with an ADF description and treats an ambiguous POST as indeterminate', async () => {
    const issueTypes = new Response(JSON.stringify({
      issueTypes: [{ id: 'bug', name: 'Bug' }, { id: 'task', name: 'Task' }],
    }), { status: 200 })
    const fetch = vi.fn()
      .mockResolvedValueOnce(issueTypes)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '200', key: 'WEB-7' }), { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    await expect(createJiraIssue('access', {
      cloudId: 'cloud', siteUrl: 'https://acme.atlassian.net/', projectId: '100',
      title: 'Improve checkout', description: 'First line\nSecond line',
    })).resolves.toEqual({
      externalId: '200', externalKey: 'WEB-7', externalUrl: 'https://acme.atlassian.net/browse/WEB-7',
    })
    const issueBody = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))
    expect(issueBody.fields).toMatchObject({
      project: { id: '100' }, issuetype: { id: 'task' }, summary: 'Improve checkout',
      description: { type: 'doc', version: 1 },
    })

    fetch.mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify({ issueTypes: [{ id: 'task', name: 'Task' }] }), { status: 200 }))
      .mockRejectedValueOnce(new Error('connection reset'))
    await expect(createJiraIssue('access', {
      cloudId: 'cloud', siteUrl: 'https://acme.atlassian.net', projectId: '100',
      title: 'Title', description: 'Body',
    })).rejects.toThrow('jira_result_indeterminate')
  })
})
