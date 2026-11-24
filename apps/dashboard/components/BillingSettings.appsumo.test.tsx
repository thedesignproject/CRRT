import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  getBillingSummary: vi.fn(),
  runBillingAction: vi.fn(),
  redeemAppsumoCode: vi.fn(),
}))
import { getBillingSummary, redeemAppsumoCode, type BillingSummary } from '../api'
import { BillingSettings } from './BillingSettings'

const props = { apiBase: '/api', accessToken: 'token' }
function summary(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return { enabled: true, deployment: 'cloud', plan: null, lifecycle: 'none', allowed: { manageBilling: true }, plans: [], ...overrides }
}
const redeemed = summary({ appsumo: true, isLegacy: true, plan: 'pro', lifecycle: 'active' })

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getBillingSummary).mockResolvedValue(summary()) })
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })

async function submit(code: string) {
  fireEvent.change(await screen.findByLabelText('AppSumo code'), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))
}

it('redeems a trimmed code, shows a loading state, then reflects the AppSumo plan', async () => {
  let finish!: (value: { redeemed: true }) => void
  vi.mocked(redeemAppsumoCode).mockReturnValueOnce(new Promise((done) => { finish = done }))
  render(<BillingSettings {...props} />)
  await submit('  AS-Code-1 ')
  expect(screen.getByRole('button', { name: 'Redeeming…' })).toBeDisabled()
  expect(redeemAppsumoCode).toHaveBeenCalledWith('/api', 'token', 'AS-Code-1')
  vi.mocked(getBillingSummary).mockResolvedValue(redeemed)
  finish({ redeemed: true })
  expect(await screen.findByRole('heading', { name: 'AppSumo lifetime · Cloud Pro' })).toBeInTheDocument()
  expect(screen.getByText(/Code redeemed\. Your AppSumo lifetime deal is active/)).toBeInTheDocument()
  expect(screen.queryByLabelText('AppSumo code')).not.toBeInTheDocument()
  expect(getBillingSummary).toHaveBeenLastCalledWith('/api', 'token', true, expect.any(AbortSignal))
})

it.each([
  ['That AppSumo code is not valid. Check it and try again.'],
  ['That AppSumo code has already been redeemed.'],
  ['Your account already has an AppSumo lifetime plan.'],
  ['Too many attempts. Try again in an hour.'],
])('shows the server error "%s" and keeps the code for correction', async (message) => {
  vi.mocked(redeemAppsumoCode).mockRejectedValueOnce(new Error(message))
  render(<BillingSettings {...props} />)
  await submit('AS-Bad')
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByLabelText('AppSumo code')).toHaveValue('AS-Bad')
  expect(screen.getByLabelText('AppSumo code')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('button', { name: 'Redeem' })).toBeEnabled()
})

it('asks for a code instead of submitting an empty one and clears the error on edit', async () => {
  render(<BillingSettings {...props} />)
  await submit('   ')
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter your AppSumo code.')
  expect(redeemAppsumoCode).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('AppSumo code'), { target: { value: 'A' } })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('falls back to a generic message for unexpected failures', async () => {
  vi.mocked(redeemAppsumoCode).mockRejectedValueOnce('offline')
  render(<BillingSettings {...props} />)
  await submit('AS-1')
  expect(await screen.findByRole('alert')).toHaveTextContent('AppSumo redemption is temporarily unavailable.')
})

it('focuses the redeem field when arriving from the AppSumo landing page', async () => {
  window.history.replaceState({}, '', '/dashboard/billing?appsumo=1')
  render(<BillingSettings {...props} />)
  await waitFor(() => expect(screen.getByLabelText('AppSumo code')).toHaveFocus())
})

it('warns AppSumo users that an active Stripe subscription keeps charging', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue({ ...redeemed, plan: 'studio', paidSubscriptionActive: true, canManageSubscription: true })
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('heading', { name: 'Cloud active' })).toBeInTheDocument()
  expect(screen.getByRole('note')).toHaveTextContent('it will keep charging you')
  expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument()
})

it('tells paying users before redeeming that Stripe is not cancelled automatically', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ plan: 'pro', lifecycle: 'active', paidSubscriptionActive: true, canManageSubscription: true }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByText(/Redeeming does not cancel it/)).toBeInTheDocument()
})
