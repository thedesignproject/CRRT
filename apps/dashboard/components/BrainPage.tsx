import { Brain } from 'lucide-react'
import { EmptyState } from '@crrt/ui/crrt'

/** Workspace rules every agent follows. Rules have no storage yet, so the page explains that instead of showing samples. */
export function BrainPage() {
  return (
    <section aria-labelledby="brain-title" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-col gap-1 border-b border-sidebar-border px-5 pt-6 pb-4">
        <h1 id="brain-title" className="text-[28px] leading-tight font-semibold tracking-[-0.025em]">Brain</h1>
        <p className="text-text-body">The rules your agents follow in every project.</p>
      </header>
      <div className="flex w-full max-w-200 flex-col gap-6 px-5 py-6">
        <EmptyState icon={<Brain />} title="No rules yet">
          Rules like “Keep headlines under 8 words” will live here. Agents will read them before they work on a next step.
        </EmptyState>
        <p className="flex items-center gap-2 text-xs text-text-subtle">
          <Brain className="size-3.5" /> Writing rules isn't available yet.
        </p>
      </div>
    </section>
  )
}
