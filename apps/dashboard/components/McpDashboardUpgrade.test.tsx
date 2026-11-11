import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('./LoginPage', () => ({ LoginPage: ({ continuationPath }: { continuationPath: string }) => <div>Login {continuationPath}</div> }))
import { McpAuthPage } from './McpAuthPage'
const fetcher = vi.fn()
const id = '11111111-1111-4111-8111-111111111111'
const response = (state = 'pending', ok = true) => ({ ok, json: async () => ({ state, name: 'Connected client', bundle: 'dashboard-v1' }) })
const mount = (token: string | null = 'session') => render(<McpAuthPage apiBase="/api" accessToken={token} />)
beforeEach(() => { window.history.replaceState({}, '', `/mcp-auth?upgrade=${id}`); fetcher.mockReset(); vi.stubGlobal('fetch', fetcher) })
afterEach(() => vi.unstubAllGlobals())
it('preserves the upgrade request through account login', () => {
  mount(null)
  expect(screen.getByText(/Login/)).toHaveTextContent(`/mcp-auth?upgrade=${id}`)
  expect(fetcher).not.toHaveBeenCalled()
})
it('discloses the entire suite once and confirms approval without redirecting or reinstalling', async () => {
  fetcher.mockResolvedValueOnce(response())
  mount(); expect(screen.getByRole('status', { name: 'Loading permission request' })).toBeInTheDocument()
  await screen.findByText('Connected client')
  expect(screen.getByText(/Read and manage your projects/)).toHaveTextContent('billing flows')
  expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: expect.objectContaining({ Authorization: 'Bearer session' }), body: JSON.stringify({ requestId: id, decision: 'inspect' }) })
  fetcher.mockResolvedValueOnce(response('approved'))
  fireEvent.click(screen.getByRole('button', { name: 'Approve full dashboard access' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Permissions upgraded')
  expect(screen.queryByRole('button', { name: 'Approve full dashboard access' })).toBeNull()
})
it('keeps old access when declined and reports expiry accurately', async () => {
  fetcher.mockResolvedValueOnce(response())
  const view = mount(); await screen.findByText('Connected client')
  fetcher.mockResolvedValueOnce(response('declined'))
  fireEvent.click(screen.getByText('Keep existing permissions'))
  expect(await screen.findByRole('status')).toHaveTextContent('Existing permissions kept')
  view.unmount()
  fetcher.mockResolvedValueOnce(response('expired'))
  mount(); await screen.findByText(/This request expired/)
})
it('handles decision failures without losing the request or prior access', async () => {
  fetcher.mockResolvedValueOnce(response())
  mount(); await screen.findByText('Connected client')
  fetcher.mockResolvedValueOnce(response('pending', false))
  fireEvent.click(screen.getByText('Approve full dashboard access'))
  expect(await screen.findByRole('alert')).toHaveTextContent('existing connection remains available')
  await waitFor(() => expect(screen.getByText('Approve full dashboard access')).not.toBeDisabled())
  fetcher.mockRejectedValueOnce(new Error())
  fireEvent.click(screen.getByText('Keep existing permissions'))
  await screen.findByRole('alert')
})
it('shows unavailable/foreign request errors without a consent button', async () => {
  fetcher.mockResolvedValueOnce(response('pending', false))
  mount(); expect(await screen.findByRole('alert')).toHaveTextContent('account connected to your agent')
  expect(screen.queryByRole('button')).toBeNull()
})
it('ignores successful and failed loads after unmount', async () => {
  let resolve!: (value: unknown) => void
  fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const view = mount(); view.unmount()
  await act(async () => resolve(response()))
  let reject!: (value: unknown) => void
  fetcher.mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail }))
  const failed = mount(); failed.unmount()
  await act(async () => reject(new Error()))
})
