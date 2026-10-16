import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  getBillingSummary: vi.fn(),
  runBillingAction: vi.fn(),
}))
import { getBillingSummary, runBillingAction, type BillingSummary } from '../api'
import { BillingSettings } from './BillingSettings'

const props = { apiBase: '/api', accessToken: 'token' }
const plans = [
  { key: 'pro', name: 'Pro', hosting: 'cloud', monthlyPriceUsd: 19, trialDays: 14, limits: { projects: 10, internalUsers: 10, commentsPerMonth: 2_000, auditsPerMonth: 5, guests: null } },
  { key: 'studio', name: 'Studio', hosting: 'cloud', monthlyPriceUsd: 49, trialDays: 14, limits: { projects: 50, internalUsers: 25, commentsPerMonth: 10_000, auditsPerMonth: 30, guests: null } },
] as BillingSummary['plans']

function summary(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    enabled: true, testMode: true, deployment: 'cloud', plan: null, lifecycle: 'none',
    cancelAtPeriodEnd: false, canManageSubscription: false, allowed: { manageBilling: true }, plans,
    planPrices: { pro: { amount: '$19', interval: 'month' }, studio: { amount: '$49', interval: 'month' } },
    usage: {
      projects: { used: 1, limit: 10, resetAt: null }, internalUsers: { used: 2, limit: 10, resetAt: null },
      comments: { used: 300, limit: 2_000, resetAt: '2026-11-01T00:00:00Z' }, productAudits: { used: 1, limit: 5, resetAt: '2026-11-01T00:00:00Z' },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getBillingSummary).mockResolvedValue(summary())
  vi.mocked(runBillingAction).mockResolvedValue({ status: 'updated', plan: 'studio' })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState({}, '', '/') })

it('renders loading, disabled billing, and retryable load failures', async () => {
  let resolve!: (value: BillingSummary) => void
  vi.mocked(getBillingSummary).mockReturnValueOnce(new Promise((done) => { resolve = done }))
  const view = render(<BillingSettings {...props} />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading billing')
  await act(async () => resolve({ enabled: false }))
  expect(screen.getByText(/Self-hosted CRRT remains free/)).toBeInTheDocument()
  vi.mocked(getBillingSummary).mockRejectedValueOnce(new Error('network'))
  view.rerender(<BillingSettings {...props} accessToken="next" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Billing is temporarily unavailable')
  vi.mocked(getBillingSummary).mockResolvedValueOnce(summary())
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'Cloud not active' })).toBeInTheDocument()
  vi.mocked(getBillingSummary).mockRejectedValueOnce('offline')
  view.rerender(<BillingSettings {...props} accessToken="third" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Billing is temporarily unavailable')
})

it('shows Pro workflow value and starts the selected plan once', async () => {
  vi.mocked(runBillingAction).mockResolvedValueOnce({ url: 'https://checkout.stripe.com/c/session' })
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<BillingSettings {...props} />)
  expect(await screen.findByText('300 / 2,000')).toBeInTheDocument()
  expect(screen.getByText('Private projects · Storybook · Agent workflow')).toBeInTheDocument()
  expect(screen.getByText('Everything in Pro · higher capacity')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Comments usage' })).toHaveAttribute('aria-valuenow', '300')
  fireEvent.click(screen.getByRole('button', { name: /Studio/ }))
  const start = screen.getByRole('button', { name: 'Start 14-day trial' })
  fireEvent.click(start); fireEvent.click(start)
  await waitFor(() => expect(runBillingAction).toHaveBeenCalledOnce())
  expect(runBillingAction).toHaveBeenCalledWith('/api', 'token', 'checkout', 'studio', undefined, undefined)
  expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/session')
  expect(screen.getByText('Test mode')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Self-hosted is free.' })).toHaveAttribute('href', '/docs/self-host')
})

it('continues a signed pricing selection exactly once after authentication', async () => {
  vi.mocked(runBillingAction).mockResolvedValueOnce({ url: 'https://checkout.stripe.com/c/continued' })
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  const view = render(<BillingSettings {...props} checkoutState="payload.signature" />)
  await waitFor(() => expect(runBillingAction).toHaveBeenCalledWith('/api', 'token', 'checkout_state', undefined, 'payload.signature', undefined))
  expect(window.location.pathname).toMatch(/\/billing$/)
  expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/continued')
  view.rerender(<BillingSettings {...props} checkoutState="payload.signature" />)
  expect(runBillingAction).toHaveBeenCalledOnce()
})

it('makes a failed signed continuation retryable without exposing the state', async () => {
  vi.mocked(runBillingAction).mockRejectedValueOnce(new Error('Checkout expired'))
  render(<BillingSettings {...props} checkoutState="payload.signature" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Checkout expired')
  expect(window.location.pathname).toMatch(/\/billing$/)
})

it('does not send a signed continuation to the transitional legacy contract', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ actions: { checkoutState: false, changePlan: false } }))
  render(<BillingSettings {...props} checkoutState="payload.signature" />)
  expect(await screen.findByRole('heading', { name: 'Cloud not active' })).toBeInTheDocument()
  expect(runBillingAction).not.toHaveBeenCalled()
})

it('changes an active plan and refreshes the final contract', async () => {
  vi.mocked(getBillingSummary)
    .mockResolvedValueOnce(summary({ plan: 'pro', lifecycle: 'active', canManageSubscription: true, currentPeriodEnd: '2026-10-20T00:00:00Z' }))
    .mockResolvedValueOnce(summary({ plan: 'pro', lifecycle: 'active', canManageSubscription: true, scheduledPlan: 'studio', scheduledPlanAt: '2026-10-20T00:00:00Z' }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('heading', { name: 'Cloud active' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Studio/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Studio' }))
  await waitFor(() => expect(getBillingSummary).toHaveBeenLastCalledWith('/api', 'token', true, expect.any(AbortSignal)))
  expect(runBillingAction).toHaveBeenCalledWith('/api', 'token', 'change_plan', 'studio', undefined, undefined)
  expect(await screen.findByText(/studio scheduled for/)).toBeInTheDocument()
})

it('uses Stripe Portal for plan changes on the current legacy contract', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ plan: 'pro', lifecycle: 'active', canManageSubscription: true, actions: { checkoutState: false, changePlan: false } }))
  vi.mocked(runBillingAction).mockResolvedValueOnce({ url: 'https://billing.stripe.com/p/session' })
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: /Studio/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Manage plan in Stripe' }))
  await waitFor(() => expect(runBillingAction).toHaveBeenCalledWith('/api', 'token', 'portal', undefined, undefined, undefined))
  expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session')
})

it('keeps legacy Pro included and starts a Studio checkout', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({
    isLegacy: true, plan: 'pro', lifecycle: 'active', canManageSubscription: false,
    actions: { checkoutState: false, changePlan: false },
  }))
  vi.mocked(runBillingAction).mockResolvedValueOnce({ url: 'https://checkout.stripe.com/c/studio' })
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('heading', { name: 'Cloud Pro included' })).toBeInTheDocument()
  expect(screen.getAllByText('Included')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: /Studio/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Studio' }))
  await waitFor(() => expect(runBillingAction).toHaveBeenCalledWith('/api', 'token', 'checkout', 'studio', undefined, undefined))
  expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/studio')
})

it.each([
  { currentPeriodEnd: '2026-11-01T00:00:00Z' },
  { periodEnd: '2026-11-01T00:00:00Z' },
])('explains that legacy Pro continues after Studio cancellation %#', async (period) => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({
    isLegacy: true, plan: 'studio', lifecycle: 'active', canManageSubscription: true,
    cancelAtPeriodEnd: true, ...period,
  }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByText(/After cancellation, you return to your included Cloud Pro access/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Pro.*Included/ })).toBeDisabled()
})

it('shows the normal renewal state while legacy Studio remains active', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({
    isLegacy: true, plan: 'studio', lifecycle: 'active', canManageSubscription: true,
    currentPeriodEnd: '2026-11-01T00:00:00Z',
  }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByText(/Renews/)).toBeInTheDocument()
})

it.each([
  ['checkout_pending', 'Confirming checkout'],
  ['trialing', 'Trial active'],
  ['past_due_grace', 'Payment needs attention'],
  ['read_only', 'Read-only'],
] as const)('renders the %s lifecycle directly from the server', async (lifecycle, heading) => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({
    plan: 'pro', lifecycle, canManageSubscription: true,
    trialEndsAt: '2026-10-10T00:00:00Z', graceEndsAt: '2026-10-16T00:00:00Z', currentPeriodEnd: '2026-10-20T00:00:00Z',
  }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
})

it.each([
  [{ lifecycle: undefined, status: 'trialing', trialEndsAt: undefined }, 'Trial active', 'Your 14-day trial is active.'],
  [{ lifecycle: undefined, status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: undefined, periodEnd: '2026-10-20T00:00:00Z' }, 'Cloud active', 'Access ends'],
  [{ lifecycle: undefined, status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: undefined, periodEnd: '2026-10-20T00:00:00Z' }, 'Cloud active', 'Renews'],
  [{ lifecycle: undefined, status: undefined }, 'Cloud not active', 'Choose a plan'],
] as const)('supports legacy lifecycle fallbacks: %s', async (overrides, heading, detail) => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary(overrides as Partial<BillingSummary>))
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  expect(screen.getByText(new RegExp(detail))).toBeInTheDocument()
})

it('checks pending checkout and restores a blocked account through Stripe', async () => {
  vi.mocked(getBillingSummary)
    .mockResolvedValueOnce(summary({ plan: 'pro', lifecycle: 'checkout_pending', canManageSubscription: true }))
    .mockResolvedValueOnce(summary({ plan: 'pro', lifecycle: 'read_only', canManageSubscription: true }))
  render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Check status' }))
  const restore = await screen.findByRole('button', { name: 'Restore access' })
  vi.mocked(runBillingAction).mockResolvedValueOnce({ url: 'https://billing.stripe.com/p/session' })
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  fireEvent.click(restore)
  await waitFor(() => expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session'))
})

it('shows scheduled cancellation and reactivation copy', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ plan: 'pro', lifecycle: 'read_only', canManageSubscription: true, cancelAtPeriodEnd: true, periodEnd: '2026-10-20T00:00:00Z' }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('button', { name: 'Reactivate in Stripe' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Cancellation is scheduled')
})

it.each(['http://checkout.stripe.com/x', 'https://evil.example/x', 'not a url', null])('rejects an untrusted billing destination: %s', async (url) => {
  vi.mocked(runBillingAction).mockResolvedValue({ url } as never)
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Start 14-day trial' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(assign).not.toHaveBeenCalled()
})

it('keeps action errors retryable and ignores stale account requests', async () => {
  let reject!: (error: Error) => void
  vi.mocked(runBillingAction).mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
  const view = render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Start 14-day trial' }))
  view.rerender(<BillingSettings {...props} accessToken="new-account" />)
  await act(async () => reject(new Error('old account failed')))
  expect(screen.queryByRole('alert')).toBeNull()
  vi.mocked(runBillingAction).mockRejectedValueOnce('down')
  fireEvent.click(await screen.findByRole('button', { name: 'Start 14-day trial' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Billing is temporarily unavailable')
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
  expect(getBillingSummary).toHaveBeenLastCalledWith('/api', 'new-account', true, expect.any(AbortSignal))
})

it('deduplicates an in-flight action and ignores its stale success', async () => {
  let resolve!: (value: { status: 'updated'; plan: 'pro' }) => void
  vi.mocked(runBillingAction).mockReturnValueOnce(new Promise((done) => { resolve = done }))
  const view = render(<BillingSettings {...props} />)
  const button = await screen.findByRole('button', { name: 'Start 14-day trial' })
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  expect(runBillingAction).toHaveBeenCalledOnce()
  view.rerender(<BillingSettings {...props} accessToken="new-account" />)
  await act(async () => resolve({ status: 'updated', plan: 'pro' }))
  expect(await screen.findByRole('heading', { name: 'Cloud not active' })).toBeInTheDocument()
})

it('ignores stale billing loads whether they resolve or reject', async () => {
  let resolve!: (value: BillingSummary) => void
  let reject!: (reason: Error) => void
  vi.mocked(getBillingSummary)
    .mockReturnValueOnce(new Promise((done) => { resolve = done }))
    .mockResolvedValueOnce(summary())
    .mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    .mockResolvedValueOnce(summary())
  const view = render(<BillingSettings {...props} accessToken="first" />)
  view.rerender(<BillingSettings {...props} accessToken="second" />)
  expect(await screen.findByRole('heading', { name: 'Cloud not active' })).toBeInTheDocument()
  await act(async () => resolve(summary({ lifecycle: 'read_only' })))
  expect(screen.getByRole('heading', { name: 'Cloud not active' })).toBeInTheDocument()
  view.rerender(<BillingSettings {...props} accessToken="third" />)
  view.rerender(<BillingSettings {...props} accessToken="fourth" />)
  await act(async () => reject(new Error('stale failure')))
  expect(screen.queryByText('stale failure')).toBeNull()
})

it('uses safe defaults for optional server fields and non-managing viewers', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ plans: undefined, allowed: { manageBilling: false }, usage: undefined, testMode: false }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByText('Usage becomes available after Cloud is activated.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Start 14-day trial' })).toBeDisabled()
  expect(screen.queryByText('Test mode')).toBeNull()
})

it.each([
  [{ allowed: undefined, canManageSubscription: undefined, canManage: true }, false],
  [{ allowed: undefined, canManageSubscription: undefined, canManage: undefined }, false],
] as const)('defaults optional management capabilities safely: %s', async (overrides, disabled) => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary(overrides as Partial<BillingSummary>))
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('button', { name: 'Start 14-day trial' })).toHaveProperty('disabled', disabled)
})

it('renders unlimited usage, catalog fallbacks, and manual refresh', async () => {
  vi.mocked(getBillingSummary)
    .mockResolvedValueOnce(summary({
      planPrices: undefined,
      usage: {
        projects: { used: 1, limit: null, resetAt: null },
        internalUsers: { used: 2, limit: 10, resetAt: null },
        comments: { used: 3, limit: 2_000, resetAt: null },
        productAudits: { used: 0, limit: 5, resetAt: null },
      },
    }))
    .mockResolvedValueOnce(summary({ lifecycle: 'checkout_pending' }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByText('1 / Unlimited')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Projects usage' })).not.toHaveAttribute('aria-valuemax')
  expect(screen.getByText('$19')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
  expect(await screen.findByRole('heading', { name: 'Confirming checkout' })).toBeInTheDocument()
})

it.each(['pro', 'studio'] as const)('lets a canceled customer restart the same %s plan', async (plan) => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ plan, lifecycle: 'none', canManageSubscription: true }))
  render(<BillingSettings {...props} />)
  const start = await screen.findByRole('button', { name: 'Start 14-day trial' })
  expect(start).toBeEnabled()
  fireEvent.click(start)
  await waitFor(() => expect(runBillingAction).toHaveBeenCalledWith('/api', 'token', 'checkout', plan, undefined, undefined))
})

it.each(['active', 'trialing'] as const)('keeps same-plan checkout disabled for %s access', async (lifecycle) => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ plan: 'pro', lifecycle }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('button', { name: 'Start 14-day trial' })).toBeDisabled()
})

it('uses the sign-in plan hint only to preselect a card and requires confirmation', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ plan: 'pro', lifecycle: 'none' }))
  render(<BillingSettings {...props} initialPlan="studio" />)
  expect(await screen.findByRole('button', { name: /Studio/ })).toHaveAttribute('aria-pressed', 'true')
  expect(runBillingAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Start 14-day trial' }))
  await waitFor(() => expect(runBillingAction).toHaveBeenCalledWith('/api', 'token', 'checkout', 'studio', undefined, undefined))
})

it('preserves the annual cycle when restarting an annual plan', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ plan: 'pro', lifecycle: 'none', billingCycle: 'yearly' }))
  render(<BillingSettings {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Start 14-day trial' }))
  await waitFor(() => expect(runBillingAction).toHaveBeenCalledWith('/api', 'token', 'checkout', 'pro', undefined, 'yearly'))
})

it('restores the last annual Checkout selection after returning without subscribing', async () => {
  vi.mocked(getBillingSummary).mockResolvedValue(summary({ plan:null,lifecycle:'none',checkoutPlan:'studio',billingCycle:'yearly',planPrices:{pro:{amount:'$192',interval:'year'},studio:{amount:'$492',interval:'year'}} }))
  render(<BillingSettings {...props} />)
  expect(await screen.findByRole('button',{name:/Studio/})).toHaveAttribute('aria-pressed','true')
  expect(screen.getByText('$492')).toBeInTheDocument()
  expect(runBillingAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Start 14-day trial'}))
  await waitFor(()=>expect(runBillingAction).toHaveBeenCalledWith('/api','token','checkout','studio',undefined,'yearly'))
})
