import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, CreditCard, RefreshCw } from 'lucide-react'
import { getBillingSummary, runBillingAction, type BillingAction, type BillingPlan, type BillingPlanKey, type BillingSummary, type BillingUsageItem } from '../api'
import { landingRoute, route } from '../lib/routes'
import { cn } from '../lib/utils'
import { Spinner } from './primitives'

const primaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50'

const usageLabels = {
  projects: 'Projects', internalUsers: 'Internal collaborators', comments: 'Comments', productAudits: 'Product Audits',
} as const

function date(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : null
}

function lifecycleCopy(summary: BillingSummary) {
  const lifecycle = summary.lifecycle ?? summary.status ?? 'none'
  if (lifecycle === 'checkout_pending') return { label: 'Confirming checkout', detail: 'Complete Checkout, then check your status here.' }
  if (lifecycle === 'trialing') return { label: 'Trial active', detail: summary.trialEndsAt ? `Trial ends ${date(summary.trialEndsAt)}.` : 'Your 14-day trial is active.' }
  if (lifecycle === 'active') return { label: 'Cloud active', detail: summary.cancelAtPeriodEnd ? `Access ends ${date(summary.currentPeriodEnd ?? summary.periodEnd)}.` : `Renews ${date(summary.currentPeriodEnd ?? summary.periodEnd)}.` }
  if (lifecycle === 'past_due_grace') return { label: 'Payment needs attention', detail: `Update payment by ${date(summary.graceEndsAt)} to keep creating.` }
  if (lifecycle === 'read_only') return { label: 'Read-only', detail: 'Your work stays available. Restore billing to create again.' }
  return { label: 'Cloud not active', detail: 'Choose a plan to start a 14-day trial.' }
}

function UsageMeter({ label, item }: { label: string; item: BillingUsageItem }) {
  const percent = item.limit === null ? 0 : Math.min(100, Math.round((item.used / Math.max(1, item.limit)) * 100))
  return (
    <div className="min-w-0 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{item.used.toLocaleString()} / {item.limit === null ? 'Unlimited' : item.limit.toLocaleString()}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={item.limit ?? undefined}
        aria-valuenow={item.limit === null ? undefined : item.used}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: item.limit === null ? '0%' : `${percent}%` }} />
      </div>
      {item.resetAt ? <p className="mt-2 text-[11px] text-muted-foreground">Resets {date(item.resetAt)}</p> : null}
    </div>
  )
}

function PlanOption({ plan, price, current, scheduled, selected, disabled, onSelect }: {
  plan: BillingPlan
  price?: { amount: string; interval: string }
  current: boolean
  scheduled: boolean
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex min-h-52 flex-col rounded-lg border p-5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent',
      )}
    >
      <span className="flex w-full items-start justify-between gap-4">
        <span className="text-lg font-semibold">{plan.name}</span>
        {current ? <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">Current</span> : scheduled ? <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">Scheduled</span> : null}
      </span>
      <span className="mt-3"><span className="text-2xl font-semibold tracking-tight">{price?.amount ?? `$${plan.monthlyPriceUsd}`}</span><span className="text-xs text-muted-foreground"> / {price?.interval ?? 'month'}</span></span>
      <span className="mt-4 text-xs leading-5 text-muted-foreground">
        {plan.key === 'pro' ? 'Private projects · Storybook · Agent workflow' : 'Everything in Pro · higher capacity'}
      </span>
      <span className="mt-auto pt-4 text-xs leading-5 text-muted-foreground">
        {plan.limits.projects} projects · {plan.limits.internalUsers} collaborators<br />
        {plan.limits.commentsPerMonth?.toLocaleString()} comments · {plan.limits.auditsPerMonth} audits / month
      </span>
    </button>
  )
}

function safeStripeUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('Billing did not return a destination')
  const destination = new URL(value)
  if (destination.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(destination.hostname)) throw new Error('Billing returned an invalid destination')
  return destination.href
}

export function BillingSettings({ apiBase, accessToken, checkoutState }: { apiBase: string; accessToken: string; checkoutState?: string }) {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanKey>('pro')
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState<BillingAction | null>(null)
  const [refresh, setRefresh] = useState(0)
  const actionRef = useRef<symbol | null>(null)
  const continuationRef = useRef<string | null>(null)
  const lifetime = useRef(0)

  useEffect(() => {
    const request = ++lifetime.current
    const controller = new AbortController()
    actionRef.current = null
    setBusyAction(null)
    setSummary(null)
    setError('')
    getBillingSummary(apiBase, accessToken, refresh > 0, controller.signal)
      .then((value) => {
        if (request !== lifetime.current) return
        setSummary(value)
        if (value.plan === 'pro' || value.plan === 'studio') setSelectedPlan(value.plan)
      })
      .catch((reason) => {
        if (request === lifetime.current) setError(reason instanceof Error ? reason.message : 'Billing is temporarily unavailable')
      })
    return () => { controller.abort(); lifetime.current += 1 }
  }, [apiBase, accessToken, refresh])

  const act = useCallback(async (action: BillingAction, plan?: BillingPlanKey, state?: string) => {
    if (actionRef.current) return
    const actionRequest = Symbol(action)
    actionRef.current = actionRequest
    const request = lifetime.current
    setBusyAction(action)
    setError('')
    try {
      const result = await runBillingAction(apiBase, accessToken, action, plan, state)
      if (request !== lifetime.current) return
      if ('url' in result) window.location.assign(safeStripeUrl(result.url))
      else setRefresh((value) => value + 1)
    } catch (reason) {
      if (action === 'checkout_state') continuationRef.current = null
      if (request === lifetime.current) setError(reason instanceof Error ? reason.message : 'Billing is temporarily unavailable')
    } finally {
      if (request === lifetime.current) setBusyAction(null)
      if (actionRef.current === actionRequest) actionRef.current = null
    }
  }, [apiBase, accessToken])

  useEffect(() => {
    if (!summary?.enabled || !checkoutState || summary.actions?.checkoutState === false || continuationRef.current === checkoutState) return
    continuationRef.current = checkoutState
    window.history.replaceState({}, '', route('/billing'))
    void act('checkout_state', undefined, checkoutState)
  }, [act, checkoutState, summary])

  if (!summary && !error) return <div role="status" className="mt-10 flex items-center gap-3 text-sm text-muted-foreground"><Spinner size={16} />Loading billing…</div>
  if (!summary) return <div role="alert" className="mt-10 rounded-lg border border-border bg-card p-5 text-sm"><p>Billing is temporarily unavailable.</p><button type="button" className="mt-3 font-semibold text-primary underline underline-offset-4" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>
  if (!summary.enabled) return <div className="mt-10 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">Cloud billing is not enabled in this environment. Self-hosted CRRT remains free.</div>

  const lifecycle = summary.lifecycle ?? summary.status ?? 'none'
  const cloudPlans = (summary.plans ?? []).filter((plan): plan is BillingPlan & { key: BillingPlanKey } => plan.hosting === 'cloud')
  const copy = lifecycleCopy(summary)
  const canManage = summary.allowed?.manageBilling ?? true
  const hasCustomer = summary.canManageSubscription ?? summary.canManage ?? false
  const blocked = lifecycle === 'checkout_pending' || busyAction !== null || !canManage
  const hasWriteAccess = lifecycle === 'trialing' || lifecycle === 'active'
  const paymentBlocked = lifecycle === 'past_due_grace' || lifecycle === 'read_only'
  const changingPlan = hasWriteAccess && summary.plan !== selectedPlan
  const canChangePlan = summary.actions?.changePlan !== false
  const selectedPlanName: Record<BillingPlanKey, string> = { pro: 'Pro', studio: 'Studio' }
  const actionLabel = paymentBlocked && hasCustomer
    ? (summary.cancelAtPeriodEnd ? 'Reactivate in Stripe' : 'Restore access')
    : changingPlan
      ? canChangePlan ? `Switch to ${selectedPlanName[selectedPlan]}` : 'Manage plan in Stripe'
      : 'Start 14-day trial'
  const mainAction: BillingAction = paymentBlocked && hasCustomer ? 'portal' : changingPlan && canChangePlan ? 'change_plan' : changingPlan ? 'portal' : 'checkout'

  return (
    <section className="mt-10 space-y-8" aria-labelledby="account-status-heading">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid gap-8 border-b border-border p-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="account-status-heading" className="text-xl font-semibold">{copy.label}</h2>
              {summary.testMode ? <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">Test mode</span> : null}
            </div>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{copy.detail}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {lifecycle === 'checkout_pending' ? (
                <button type="button" className={primaryButton} disabled={busyAction !== null} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={15} />Check status</button>
              ) : (
                <button type="button" className={primaryButton} disabled={blocked || (!paymentBlocked && !changingPlan && summary.plan === selectedPlan)} onClick={() => { void act(mainAction, mainAction === 'portal' ? undefined : selectedPlan) }}>
                  {busyAction ? <Spinner size={15} className="text-primary-foreground" /> : <ArrowUpRight size={15} />}{actionLabel}
                </button>
              )}
              {hasCustomer ? <button type="button" className={secondaryButton} disabled={busyAction !== null} onClick={() => { void act('portal') }}><CreditCard size={15} />Manage billing</button> : null}
            </div>
          </div>
          {summary.usage ? (
            <div className="grid divide-y divide-border sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
              {(Object.keys(usageLabels) as Array<keyof typeof usageLabels>).map((key) => <UsageMeter key={key} label={usageLabels[key]} item={summary.usage![key]} />)}
            </div>
          ) : <p className="text-sm text-muted-foreground">Usage becomes available after Cloud is activated.</p>}
        </div>

        <div className="p-6 lg:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-base font-semibold">Cloud plan</h2><p className="mt-1 text-sm text-muted-foreground">One account covers every project you own.</p></div>
            {summary.scheduledPlan ? <p className="text-xs text-muted-foreground">{summary.scheduledPlan} scheduled for {date(summary.scheduledPlanAt)}</p> : null}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {cloudPlans.map((plan) => <PlanOption key={plan.key} plan={plan} price={summary.planPrices?.[plan.key]} current={summary.plan === plan.key} scheduled={summary.scheduledPlan === plan.key} selected={selectedPlan === plan.key} disabled={blocked} onSelect={() => setSelectedPlan(plan.key)} />)}
          </div>
          {summary.cancelAtPeriodEnd ? <p role="status" className="mt-5 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">Cancellation is scheduled. Your data stays available; use Manage billing to reactivate before {date(summary.currentPeriodEnd ?? summary.periodEnd)}.</p> : null}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5 text-xs text-muted-foreground">
            <p>Need full control? <a href={landingRoute('/docs/self-host')} className="font-semibold text-foreground underline underline-offset-4">Self-hosted is free.</a></p>
            <button type="button" disabled={busyAction !== null} className="inline-flex items-center gap-2 font-semibold text-foreground disabled:opacity-50" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={13} />Refresh status</button>
          </div>
        </div>
      </div>
      {error ? <p role="alert" className="rounded-md border border-border bg-card px-4 py-3 text-sm text-status-rejected">{error} <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setRefresh((value) => value + 1)}>Retry</button></p> : null}
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Check size={13} />Checkout and payment details are handled securely by Stripe.</p>
    </section>
  )
}
