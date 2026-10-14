import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../lib/billing', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/billing')>(),
  startCloudCheckout: vi.fn(),
}))
import { startCloudCheckout } from '../lib/billing'
import { Pricing } from './Pricing'

beforeEach(() => vi.clearAllMocks())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('presents a decision-useful catalog and preserves each signed selection', () => {
  render(<Pricing apiBase="https://crrt.ai/api" />)
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(screen.getByText('Recommended')).toBeInTheDocument()
  expect(screen.getByText('$16')).toBeInTheDocument()
  expect(screen.getByText('$41')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Self-hosted' })).toBeInTheDocument()
  const pro = screen.getByRole('heading', { name: 'Pro' }).closest('article')!
  const studio = screen.getByRole('heading', { name: 'Studio' }).closest('article')!
  expect(within(pro).getByText(/Storybook review/)).toBeInTheDocument()
  expect(within(pro).getByText(/Private projects/)).toBeInTheDocument()
  expect(within(pro).getByText(/Agent handoff/)).toBeInTheDocument()
  expect(within(pro).getByText(/GitHub, Linear, and Jira/)).toBeInTheDocument()
  expect(within(studio).getByText('Everything in Pro')).toBeInTheDocument()
  expect(within(pro).getByRole('link', { name: /Start 14-day trial/ })).toHaveAttribute('href', 'https://crrt.ai/api/v1/billing?start=pro&cycle=yearly')
  fireEvent.click(screen.getByRole('button', { name: 'Monthly' }))
  expect(within(studio).getByRole('link', { name: /Start 14-day trial/ })).toHaveAttribute('href', 'https://crrt.ai/api/v1/billing?start=studio&cycle=monthly')
})

it('takes an authenticated customer directly to one safe Checkout session', async () => {
  vi.mocked(startCloudCheckout).mockResolvedValue('https://checkout.stripe.com/c/session')
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<Pricing authenticated accessToken="session" apiBase="/api" />)
  const pro = screen.getByRole('heading', { name: 'Pro' }).closest('article')!
  const button = within(pro).getByRole('button', { name: /Start 14-day trial/ })
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await waitFor(() => expect(startCloudCheckout).toHaveBeenCalledOnce())
  expect(startCloudCheckout).toHaveBeenCalledWith('/api', 'session', 'pro', 'yearly')
  expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/session')
})

it('keeps checkout failures visible and retryable without navigating', async () => {
  vi.mocked(startCloudCheckout).mockRejectedValueOnce(new Error('Billing offline')).mockRejectedValueOnce('offline')
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<Pricing authenticated accessToken="session" />)
  const studio = screen.getByRole('heading', { name: 'Studio' }).closest('article')!
  fireEvent.click(within(studio).getByRole('button', { name: /Start 14-day trial/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Billing offline')
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  fireEvent.click(within(studio).getByRole('button', { name: /Start 14-day trial/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
  expect(assign).not.toHaveBeenCalled()
})
