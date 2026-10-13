import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../lib/billing', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/billing')>(),
  startCloudCheckout: vi.fn(),
}))
import { startCloudCheckout } from '../lib/billing'
import { Pricing } from './Pricing'

beforeEach(() => vi.clearAllMocks())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('presents the complete three-option catalog and signed login entry links', () => {
  render(<Pricing apiBase="https://crrt.ai/api" />)
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(screen.getByText('Recommended')).toBeInTheDocument()
  expect(screen.getByText('$16')).toBeInTheDocument()
  expect(screen.getByText('$41')).toBeInTheDocument()
  expect(screen.queryByText(/\$\d+\.\d+/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /self-host guide/i })).toHaveAttribute('href', '/docs/self-host')
  expect(screen.getByRole('heading', { name: 'Self-hosted' })).toBeInTheDocument()
  expect(screen.getByText('Free forever')).toBeInTheDocument()
  const pro = screen.getByRole('heading', { name: 'Pro' }).closest('article')!
  const studio = screen.getByRole('heading', { name: 'Studio' }).closest('article')!
  expect(within(pro).getByRole('link', { name: /Start 14-day trial/ })).toHaveAttribute('href', 'https://crrt.ai/api/v1/billing?start=pro&cycle=yearly')
  expect(within(studio).getByRole('link', { name: /Start 14-day trial/ })).toHaveAttribute('href', 'https://crrt.ai/api/v1/billing?start=studio&cycle=yearly')
  expect(screen.getByText(/trials require a card/i)).toBeInTheDocument()
})

it('shows whole monthly prices and monthly billing copy', () => {
  render(<Pricing apiBase="https://crrt.ai/api" />)
  fireEvent.click(screen.getByRole('button', { name: 'Monthly' }))
  expect(screen.getByText('$19')).toBeInTheDocument()
  expect(screen.getByText('$49')).toBeInTheDocument()
  expect(screen.getAllByText('Billed monthly. Cancel anytime.')).toHaveLength(2)
})

it('takes an authenticated customer directly to one safe Checkout session', async () => {
  vi.mocked(startCloudCheckout).mockResolvedValue('https://checkout.stripe.com/c/session')
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<Pricing authenticated accessToken="session" apiBase="/api" />)
  const pro = screen.getByRole('heading', { name: 'Pro' }).closest('article')!
  const button = within(pro).getByRole('button', { name: /Start 14-day trial/ })
  fireEvent.click(button); fireEvent.click(button)
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
