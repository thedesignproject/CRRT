import { BotIcon } from './icons'

type AgentLauncherProps = {
  readyCount: number
  open: boolean
} & (
  | { disabled?: false; unavailableReason?: never; onOpen: () => void }
  | { disabled: true; unavailableReason: string; onOpen?: never }
)

export function AgentLauncher({
  readyCount,
  open,
  onOpen,
  disabled = false,
  unavailableReason,
}: AgentLauncherProps) {
  const label = disabled
    ? `Agents unavailable: ${unavailableReason}`
    : `Agents, ${readyCount} ready`

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onOpen}
      aria-controls="agent-sidebar"
      aria-expanded={disabled ? false : open}
      aria-label={label}
      disabled={disabled}
      title={disabled ? unavailableReason : undefined}
      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <BotIcon size={16} />
      <span>Agents</span>
      {readyCount > 0 ? (
        <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
          {readyCount}
        </span>
      ) : null}
    </button>
  )
}
