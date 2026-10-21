import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import tokensRaw from '../../../branding/crrt/tokens.css?raw'
import '@fontsource-variable/figtree/wght.css'
import './preview.css'
import { applyDashboardTheme, type DashboardTheme } from '../../../apps/dashboard/lib/theme'
import { CommentList } from '../../../apps/dashboard/components/CommentList'
import { LineChart } from '../../../apps/dashboard/components/LineChart'
import { MetricCard } from '../../../apps/dashboard/components/MetricCard'
import { StatusBreakdown } from '../../../apps/dashboard/components/StatusBreakdown'
import type { Decision } from '../decide'
import type { Rendered } from '../mock-data'

type Selection = Partial<Rendered> & { question?: string; decision?: Decision }

// Glob import so a fresh checkout (no selection.json yet) still loads.
const selection = Object.values(import.meta.glob('./selection.json', { eager: true, import: 'default' }))[0] ?? {}

const style = document.createElement('style')
style.textContent = tokensRaw
document.head.prepend(style)

const pct = (n: number) => `${Math.round(n * 100)}%`

function Decision({ question, decision }: { question: string; decision: Decision }) {
  // The trend answer only matters when Jev picks a chart.
  const rows = [['Component', decision.view], ['Comments', decision.metric], ...(decision.view.choice === 'LineChart' ? [['Over time', decision.trend] as const] : [])] as const
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm text-foreground">“{question}”</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        {rows.map(([name, answer]) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="tabular-nums text-muted-foreground">
              <b className="text-foreground">{answer.choice}</b> {pct(answer.confidence)}
              {' · '}
              {Object.entries(answer.probabilities).filter(([k]) => k !== answer.choice).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, p]) => `${k} ${pct(p)}`).join(', ')}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[10px] text-muted-foreground">{decision.model} · mock data</p>
    </div>
  )
}

function Answer({ s }: { s: Selection }) {
  const [selectedId, setSelectedId] = useState('')
  switch (s.component) {
    case 'MetricCard': return <MetricCard {...s.props!} onOpen={() => {}} />
    case 'StatusBreakdown': return <StatusBreakdown {...s.props!} onSelect={() => {}} />
    case 'LineChart': return <LineChart {...s.props!} />
    case 'CommentList':
      return (
        <div className="h-[480px] w-fit max-w-full overflow-hidden rounded-lg border border-border">
          <CommentList personal filteredComments={s.props!.comments} counts={s.props!.counts} commentsLoading={false} commentsError={null} selectedCommentId={selectedId} setSelectedCommentId={setSelectedId} />
        </div>
      )
    default: return null
  }
}

const initial: DashboardTheme = new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark'

function Preview() {
  const [theme, setTheme] = useState(initial)
  const s = selection as Selection
  const toggle = () => { const next = theme === 'dark' ? 'light' : 'dark'; applyDashboardTheme(next); setTheme(next) }
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-medium tracking-tight">Ask Jev</h1>
        <button type="button" onClick={toggle} className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent">Theme: {theme}</button>
      </header>
      {s.question && s.decision
        ? <><Decision question={s.question} decision={s.decision} /><Answer s={s} /></>
        : <p className="text-xs text-muted-foreground">Waiting for a question — call the ask_jev tool or run bun scripts/jev/cli.ts.</p>}
    </main>
  )
}

applyDashboardTheme(initial)
createRoot(document.getElementById('root')!).render(<Preview />)
