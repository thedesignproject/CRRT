import { BotIcon } from './icons'

type AgentLauncherProps = {
  count: number
  open: boolean
} & (
  | { disabled?: false; unavailableReason?: never; onOpen: () => void }
  | { disabled: true; unavailableReason: string; onOpen?: never }
)

export function AgentLauncher({ count, open, onOpen, disabled = false, unavailableReason }: AgentLauncherProps) {
  const label = disabled
    ? `Agents unavailable: ${unavailableReason}`
    : `Agents, ${count} selected comments`

  return <button type="button" onClick={disabled ? undefined : onOpen} aria-haspopup="dialog" aria-expanded={open}
    aria-controls="agent-drawer" aria-label={label} disabled={disabled} title={disabled ? unavailableReason : undefined}
    className="agent-launcher inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50">
    <span className="agent-brand-icon"><BotIcon size={18} /></span>
    Agents
    {count > 0 && <span key={count} className="agent-count agent-count-badge inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums">{count}</span>}
    <span aria-live="polite" aria-atomic="true" className="sr-only">{count} selected comments</span>
  </button>
}
