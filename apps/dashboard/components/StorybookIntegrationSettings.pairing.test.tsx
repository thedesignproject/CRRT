import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/mocks', () => ({ mocksEnabled: false }))

import { StorybookIntegrationSettings } from './StorybookIntegrationSettings'

const props = { apiBase: '/api', accessToken: 'session', projectKey: 'demo' }
const command = 'npx @thedesignproject/crrt-storybook connect --code once'
const pending = {
  id: 'new', project_key: 'demo', created_by: 'owner',
  expires_at: new Date(Date.now() + 60_000).toISOString(), claimed_at: null as string | null,
  revoked_at: null as string | null,
}
const old = { ...pending, id: 'old', claimed_at: '2026-10-14T18:00:00.000Z' }
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

function backend(initial: typeof pending[] = []) {
  let connections = initial
  const fetchMock = vi.fn(async (_url: unknown, options?: RequestInit) => options?.method === 'POST'
    ? response({ code: 'once', expiresAt: pending.expires_at, connectionId: pending.id })
    : response({ connections }))
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, setConnections: (next: typeof pending[]) => { connections = next } }
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Storybook pairing status with the real API adapter', () => {
  it.each([false, true])('retains the pending command until its own claim completes (replacement=%s)', async (replacement) => {
    const server = backend(replacement ? [old] : [])
    render(<StorybookIntegrationSettings {...props} />)
    fireEvent.click(await screen.findByRole('button', {
      name: replacement ? 'Connect a different Storybook' : 'Connect Storybook',
    }))
    await screen.findByText(command)

    server.setConnections(replacement ? [old, pending] : [pending])
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    await waitFor(() => expect(server.fetchMock).toHaveBeenCalledTimes(3))
    await screen.findByRole('button', { name: 'Check connection' })
    expect(screen.getByText(command)).toBeInTheDocument()
    expect(screen.queryByText('Storybook connected')).toBeNull()

    server.setConnections([old, { ...pending, claimed_at: '2026-10-15T18:00:00.000Z' }])
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    expect(await screen.findByText('Storybook connected')).toBeInTheDocument()
    expect(screen.queryByText(command)).toBeNull()
  })

  it.each(['revoked', 'missing', 'expired'])('discards the command when its server record is %s', async (state) => {
    const server = backend([old])
    render(<StorybookIntegrationSettings {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a different Storybook' }))
    await screen.findByText(command)
    const record = {
      ...pending,
      revoked_at: state === 'revoked' ? '2026-10-15T18:00:00.000Z' : null,
      expires_at: state === 'expired' ? '2000-01-01T00:00:00.000Z' : pending.expires_at,
    }
    server.setConnections(state === 'missing' ? [old] : [old, record])
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    await screen.findByText(state === 'expired' ? 'Connection command expired' : 'No Storybook connected')
    expect(screen.queryByText(command)).toBeNull()
    expect(screen.queryByText('Storybook connected')).toBeNull()
  })

  it('keeps expiry active after an early status check', async () => {
    vi.useFakeTimers()
    const server = backend()
    server.fetchMock.mockResolvedValueOnce(response({ connections: [] }))
      .mockResolvedValueOnce(response({ code: 'once', connectionId: 'new', expiresAt: new Date(Date.now() + 1_000).toISOString() }))
    render(<StorybookIntegrationSettings {...props} />)
    await act(async () => {})
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Connect Storybook' })))
    server.setConnections([{ ...pending, expires_at: new Date(Date.now() + 1_000).toISOString() }])
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check connection' })))
    expect(screen.getByText(command)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByText('Connection command expired')).toBeInTheDocument()
    expect(screen.queryByText(command)).toBeNull()
  })

  it('ignores an in-flight pairing status after the project changes', async () => {
    const server = backend()
    const view = render(<StorybookIntegrationSettings {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Storybook' }))
    await screen.findByText(command)
    let resolveStatus!: (value: Response) => void
    server.fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveStatus = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    server.setConnections([old])
    view.rerender(<StorybookIntegrationSettings {...props} projectKey="other" />)
    await screen.findByText('Storybook connected')
    await act(async () => resolveStatus(response({ connections: [pending] })))
    expect(screen.getByText('Storybook connected')).toBeInTheDocument()
    expect(screen.queryByText(command)).toBeNull()
  })
})
