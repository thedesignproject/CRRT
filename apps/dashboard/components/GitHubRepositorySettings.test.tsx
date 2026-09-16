import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubRepositorySettings } from './GitHubRepositorySettings'

const API = 'https://api.example.com'
const props = { apiBase: API, accessToken: 'session-token', projectKey: 'portfolio' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function repoConfig(status: 'disconnected' | 'reconnect_required' | 'connected') {
  const hasRepo = status !== 'disconnected'
  return {
    projectKey: 'portfolio',
    repoUrl: hasRepo ? 'https://github.com/PyPranav/Portfolio-Mac' : null,
    githubOwner: hasRepo ? 'PyPranav' : null,
    githubRepo: hasRepo ? 'Portfolio-Mac' : null,
    githubConnectionStatus: status,
  }
}

function installMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'crrt:github-app-install',
    ok: true,
    projectKey: 'portfolio',
    installationToken: 'signed-installation-proof',
    repositories: [
      { owner: 'PyPranav', name: 'Portfolio-Mac', repoUrl: 'https://github.com/PyPranav/Portfolio-Mac' },
      { owner: 'PyPranav', name: 'Tower_of_Hanoi', repoUrl: 'https://github.com/PyPranav/Tower_of_Hanoi' },
    ],
    githubAccountLogin: 'PyPranav',
    githubAccountType: 'User',
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('<GitHubRepositorySettings />', () => {
  it('shows a connected repository and confirms before disconnecting', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(repoConfig('connected')))
      .mockResolvedValueOnce(json(repoConfig('disconnected')))
    vi.stubGlobal('fetch', fetchMock)

    render(<GitHubRepositorySettings {...props} />)
    expect(await screen.findByText('PyPranav/Portfolio-Mac')).toBeInTheDocument()
    expect(screen.getByText('Connected and ready for GitHub issues.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(screen.getByText(/stop creating issues/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/stop creating issues/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect repository' }))
    await screen.findByRole('button', { name: 'Connect GitHub' })
    expect(screen.getByText('No repository connected')).toBeInTheDocument()
    expect(screen.getByText(/repository that will receive feedback issues/)).toBeInTheDocument()

    const [, request] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(request.method).toBe('PATCH')
    expect(request.headers).toMatchObject({ Authorization: 'Bearer session-token' })
    expect(JSON.parse(String(request.body))).toEqual({ repoUrl: null })
  })

  it('reuses an installation, accepts only its origin-bound popup result, and connects the selected repo', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/repo-config') && init?.method === 'PATCH') return json(repoConfig('connected'))
      if (url.endsWith('/repo-config')) return json(null)
      return json({
        installUrl: 'https://github.com/apps/crrt/installations/new?state=fresh',
        installations: [{
          id: 'safe-reference',
          githubAccountLogin: 'acme',
          githubAccountType: 'Organization',
          lastVerifiedAt: '2026-07-20T00:00:00.000Z',
          authorizeUrl: 'https://github.com/login/oauth/authorize?state=reuse',
        }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const popup = { closed: false } as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(popup)

    render(<GitHubRepositorySettings {...props} apiBase="http://127.0.0.1:3001/api" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use organization @acme' }))
    expect(open).toHaveBeenCalledWith(
      'https://github.com/login/oauth/authorize?state=reuse',
      'crrt-github-connect',
    )

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://attacker.example', source: popup, data: installMessage(),
      }))
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://127.0.0.1:3001', source: window, data: installMessage(),
      }))
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://127.0.0.1:3001', source: popup, data: installMessage({ projectKey: 'other-project' }),
      }))
    })
    expect(screen.queryByLabelText(/Repository/)).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://127.0.0.1:3001', source: popup, data: installMessage(),
      }))
    })
    const select = await screen.findByLabelText('Repository · @PyPranav')
    fireEvent.change(select, { target: { value: 'https://github.com/PyPranav/Tower_of_Hanoi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect repository' }))

    await screen.findByText('Connected and ready for GitHub issues.')
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(String(patchCall[1]?.body))).toEqual({
      repoUrl: 'https://github.com/PyPranav/Tower_of_Hanoi',
      installationToken: 'signed-installation-proof',
    })
  })

  it('handles reconnect, invalid callback data, authorization failure, and blocked popups', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/repo-config')) return json(repoConfig('reconnect_required'))
      return json({
        installUrl: 'https://github.com/apps/crrt/installations/new?state=fresh',
        installations: [],
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const popup = { closed: false } as Window
    const open = vi.spyOn(window, 'open').mockReturnValueOnce(null).mockReturnValueOnce(popup)

    render(<GitHubRepositorySettings {...props} />)
    expect(await screen.findByText('Reconnect required')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect GitHub' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Install the CRRT GitHub App' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow pop-ups')

    fireEvent.click(screen.getByRole('button', { name: 'Install the CRRT GitHub App' }))
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: new URL(API).origin,
        source: popup,
        data: installMessage({ repositories: [{ owner: 'x', name: 'y', repoUrl: 'javascript:alert(1)' }] }),
      }))
    })
    expect(screen.queryByLabelText(/Repository/)).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: new URL(API).origin,
        source: popup,
        data: { type: 'crrt:github-app-install', ok: false, error: 'secret-upstream-detail' },
      }))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub authorization could not be completed')
    expect(screen.getByRole('alert')).not.toHaveTextContent('secret-upstream-detail')
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('offers retry after a configuration load failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('database unavailable', { status: 500 }))
      .mockResolvedValueOnce(json(null))
    vi.stubGlobal('fetch', fetchMock)

    render(<GitHubRepositorySettings {...props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('database unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('button', { name: 'Connect GitHub' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
