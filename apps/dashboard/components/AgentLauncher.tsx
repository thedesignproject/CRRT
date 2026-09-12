import { BotIcon } from './icons'

export function AgentLauncher({ count, open, onOpen }: { count: number; open: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}
    aria-controls="agent-drawer" aria-label={`Agents, ${count} selected comments`}
    className="agent-launcher inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary">
    <span className="agent-brand-icon"><BotIcon size={18} /></span>
    Agents
    <span aria-live="polite" aria-atomic="true" className="min-w-5 text-center text-xs tabular-nums"><span key={count} className="agent-count inline-block">{count}</span></span>
  </button>
}
