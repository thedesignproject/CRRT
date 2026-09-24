import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, CreditCard } from 'lucide-react'

interface Summary {
  enabled: boolean
  proPrice: { amount: string; interval: string }
  status: string
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  canManage: boolean
}
const button = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring'

export function BillingSettings({ apiBase, accessToken }: { apiBase: string; accessToken: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const lifetime = useRef(0)
  useEffect(() => {
    lifetime.current += 1
    setBusy(false)
    return () => { lifetime.current += 1 }
  }, [apiBase, accessToken])
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    setSummary(null); setError(false)
    fetch(`${apiBase}/v1/billing`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => { if (!response.ok) throw new Error('Billing unavailable'); return response.json() })
      .then((value: Summary) => { if (active) setSummary(value) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [apiBase, accessToken, refresh])

  async function open(action: 'checkout' | 'portal') {
    const requestLifetime = lifetime.current
    setBusy(true); setError(false)
    try {
      const response = await fetch(`${apiBase}/v1/billing`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!response.ok) throw new Error('Billing unavailable')
      const { url } = await response.json() as { url: string }
      const destination = new URL(url)
      if (destination.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(destination.hostname)) throw new Error('Invalid billing URL')
      if (lifetime.current === requestLifetime) window.location.assign(destination.href)
    } catch { if (lifetime.current === requestLifetime) setError(true) }
    finally { if (lifetime.current === requestLifetime) setBusy(false) }
  }
  if (!error && !summary) return <p role="status" className="mt-8 text-xs text-muted-foreground">Loading billing…</p>
  if (!error && !summary?.enabled) return <p className="mt-8 text-xs text-muted-foreground">Billing is not enabled in this environment.</p>
  const canUpgrade = summary && ['free', 'canceled', 'incomplete_expired'].includes(summary.status)
  return <section className="mt-8" aria-labelledby="billing-heading">
    <div className="flex items-center justify-between gap-4 mb-4">
      <h2 id="billing-heading" className="text-xs uppercase tracking-wider text-muted-foreground">Choose your plan</h2>
      <span className="text-[11px] text-muted-foreground">Account subscription</span>
    </div>
    {summary?.enabled && <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-xl font-semibold">Free</h3>
          {canUpgrade && <span className="text-[11px] text-muted-foreground">Current plan</span>}
        </div>
        <div className="mt-6 flex items-baseline gap-2"><span className="text-4xl font-semibold tracking-tight">$0</span><span className="text-xs text-muted-foreground">/ month</span></div>
        <p className="mt-3 text-xs text-muted-foreground">Start collecting feedback with your team.</p>
        <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
          <li className="flex gap-3"><Check size={14} className="shrink-0 text-primary" />Claim up to 3 projects</li>
          <li className="flex gap-3"><Check size={14} className="shrink-0 text-primary" />Up to 5 people per project</li>
          <li className="flex gap-3"><Check size={14} className="shrink-0 text-primary" />Visual feedback and agent handoffs</li>
        </ul>
      </div>
      <div className="rounded-xl border border-primary/40 bg-card overflow-hidden flex flex-col">
      <div className="p-6 sm:p-8 flex-1">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-xl font-semibold">Pro</h3>
          <span className="rounded-full border border-border px-3 py-1 text-[11px] capitalize text-muted-foreground">{canUpgrade ? 'More room to grow' : summary.status.replace(/_/g, ' ')}</span>
        </div>
        <div className="mt-6 flex flex-wrap items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight">{summary.proPrice.amount}</span><span className="text-xs text-muted-foreground">/ {summary.proPrice.interval}</span></div>
        <p className="mt-3 text-xs text-muted-foreground">For teams ready to grow beyond Free.</p>
        <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
          <li className="flex gap-3"><Check size={14} className="shrink-0 text-primary" />Claim more than 3 projects</li>
          <li className="flex gap-3"><Check size={14} className="shrink-0 text-primary" />Add more than 5 people per project</li>
          <li className="flex gap-3"><Check size={14} className="shrink-0 text-primary" />Everything in Free, across your owned projects</li>
        </ul>
        {summary.periodEnd && <p className="mt-6 text-xs text-muted-foreground">{summary.cancelAtPeriodEnd ? 'Ends' : 'Current period ends'} {new Date(summary.periodEnd).toLocaleDateString()}</p>}
      </div>
      <div className="border-t border-border p-6 sm:px-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          {canUpgrade && <button type="button" disabled={busy} className={button} onClick={() => { void open('checkout') }}>Upgrade to Pro <ArrowUpRight size={14} /></button>}
          {summary.canManage && <button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-xs hover:bg-background disabled:opacity-50" onClick={() => { void open('portal') }}><CreditCard size={14} />Manage billing</button>}
        </div>
        <p className="text-[11px] text-muted-foreground">{canUpgrade ? 'Confirm your total at checkout.' : 'Manage your subscription securely with Stripe.'}</p>
      </div>
      </div>
    </div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
      <p>Sandbox · No real charges</p>
      <button type="button" disabled={busy} className="underline underline-offset-4 hover:text-foreground disabled:opacity-50" onClick={() => setRefresh((value) => value + 1)}>Refresh billing status</button>
    </div>
    {error && <p role="alert" className="mt-4 text-xs text-status-rejected">Billing is temporarily unavailable. <button type="button" className="underline" onClick={() => setRefresh((value) => value + 1)}>Retry</button></p>}
  </section>
}
