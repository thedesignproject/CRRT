import posthog from '../../posthog'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, CreditCard, Gift, RefreshCw } from 'lucide-react'
import { getBillingSummary, redeemAppsumoCode, runBillingAction, type BillingAction, type BillingPlan, type BillingPlanKey, type BillingSummary, type BillingUsageItem } from '../api'
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
  if (summary.appsumo) {
    if (summary.paidSubscriptionActive) return { label: 'Cloud active', detail: 'Your Stripe subscription is still active and keeps renewing. AppSumo lifetime Pro takes over when it ends.' }
    return { label: 'AppSumo lifetime · Cloud Pro', detail: 'Cloud Pro is included for life with your AppSumo deal. Upgrade to Studio whenever you need more capacity.' }
  }
  if (summary.isLegacy) {
    if (summary.plan === 'pro') return { label: 'Cloud Pro included', detail: 'Your early-user Pro access is included at no charge. Upgrade to Studio whenever you need more capacity.' }
    if (summary.cancelAtPeriodEnd) return { label: 'Cloud active', detail: `Studio ends ${date(summary.currentPeriodEnd ?? summary.periodEnd)}. Your included Pro access continues.` }
  }
  if (lifecycle === 'checkout_pending') return { label: 'Confirming checkout', detail: 'Complete Checkout, then check your status here.' }
  if (lifecycle === 'trialing') return { label: 'Trial active', detail: summary.trialEndsAt ? `Trial ends ${date(summary.trialEndsAt)}.` : 'Your 14-day trial is active.' }
  if (lifecycle === 'active') return { label: 'Cloud active', detail: summary.cancelAtPeriodEnd ? `Access ends ${date(summary.currentPeriodEnd ?? summary.periodEnd)}.` : `Renews ${date(summary.currentPeriodEnd ?? summary.periodEnd)}.` }
  if (lifecycle === 'past_due_grace') return { label: 'Payment needs attention', detail: `Update payment by ${date(summary.graceEndsAt)} to keep creating.` }
  if (lifecycle === 'read_only') return { label: 'Read-only', detail: 'Your work stays available. Restore billing to create again.' }
  return { label: 'Cloud not active', detail: summary.trialUsed ? 'Choose a plan to subscribe. Your free trial has been used.' : 'Choose a plan to start a 14-day trial.' }
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

function PlanOption({ plan, price, current, included, scheduled, selected, disabled, onSelect }: {
  plan: BillingPlan
  price?: { amount: string; interval: string }
  current: boolean
  included: boolean
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
        {included ? <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">Included</span> : current ? <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">Current</span> : scheduled ? <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">Scheduled</span> : null}
      </span>
      <span className="mt-3"><span className="text-2xl font-semibold tracking-tight">{included ? 'Included' : price?.amount ?? `$${plan.monthlyPriceUsd}`}</span>{included ? null : <span className="text-xs text-muted-foreground"> / {price?.interval ?? 'month'}</span>}</span>
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

function AppsumoRedeemCard({ apiBase, accessToken, summary, focusOnLoad, justRedeemed, onRedeemed }: {
  apiBase: string
  accessToken: string
  summary: BillingSummary
  focusOnLoad: boolean
  justRedeemed: boolean
  onRedeemed: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sectionRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focusOnLoad) return
    sectionRef.current?.scrollIntoView?.({ block: 'center' })
    inputRef.current?.focus()
  }, [focusOnLoad])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    // The input and button are disabled while a request is in flight.
    const value = code.trim()
    if (!value) { setError('Enter your AppSumo code.'); inputRef.current?.focus(); return }
    setBusy(true)
    setError('')
    try {
      await redeemAppsumoCode(apiBase, accessToken, value)
      posthog.capture('appsumo_code_redeemed')
      onRedeemed()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AppSumo redemption is temporarily unavailable.')
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  const stripeWarning = summary.paidSubscriptionActive
    ? <p role="note" className="mt-4 rounded-md bg-muted px-4 py-3 text-sm leading-6 text-foreground">You also have an active Stripe subscription, and it will keep charging you. To stop it, cancel in <strong>Manage billing</strong>. AppSumo lifetime Pro continues after it ends.</p>
    : null

  return (
    <section ref={sectionRef} id="appsumo" aria-labelledby="appsumo-heading" className="rounded-xl border border-border bg-card p-6 lg:p-8">
      <div className="flex items-start gap-3">
        <Gift size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="appsumo-heading" className="text-base font-semibold">Redeem AppSumo code</h2>
          {summary.appsumo ? (
            <div role="status">
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {justRedeemed ? 'Code redeemed. ' : ''}Your AppSumo lifetime deal is active: Cloud Pro with 10 projects, 10 collaborators, 2,000 comments and 5 audits per month.
              </p>
              {stripeWarning}
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Bought CRRT on AppSumo? Paste your code to unlock Cloud Pro for life. One code per account.</p>
              <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start" onSubmit={(event) => { void submit(event) }} noValidate>
                <div className="min-w-0 flex-1 sm:max-w-sm">
                  <label htmlFor="appsumo-code" className="sr-only">AppSumo code</label>
                  <input
                    ref={inputRef}
                    id="appsumo-code"
                    name="appsumo-code"
                    value={code}
                    onChange={(event) => { setCode(event.target.value); if (error) setError('') }}
                    placeholder="AppSumo code"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    maxLength={200}
                    disabled={busy}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'appsumo-error' : undefined}
                    className="min-h-10 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                  />
                </div>
                <button type="submit" className={primaryButton} disabled={busy}>
                  {busy ? <Spinner size={15} className="text-primary-foreground" /> : null}{busy ? 'Redeeming…' : 'Redeem'}
                </button>
              </form>
              {error ? <p id="appsumo-error" role="alert" className="mt-3 text-sm text-status-rejected">{error}</p> : null}
              {summary.paidSubscriptionActive ? <p className="mt-4 text-xs leading-5 text-muted-foreground">You have an active Stripe subscription. Redeeming does not cancel it; cancel it in Manage billing to stop being charged.</p> : null}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function safeStripeUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('Billing did not return a destination')
  const destination = new URL(value)
  if (destination.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(destination.hostname)) throw new Error('Billing returned an invalid destination')
  return destination.href
}

export function BillingSettings({ apiBase, accessToken, checkoutState, initialPlan }: { apiBase: string; accessToken: string; checkoutState?: string; initialPlan?: BillingPlanKey }) {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanKey>(initialPlan ?? 'pro')
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState<BillingAction | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [appsumoRedeemed, setAppsumoRedeemed] = useState(false)
  const [focusAppsumo] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('appsumo') === '1')
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
        if (initialPlan && refresh === 0) setSelectedPlan(initialPlan)
        else if (value.checkoutPlan) setSelectedPlan(value.checkoutPlan)
        else if (value.plan === 'pro' || value.plan === 'studio') setSelectedPlan(value.plan)
      })
      .catch((reason) => {
        if (request === lifetime.current) setError(reason instanceof Error ? reason.message : 'Billing is temporarily unavailable')
      })
    return () => { controller.abort(); lifetime.current += 1 }
  }, [apiBase, accessToken, refresh, initialPlan])

  const act = useCallback(async (action: BillingAction, plan?: BillingPlanKey, state?: string, cycle?: BillingSummary['billingCycle']) => {
    if (actionRef.current) return
    const actionRequest = Symbol(action)
    actionRef.current = actionRequest
    const request = lifetime.current
    setBusyAction(action)
    setError('')
    try {
      const result = await runBillingAction(apiBase, accessToken, action, plan, state, cycle)
      if (request !== lifetime.current) return
      if ('url' in result) {
        if (action === 'checkout' || action === 'change_plan') {
          posthog.capture('billing_checkout_started', { action, plan, billing_cycle: cycle })
        }
        window.location.assign(safeStripeUrl(result.url))
      }
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
  const legacyStudioUpgrade = Boolean(summary.isLegacy && summary.plan === 'pro' && selectedPlan === 'studio')
  const canChangePlan = summary.actions?.changePlan !== false
  const selectedPlanName: Record<BillingPlanKey, string> = { pro: 'Pro', studio: 'Studio' }
  const actionLabel = legacyStudioUpgrade
    ? 'Upgrade to Studio'
    : paymentBlocked && hasCustomer
    ? (summary.cancelAtPeriodEnd ? 'Reactivate in Stripe' : 'Restore access')
    : changingPlan
      ? canChangePlan ? `Switch to ${selectedPlanName[selectedPlan]}` : 'Manage plan in Stripe'
      : summary.trialUsed ? `Subscribe to ${selectedPlanName[selectedPlan]}` : 'Start 14-day trial'
  const mainAction: BillingAction = legacyStudioUpgrade ? 'checkout' : paymentBlocked && hasCustomer ? 'portal' : changingPlan && canChangePlan ? 'change_plan' : changingPlan ? 'portal' : 'checkout'

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
                <button type="button" className={primaryButton} disabled={blocked || (hasWriteAccess && summary.plan === selectedPlan)} onClick={() => { void act(mainAction, mainAction === 'portal' ? undefined : selectedPlan, undefined, mainAction === 'checkout' ? summary.billingCycle : undefined) }}>
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
            {cloudPlans.map((plan) => <PlanOption key={plan.key} plan={plan} price={summary.planPrices?.[plan.key]} current={summary.plan === plan.key} included={Boolean(summary.isLegacy && plan.key === 'pro')} scheduled={summary.scheduledPlan === plan.key} selected={selectedPlan === plan.key} disabled={blocked || Boolean(summary.isLegacy && plan.key === 'pro')} onSelect={() => setSelectedPlan(plan.key)} />)}
          </div>
          {summary.cancelAtPeriodEnd ? <p role="status" className="mt-5 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">Cancellation is scheduled. {summary.isLegacy ? 'After cancellation, you return to your included Cloud Pro access.' : `Your data stays available; use Manage billing to reactivate before ${date(summary.currentPeriodEnd ?? summary.periodEnd)}.`}</p> : null}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5 text-xs text-muted-foreground">
            <p>Need full control? <a href={landingRoute('/docs/self-host')} className="font-semibold text-foreground underline underline-offset-4">Self-hosted is free.</a></p>
            <button type="button" disabled={busyAction !== null} className="inline-flex items-center gap-2 font-semibold text-foreground disabled:opacity-50" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={13} />Refresh status</button>
          </div>
        </div>
      </div>
      <AppsumoRedeemCard
        apiBase={apiBase}
        accessToken={accessToken}
        summary={summary}
        focusOnLoad={focusAppsumo && !appsumoRedeemed}
        justRedeemed={appsumoRedeemed}
        onRedeemed={() => { setAppsumoRedeemed(true); setRefresh((value) => value + 1) }}
      />
      {error ? <p role="alert" className="rounded-md border border-border bg-card px-4 py-3 text-sm text-status-rejected">{error} <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setRefresh((value) => value + 1)}>Retry</button></p> : null}
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Check size={13} />Checkout and payment details are handled securely by Stripe.</p>
    </section>
  )
}
