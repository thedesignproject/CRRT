import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BillingSettings } from './BillingSettings'
const fetchMock = vi.fn()
const props = { apiBase: 'https://api.example/api', accessToken: 'session' }
const free = { enabled: true, proPrice: { amount: '$10', interval: 'month' }, status: 'free', canManage: false, periodEnd: null, cancelAtPeriodEnd: false }
const reply = (value: unknown, ok = true) => ({ ok, json: async () => value })
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('explains loading and disabled billing', async () => {
  let resolve!: (value: unknown) => void
  fetchMock.mockReturnValue(new Promise((done) => { resolve = done }))
  const view = render(<BillingSettings {...props} />); expect(screen.getByRole('status')).toHaveTextContent('Loading billing')
  await act(async () => resolve(reply({ enabled: false })))
  expect(screen.getByText('Billing is not enabled in this environment.')).toBeInTheDocument()
})
it('shows the free plan and upgrade checkout and opens the signed server URL', async () => {
  fetchMock.mockResolvedValueOnce(reply(free)).mockResolvedValueOnce(reply({ url: 'https://checkout.stripe.com/c/test' }))
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Pro' }))
  await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/test'))
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ action: 'checkout' }) })
  expect(screen.getByText('$10')).toBeInTheDocument()
  expect(screen.getByText(/No real charges/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Pro' })).toBeInTheDocument()
  expect(screen.getByText('Claim up to 3 projects')).toBeInTheDocument()
  expect(screen.getByText('Up to 5 people per project')).toBeInTheDocument()
  expect(screen.getByText('Claim more than 3 projects')).toBeInTheDocument()
  expect(screen.getByText('Add more than 5 people per project')).toBeInTheDocument()
})
it('shows cancellation/period details, opens portal and refreshes status', async () => {
  const active = { ...free, status: 'active', canManage: true, periodEnd: '2027-01-01T00:00:00Z', cancelAtPeriodEnd: true }
  fetchMock.mockResolvedValueOnce(reply(active)).mockResolvedValueOnce(reply({ url: 'https://billing.stripe.com/p/test' })).mockResolvedValue(reply({ ...active, cancelAtPeriodEnd: false }))
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Manage billing' }))
  await waitFor(() => expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/test'))
  expect(screen.queryByText('Upgrade to Pro')).not.toBeInTheDocument()
  expect(screen.getByText(/^Ends /)).toBeInTheDocument()
  fireEvent.click(screen.getByText('Refresh billing status'))
  expect(await screen.findByText(/^Current period ends /)).toBeInTheDocument()
})
it.each(['http://checkout.stripe.com/x', 'https://evil.example/', 'not-a-url'])('rejects untrusted redirect %s', async (url) => {
  fetchMock.mockResolvedValueOnce(reply(free)).mockResolvedValueOnce(reply({ url }))
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByText('Upgrade to Pro'))
  expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
  expect(assign).not.toHaveBeenCalled()
})
it('reports API failures and permits retrying', async () => {
  fetchMock.mockResolvedValueOnce(reply({}, false)).mockResolvedValueOnce(reply(free)).mockResolvedValueOnce(reply({}, false))
  render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByText('Retry'))
  fireEvent.click(await screen.findByText('Upgrade to Pro'))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
it.each([true, false])('ignores settled requests after unmount (success=%s)', async (success) => {
  let resolve!: (value: unknown) => void
  fetchMock.mockReturnValue(new Promise((done) => { resolve = done }))
  const view = render(<BillingSettings {...props} />); view.unmount()
  await act(async () => resolve(reply(free, success)))
  expect(view.container).toBeEmptyDOMElement()
})

it.each(['canceled', 'incomplete_expired'])('allows upgrading a terminal subscription: %s', async (status) => {
  fetchMock.mockResolvedValue(reply({ ...free, status }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('button', { name: 'Upgrade to Pro' })).toBeInTheDocument()
  expect(screen.getByText('$0')).toBeInTheDocument()
})
it.each(['incomplete', 'past_due', 'unpaid', 'paused', 'trialing'])('keeps %s subscriptions in management instead of offering duplicates', async (status) => {
  fetchMock.mockResolvedValue(reply({ ...free, status, canManage: true }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('button', { name: 'Manage billing' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).not.toBeInTheDocument()
  expect(screen.getByText(status.replace(/_/g, ' '))).toBeInTheDocument()
})

it.each(['unmount', 'account', 'api'])('ignores pending portal redirects after %s changes', async (change) => {
  let resolve!: (value: unknown) => void
  fetchMock.mockResolvedValueOnce(reply({ ...free, status: 'active', canManage: true }))
    .mockReturnValueOnce(new Promise((done) => { resolve = done }))
    .mockResolvedValue(reply(free))
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  const view = render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Manage billing' }))
  if (change === 'unmount') view.unmount()
  else view.rerender(<BillingSettings {...props} {...(change === 'account' ? { accessToken: 'new-account' } : { apiBase: '/new-api' })} />)
  await act(async () => resolve(reply({ url: 'https://billing.stripe.com/old-account' })))
  expect(assign).not.toHaveBeenCalled()
  if (change !== 'unmount') expect(await screen.findByRole('button', { name: 'Upgrade to Pro' })).toBeEnabled()
})
it('does not leak stale action failures into the next account', async () => {
  let reject!: (reason: Error) => void
  fetchMock.mockResolvedValueOnce(reply(free))
    .mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    .mockResolvedValue(reply(free))
  const view = render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Pro' }))
  view.rerender(<BillingSettings {...props} accessToken="new-account" />)
  await act(async () => reject(new Error('old request failed')))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(await screen.findByRole('button', { name: 'Upgrade to Pro' })).toBeEnabled()
})
