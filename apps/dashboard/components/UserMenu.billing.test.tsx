import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { UserMenu } from './UserMenu'
import { route } from '../lib/routes'
const fetchMock = vi.fn()
const props = { apiBase: '/api', accessToken: 'session', user: { email: 'owner@example.com' } as never, onSignOut: vi.fn() }
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('offers account billing without any project and preserves sign out', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ enabled: true }) })
  render(<UserMenu {...props} />)
  expect(fetchMock).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTitle('owner@example.com'))
  expect(await screen.findByRole('link', { name: 'Billing' })).toHaveAttribute('href', route('/billing'))
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/billing?availability=1', { headers: { Authorization: 'Bearer session' } })
  fireEvent.click(screen.getByText('Sign out'))
  expect(props.onSignOut).toHaveBeenCalled()
})
it.each(['disabled', 'invalid', 'http', 'network'])('hides billing when availability is %s', async (kind) => {
  if (kind === 'network') fetchMock.mockRejectedValue(new Error('offline'))
  else fetchMock.mockResolvedValue({ ok: kind !== 'http', json: async () => ({ enabled: kind === 'invalid' ? 'true' : false }) })
  render(<UserMenu {...props} />)
  await act(async () => fireEvent.click(screen.getByTitle('owner@example.com')))
  expect(screen.queryByRole('link', { name: 'Billing' })).not.toBeInTheDocument()
})
it('ignores stale availability after the menu closes', async () => {
  let resolve!: (value: unknown) => void
  fetchMock.mockReturnValue(new Promise((done) => { resolve = done }))
  render(<UserMenu {...props} />)
  fireEvent.click(screen.getByTitle('owner@example.com'))
  fireEvent.mouseDown(document.body)
  await act(async () => resolve({ ok: true, json: async () => ({ enabled: true }) }))
  expect(screen.queryByText('Billing')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTitle('owner@example.com'))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
})
