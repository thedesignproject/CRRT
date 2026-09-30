import { BotIcon } from './icons'

export function AgentLauncher({ count, open, onOpen }: { count: number; open: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}
    aria-controls="agent-drawer" aria-label={`Agents, ${count} selected comments`}
    className="agent-launcher inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors">
    <span className="agent-brand-icon"><BotIcon size={18} /></span>
    Agents
    {count > 0 && <span key={count} className="agent-count agent-count-badge inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums">{count}</span>}
    <span aria-live="polite" aria-atomic="true" className="sr-only">{count} selected comments</span>
  </button>
}
