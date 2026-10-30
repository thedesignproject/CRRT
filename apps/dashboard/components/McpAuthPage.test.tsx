import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('./LoginPage', () => ({ LoginPage: ({ continuationPath }: { continuationPath: string }) => <div>Login {continuationPath}</div> }))
import { McpAuthPage } from './McpAuthPage'
const fetcher = vi.fn()
const params = new URLSearchParams({ client_id: 'client', state: 'state' })
beforeEach(() => { vi.stubGlobal('fetch', fetcher); fetcher.mockReset(); window.history.replaceState({}, '', `/mcp-auth?${params}`) })
afterEach(() => vi.unstubAllGlobals())
const reply = (value: unknown, ok = true) => Promise.resolve({ ok, json: async () => value })
const mount = (accessToken: string | null = 'session') => render(<McpAuthPage apiBase="/api" accessToken={accessToken} />)
it('uses existing login and keeps the consent continuation', () => {
  mount(null); expect(screen.getByText(/Login/)).toHaveTextContent('/mcp-auth?client_id=client&state=state'); expect(fetcher).not.toHaveBeenCalled()
})
it('loads server-validated client details and handles approval failure', async () => {
  fetcher.mockImplementationOnce(() => reply({ name: 'Codex', redirectUri: 'http://localhost/callback' }))
  mount(); await screen.findByText('Codex')
  fetcher.mockImplementationOnce(() => reply({}, false))
  fireEvent.click(screen.getByText('Allow read access'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect')
  fetcher.mockImplementationOnce(() => reply({ redirectUrl: 'https://evil.test/callback?state=state' }))
  fireEvent.click(screen.getByText('Cancel')); await screen.findByRole('alert')
  expect(fetcher.mock.calls[2][1].body).toContain('deny')
})
it('validates returned callbacks and follows the approved one', async () => {
  fetcher.mockImplementationOnce(() => reply({ name: 'Codex', redirectUri: 'http://localhost/callback' }))
  mount(); await screen.findByText('Codex')
  for (const redirectUrl of ['http://localhost/wrong?state=state', 'http://localhost/callback?state=wrong']) {
    fetcher.mockImplementationOnce(() => reply({ redirectUrl }))
    fireEvent.click(screen.getByText('Allow read access')); await screen.findByRole('alert')
    await waitFor(() => expect(screen.getByText('Allow read access')).not.toBeDisabled())
  }
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  fetcher.mockImplementationOnce(() => reply({ redirectUrl: 'http://localhost/callback?state=state&code=code' }))
  fireEvent.click(screen.getByText('Allow read access'))
  await waitFor(() => expect(assign).toHaveBeenCalledWith('http://localhost/callback?state=state&code=code'))
  assign.mockRestore()
})
it('shows load errors and ignores requests that complete after unmount', async () => {
  fetcher.mockRejectedValueOnce(new Error()); const view = mount(); await screen.findByRole('alert'); view.unmount()
  let resolve!: (value: unknown) => void
  fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = mount(); pending.unmount(); await act(async () => resolve({ ok: true, json: async () => ({ name: 'ignored' }) }))
  fetcher.mockRejectedValueOnce(new Error()); const rejected = mount(); rejected.unmount(); await act(async () => {})
})
it('lists and revokes connections and allows retry after a failure', async () => {
  window.history.replaceState({}, '', '/mcp-auth')
  const connection = { id: 'connection', mcp_clients: { name: 'Codex' } }
  fetcher.mockImplementationOnce(() => reply({ connections: [connection] }))
  mount(); await screen.findByText('Codex')
  fetcher.mockRejectedValueOnce(new Error()); fireEvent.click(screen.getByText('Disconnect')); await screen.findByRole('alert')
  await waitFor(() => expect(screen.getByText('Disconnect')).not.toBeDisabled())
  fetcher.mockImplementationOnce(() => reply({ connections: [] })); fireEvent.click(screen.getByText('Disconnect'))
  await screen.findByText('No active connections.')
})

it('shows connection loading and errors without a false empty state', async () => {
  window.history.replaceState({}, '', '/mcp-auth')
  let resolve!: (value: unknown) => void
  fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  mount()
  expect(screen.getByRole('status', { name: 'Loading connections' })).toBeInTheDocument()
  expect(screen.queryByText('No active connections.')).toBeNull()
  await act(async () => resolve({ ok: false }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByText('No active connections.')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Connect a client' })).toBeInTheDocument()
})
it('shows precisely the requested update permissions before consent', async () => {
  fetcher.mockImplementationOnce(() => reply({ name: 'Codex', redirectUri: 'http://localhost/callback', scope: 'crrt:read crrt:implement crrt:review' }))
  mount(); await screen.findByText('Codex')
  expect(screen.getByText(/Implementation updates:/)).toBeInTheDocument()
  expect(screen.getByText(/Review changes:/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Allow access' })).toBeInTheDocument()
  expect(screen.queryByText(/This connection cannot change/)).toBeNull()
})
it('keeps implementation and review grants distinct', async () => {
  fetcher.mockImplementationOnce(() => reply({ name: 'Worker', redirectUri: 'http://localhost/callback', scope: 'crrt:read crrt:implement' }))
  const view = mount(); await screen.findByText('Worker')
  expect(screen.queryByText(/Review changes:/)).toBeNull(); view.unmount()
  fetcher.mockImplementationOnce(() => reply({ name: 'Reviewer', redirectUri: 'http://localhost/callback', scope: 'crrt:read crrt:review' }))
  mount(); await screen.findByText('Reviewer')
  expect(screen.queryByText(/Implementation updates:/)).toBeNull()
  expect(screen.getByText(/Review changes:/)).toBeInTheDocument()
})
it('labels existing read-only grants separately from approved updates', async () => {
  window.history.replaceState({}, '', '/mcp-auth')
  fetcher.mockImplementationOnce(() => reply({ connections: [{ id: 'read', scope: 'crrt:read', mcp_clients: { name: 'Read client' } }, { id: 'write', scope: 'crrt:read crrt:implement', mcp_clients: { name: 'Work client' } }] }))
  mount(); await screen.findByText('Work client')
  expect(screen.getByText('Connected · Read-only')).toBeInTheDocument()
  expect(screen.getByText('Connected · Approved updates')).toBeInTheDocument()
})
