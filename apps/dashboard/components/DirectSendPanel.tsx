import { cn } from '../lib/utils'
import type { DirectDelivery } from '../hooks/useDirectDelivery'
import { BotIcon, SpinnerIcon } from './icons'

interface DirectSendPanelProps {
  delivery: DirectDelivery
  /** Comments not already with an agent. */
  pending: number
  onSend: () => void
}

/** Sends next steps straight to a terminal listening through the CRRT MCP. */
export function DirectSendPanel({ delivery, pending, onSend }: DirectSendPanelProps) {
  const { listeners, destination, setDestination, online, checking, busy, error } = delivery
  const chosen = listeners.find((listener) => listener.listenerId === destination)
  const status = checking && listeners.length === 0
    ? 'Checking for listening terminals…'
    : listeners.length === 0
      ? 'No terminal is listening. Ask your agent to listen for CRRT feedback in this repo, or copy the prompt below.'
      : !destination
        ? 'Choose the terminal that should get these comments.'
        : online
          ? `Sends straight to ${chosen!.label}. Merging and deploying stay with you.`
          : `${chosen!.label} stopped listening. Reconnect it, or copy the prompt below.`

  return (
    <section aria-label="Send to a terminal" className="flex flex-col gap-2">
      {listeners.length > 0 && (
        <label className="flex flex-col gap-1 text-xs text-text-subtle">
          Terminal
          <select
            aria-label="Terminal"
            value={destination}
            disabled={busy}
            onChange={(event) => setDestination(event.target.value)}
            className="h-9 rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-text-strong"
          >
            <option value="">Choose a terminal</option>
            {listeners.map((listener) => (
              <option key={listener.listenerId} value={listener.listenerId} disabled={!listener.online}>
                {listener.label} · {listener.online ? 'Listening' : 'Offline'}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={!online || busy || pending === 0}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-primary/40 bg-card/40 px-3 py-2.5 text-left text-[13px] font-semibold text-foreground btn-press transition-colors',
          'hover:bg-foreground/[0.03] disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {busy ? <SpinnerIcon size={14} /> : <BotIcon size={14} />}
        {busy
          ? 'Sending…'
          : pending === 0
            ? 'All sent'
            : `Send ${pending} ${pending === 1 ? 'crrt' : 'crrts'}${chosen ? ` to ${chosen.label}` : ''}`}
      </button>
      <p role="status" className="text-xs leading-relaxed text-text-subtle">{status}</p>
      {error && <p role="alert" className="text-xs leading-relaxed text-status-rejected">{error}</p>}
    </section>
  )
}
