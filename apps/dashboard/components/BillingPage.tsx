import { route } from '../lib/routes'
import { BillingSettings } from './BillingSettings'

export function BillingPage({ apiBase, accessToken, email }: { apiBase: string; accessToken: string; email: string | undefined }) {
  return <div className="min-h-screen bg-background text-foreground">
    <header className="flex items-center justify-between gap-4 px-5 h-[60px] border-b border-border bg-card">
      <a href={route('/')} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">← Dashboard</a>
      <span className="truncate text-xs text-muted-foreground">{email}</span>
    </header>
    <main className="max-w-5xl mx-auto px-6 py-8 sm:py-12">
      <p className="text-[11px] uppercase tracking-wider text-primary mb-3">/ Account</p>
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-2 text-sm text-muted-foreground">Keep the feedback flowing. Manage your plan here.</p>
      <BillingSettings key={accessToken} apiBase={apiBase} accessToken={accessToken} />
    </main>
  </div>
}
