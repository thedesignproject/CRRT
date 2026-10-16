import { useEffect, useRef, useState } from 'react'
import type { EntitlementSummary } from '../../../api/_lib/billing/entitlements'
import type { CloudPlan } from '../../../api/_lib/billing/plans'

type Plan = { id: CloudPlan; name: string; amount: string; interval: string; projects: number; internal_users: number; comments: number; product_audits: number }
type Summary = { enabled: boolean; testMode: boolean; canManage: boolean; cancelAtPeriodEnd?: boolean; periodEnd?: string | null; entitlements: EntitlementSummary; plans: Plan[] }
const button = 'rounded-full border border-border px-5 py-3 text-xs font-semibold hover:bg-background disabled:opacity-50'
const resources = [['projects','Projects'],['internal_users','Internal users'],['comments','New comments'],['product_audits','Product Audits']] as const

export function BillingSettings({ apiBase, accessToken }: { apiBase: string; accessToken: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const lifetime = useRef(0)
  useEffect(() => {
    let active = true
    lifetime.current += 1; setSummary(null); setError(''); setBusy(false)
    fetch(`${apiBase}/v1/billing`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async response => { if (!response.ok) throw new Error('Billing is temporarily unavailable'); return response.json() })
      .then((value: Summary) => { if (active) setSummary(value) })
      .catch(() => { if (active) setError('Billing is temporarily unavailable. Retry shortly.') })
    return () => { active = false; lifetime.current += 1 }
  }, [apiBase, accessToken, refresh])
  async function open(action: 'checkout' | 'portal', plan?: CloudPlan) {
    const requestLifetime = lifetime.current
    setBusy(true); setError('')
    try {
      const response = await fetch(`${apiBase}/v1/billing`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(plan ? { plan } : {}) }),
      })
      if (!response.ok) throw new Error('Billing is unavailable')
      const { url } = await response.json() as { url: string }
      const destination = new URL(url)
      if (destination.protocol !== 'https:' || !['checkout.stripe.com','billing.stripe.com'].includes(destination.hostname)) throw new Error('Invalid billing URL')
      if (lifetime.current === requestLifetime) window.location.assign(destination.href)
    } catch { if (lifetime.current === requestLifetime) setError('Billing is temporarily unavailable. Retry shortly.') }
    finally { if (lifetime.current === requestLifetime) setBusy(false) }
  }
  if (!summary) return error ? <p role="alert" className="mt-8 text-xs text-muted-foreground">{error} <button onClick={() => setRefresh(value => value+1)}>Retry</button></p> : <p role="status" className="mt-8 text-xs text-muted-foreground">Loading billing…</p>
  if (!summary.enabled) return <p className="mt-8 text-xs text-muted-foreground">Billing is not enabled in this environment.</p>
  const entitlement = summary.entitlements
  const existing = summary.canManage && !['none','legacy','canceled','incomplete_expired'].includes(entitlement.status)
  return <section className="mt-8 space-y-6" aria-label="Account plans">
    {summary.testMode && <p className="text-xs text-muted-foreground">Sandbox · No real charges</p>}
    {entitlement.isLegacy && <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm"><strong>Legacy user · Cloud Pro included</strong><br />As an early CRRT user, you have Cloud Pro included at no charge for now. Upgrade to Cloud Studio whenever you need more capacity. If you cancel Studio, you return to your included Pro access.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm">Subscription: <span className="capitalize">{entitlement.status === 'legacy' ? 'Legacy · Cloud Pro included' : entitlement.status.replace(/_/g,' ')}</span></p>
      {summary.canManage && <button className={button} disabled={busy} onClick={() => { void open('portal') }}>Manage billing</button>}
    </div>
    {summary.cancelAtPeriodEnd && summary.periodEnd && entitlement.canWrite && <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">Your subscription cancels on {new Date(summary.periodEnd).toLocaleDateString()}. You can keep using Cloud until then. {entitlement.isLegacy ? 'After cancellation, you return to your included Cloud Pro access.' : 'After cancellation, your feedback remains readable and exportable.'}</p>}
    {!entitlement.canWrite && <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">The owner needs an active Cloud trial or subscription to write. Existing feedback remains readable and exportable.</p>}
    <div className="grid gap-4 md:grid-cols-2">
      {summary.plans.map(plan => <article key={plan.id} className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <h2 className="text-xl font-semibold">{plan.name}</h2>
        <p className="mt-4"><span className="text-3xl font-semibold">{entitlement.isLegacy && plan.id === 'pro' ? 'Included' : plan.amount}</span><span className="text-xs text-muted-foreground">{!(entitlement.isLegacy && plan.id === 'pro') && <> / {plan.interval}</>}</span></p>
        <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
          <li>{plan.projects} projects · {plan.internal_users} internal users</li>
          <li>Unlimited guests</li><li>{plan.comments.toLocaleString()} new comments / billing month</li>
          <li>{plan.product_audits} Product Audits / billing month</li>
          <li>Dashboard, widget, extension sync, integrations, and agent handoff</li>
        </ul>
        <button className={`${button} mt-6`} disabled={busy || ((entitlement.canWrite && entitlement.plan === plan.id) || (entitlement.isLegacy && plan.id === 'pro'))} onClick={() => { void open(existing ? 'portal' : 'checkout', existing ? undefined : plan.id) }}>
          {entitlement.isLegacy && plan.id === 'pro' ? 'Included for legacy users' : entitlement.canWrite && entitlement.plan === plan.id ? 'Current plan' : existing ? 'Change plan' : entitlement.trialUsed ? `Subscribe to ${plan.name}` : `Start ${plan.name} trial`}
        </button>
      </article>)}
    </div>
    <p className="text-xs text-muted-foreground">{entitlement.trialUsed ? 'Monthly billing. Taxes are added at checkout when applicable.' : '14-day trial. Payment method required. No charge until the trial ends. Taxes are added at checkout when applicable.'}</p>
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm"><caption className="p-4 text-left font-semibold">Usage across projects you own</caption>
        <thead><tr><th className="px-4 pb-3">Resource</th><th className="px-4 pb-3">Used</th><th className="px-4 pb-3">Limit</th></tr></thead>
        <tbody>{resources.map(([key,label]) => <tr key={key} className="border-t border-border"><td className="p-4">{label}</td><td className="p-4">{entitlement.usage[key]}</td><td className="p-4">{entitlement.limits[key] ?? 'Choose a plan'}</td></tr>)}</tbody>
      </table>
    </div>
    {entitlement.resetAt && <p className="text-xs text-muted-foreground">Comments and audit credits reset {new Date(entitlement.resetAt).toLocaleDateString()}. Project and user capacity follows current usage. Deleting a comment does not refund its usage.</p>}
    <button className="text-xs underline underline-offset-4" disabled={busy} onClick={() => setRefresh(value => value+1)}>Refresh billing status</button>
    {error && <p role="alert" className="text-xs text-muted-foreground">{error}</p>}
  </section>
}
