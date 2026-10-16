import type { BillingPlanKey } from '../api'
import { route } from '../lib/routes'
import { BillingSettings } from './BillingSettings'

export function BillingPage({ apiBase, accessToken, email, checkoutState, initialPlan }: { apiBase: string; accessToken: string; email?: string; checkoutState?: string; initialPlan?: BillingPlanKey }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-5 sm:px-8">
        <a href={route('/')} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">← Workspace</a>
        <span className="max-w-[55vw] truncate text-xs text-muted-foreground">{email}</span>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Billing &amp; usage</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Manage Cloud access and see exactly where your account stands.</p>
        </div>
        <BillingSettings key={accessToken} apiBase={apiBase} accessToken={accessToken} checkoutState={checkoutState} initialPlan={initialPlan} />
      </main>
    </div>
  )
}
