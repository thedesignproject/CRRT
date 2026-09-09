import type { ExternalWorkProvider } from '../api'

export function ExternalWorkProviderDialog({ onCancel, onSelect }: { onCancel(): void; onSelect(provider: ExternalWorkProvider): void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <div role="dialog" aria-modal="true" aria-labelledby="external-provider-title" className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl">
      <h2 id="external-provider-title" className="text-base font-semibold text-foreground">Send feedback to…</h2>
      <p className="mt-1 text-xs text-muted-foreground">Choose a connected project integration.</p>
      <div className="mt-4 grid gap-2">
        {(['github', 'linear', 'jira'] as const).map((provider) => <button key={provider} type="button" onClick={() => onSelect(provider)} className="rounded-lg border border-border bg-background px-4 py-3 text-left text-sm font-semibold text-foreground hover:border-primary/50 hover:bg-accent">{provider === 'github' ? 'GitHub' : provider === 'linear' ? 'Linear' : 'Jira'}</button>)}
      </div>
      <div className="mt-4 flex justify-end"><button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">Cancel</button></div>
    </div>
  </div>
}
