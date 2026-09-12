import { BotIcon } from './icons'

export function AgentLauncher({ count, open, onOpen }: { count: number; open: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}
    aria-controls="agent-drawer" aria-label={`Agents, ${count} selected comments`}
    className="agent-launcher fixed right-6 bottom-14 z-20 flex items-center gap-3 rounded-full border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
    <span className="text-primary"><BotIcon size={24} /></span>
    Agents
    <span aria-live="polite" aria-atomic="true" className="min-w-6 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs text-primary-foreground">{count}</span>
  </button>
}
