import { useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/utils'
import type { ShareEventsResponse } from '../api'
import { describeEvent } from '../lib/format'
import { AGENTS, PROMPT_AGENT_ID, type AgentMeta, type Comment } from '../lib/types'
import { BotIcon, CheckIcon, ChevronDownIcon, CopyIcon, SpinnerIcon, XIcon } from './icons'

/** Agent handoff pieces shared by the Next steps and Agent runs pages. */

export type CopyStatus = 'idle' | 'copying' | 'copied' | 'error'

const HINT_SEEN_KEY = 'crrt:dashboard:handoff-hint-seen'

const ACCESS_CODES = new Set(['upgrade_required', 'owner_upgrade_required', 'seat_limit_reached', 'forbidden', 'project_access_denied'])

function agentErrorText(message: string, code: string | null) {
  if (code === 'upgrade_required') return 'Upgrade the project plan to use Agent.'
  if (code === 'owner_upgrade_required') return 'Ask the project owner to upgrade the plan.'
  if (code === 'seat_limit_reached') return 'No Agent seats are available for this project.'
  if (code === 'forbidden' || code === 'project_access_denied') return 'Agent is unavailable for your project role.'
  const lower = message.toLowerCase()
  if (lower.includes('project not found')) return "Couldn't open a session for this project."
  if (lower.includes('lost connection')) return 'Lost connection to the agent session.'
  if (lower.includes('feedback changed')) return 'Feedback changed while the session was opening.'
  if (lower.startsWith('select up to')) return message
  return "Couldn't open a session."
}

export function AgentError({ message, code, onUpgrade, onRetry }: { message: string; code: string | null; onUpgrade: () => void; onRetry?: () => void }) {
  const friendly = agentErrorText(message, code)
  const retryable = !code || !ACCESS_CODES.has(code)
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center" role="alert" aria-live="polite">
      <div className="w-10 h-10 rounded-full bg-status-rejected/10 flex items-center justify-center mb-3 text-status-rejected">
        <XIcon size={16} />
      </div>
      <p className="text-[13px] text-foreground/90 mb-2">{friendly}</p>
      {code === 'upgrade_required' ? (
        <button type="button" onClick={onUpgrade} className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Upgrade plan</button>
      ) : retryable && onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground">Try again</button>
      ) : null}
    </div>
  )
}

export interface HandoffCTAProps {
  selectedAgent: string
  setSelectedAgent: (id: string) => void
  selectedAgentMeta: AgentMeta
  agentDropdownOpen: boolean
  setAgentDropdownOpen: (open: boolean | ((v: boolean) => boolean)) => void
  copyStatus: CopyStatus
  onCopySessionLink: () => void
  disabled: boolean
  count: number
}

export function HandoffCTA({
  selectedAgent,
  setSelectedAgent,
  selectedAgentMeta,
  agentDropdownOpen,
  setAgentDropdownOpen,
  copyStatus,
  onCopySessionLink,
  disabled,
  count,
}: HandoffCTAProps) {
  const label =
    copyStatus === 'copying'
      ? 'Copying…'
      : copyStatus === 'copied'
        ? `Paste into ${selectedAgentMeta.id === PROMPT_AGENT_ID ? 'your agent' : selectedAgentMeta.name}`
        : copyStatus === 'error'
          ? 'Copy failed — try again'
          : selectedAgentMeta.id === PROMPT_AGENT_ID
            ? `Copy ${count} ${count === 1 ? 'crrt' : 'crrts'} as prompt`
            : `Send ${count} ${count === 1 ? 'crrt' : 'crrts'} to ${selectedAgentMeta.name}`

  const Icon =
    copyStatus === 'copying'
      ? SpinnerIcon
      : copyStatus === 'copied'
        ? CheckIcon
        : copyStatus === 'error'
          ? XIcon
          : CopyIcon

  return (
    <div className="relative">
      <div
        className={cn(
          'flex w-full rounded-lg overflow-hidden border transition-colors',
          copyStatus === 'copied'
            ? 'border-status-done/40 bg-status-done/10'
            : copyStatus === 'error'
              ? 'border-status-rejected/40 bg-status-rejected/10'
              : 'border-primary/40 bg-card/40',
        )}
      >
        <button
          type="button"
          onClick={onCopySessionLink}
          disabled={disabled || copyStatus === 'copying'}
          className={cn(
            'flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold text-left btn-press transition-colors',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            copyStatus === 'copied'
              ? 'text-status-done hover:bg-status-done/5'
              : copyStatus === 'error'
                ? 'text-status-rejected hover:bg-status-rejected/5'
                : copyStatus === 'copying'
                  ? 'text-muted-foreground'
                  : 'text-foreground hover:bg-foreground/[0.03]',
          )}
        >
          <span
            className={cn(
              'shrink-0',
              copyStatus === 'copied'
                ? 'text-status-done'
                : copyStatus === 'error'
                  ? 'text-status-rejected'
                  : copyStatus === 'copying'
                    ? 'text-muted-foreground'
                    : 'text-primary',
            )}
          >
            <Icon size={14} />
          </span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
        <button
          type="button"
          onClick={() => setAgentDropdownOpen((v) => !v)}
          aria-label="Choose agent"
          aria-haspopup="listbox"
          aria-expanded={agentDropdownOpen}
          className={cn(
            'shrink-0 w-9 flex items-center justify-center border-l border-border text-foreground transition-colors',
            'hover:bg-foreground/[0.05]',
          )}
        >
          <ChevronDownIcon
            size={14}
            className={cn('text-muted-foreground transition-transform', agentDropdownOpen && 'rotate-180')}
          />
        </button>
      </div>

      {agentDropdownOpen && (
        <>
          <button
            type="button"
            aria-label="Close agent selector"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setAgentDropdownOpen(false)}
          />
          <div
            role="listbox"
            className="absolute top-full left-0 right-0 mt-1.5 rounded-lg border border-border bg-card shadow-xl shadow-black/30 z-50 py-1 cmd-modal-enter"
          >
            {AGENTS.map((agent) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={selectedAgent === agent.id}
                onClick={() => {
                  setSelectedAgent(agent.id)
                  setAgentDropdownOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-left transition-colors',
                  selectedAgent === agent.id
                    ? 'bg-accent/20 text-foreground'
                    : 'text-foreground/80 hover:bg-accent/10',
                )}
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <BotIcon size={13} className="text-muted-foreground" />
                  {agent.name}
                </span>
                {selectedAgent === agent.id && <CheckIcon size={13} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function FirstTimeHint({ agentName, dismissed }: { agentName: string; dismissed: boolean }) {
  const [seen, setSeen] = useState(true)

  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(HINT_SEEN_KEY) === '1')
    } catch {
      setSeen(true)
    }
  }, [])

  useEffect(() => {
    if (!dismissed) return
    try {
      window.localStorage.setItem(HINT_SEEN_KEY, '1')
    } catch {}
    setSeen(true)
  }, [dismissed])

  if (seen) return null

  return (
    <p className="mt-3 text-[11px] text-muted-foreground/70 leading-relaxed text-center px-2">
      Paste into {agentName} — it'll work the queue and update status live here.
    </p>
  )
}

export function WaitingForAgent({ agentName, active }: { agentName: string; active: boolean }) {
  if (!active) return null
  return (
    <div className="px-4 py-3 border-t border-sidebar-border flex items-center gap-2 animate-fade-in">
      <span className="relative inline-flex w-2 h-2">
        <span className="absolute inset-0 rounded-full bg-agent-active animate-pulse-dot" />
        <span className="absolute inset-0 rounded-full animate-pulse-ring" />
      </span>
      <span className="text-[11px] text-muted-foreground">Waiting for {agentName}…</span>
    </div>
  )
}

interface LiveQueueProps {
  projectComments: Comment[]
  events: ShareEventsResponse['events']
  selectedCommentId: string
  onSelectComment: (id: string) => void
}

export function LiveQueue({ projectComments, events, selectedCommentId, onSelectComment }: LiveQueueProps) {
  const items = useMemo(() => {
    return projectComments
      .filter((c) => c.reviewStatus === 'accepted')
      .sort((a, b) => stagePriority(a) - stagePriority(b))
  }, [projectComments])

  const latestEventByComment = useMemo(() => {
    const map = new Map<string, ShareEventsResponse['events'][number]>()
    for (const ev of events) {
      if (!ev.commentId) continue
      const prev = map.get(ev.commentId)
      if (!prev || ev.id > prev.id) map.set(ev.commentId, ev)
    }
    return map
  }, [events])

  if (items.length === 0) {
    return (
      <div className="px-4 py-4 border-t border-sidebar-border">
        <p className="text-[11px] text-muted-foreground/60">Queue is empty.</p>
      </div>
    )
  }

  return (
    <div
      className="px-4 py-4 border-t border-sidebar-border flex-1"
      role="region"
      aria-label="Agent queue"
      aria-live="polite"
    >
      <ul className="space-y-2">
        {items.map((c) => {
          const ev = latestEventByComment.get(c.id)
          const stage = stageLabel(c)
          const isActive = c.id === selectedCommentId
          return (
            <li key={c.id} className="animate-fade-in">
              <button
                type="button"
                onClick={() => onSelectComment(c.id)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'w-full text-left rounded-md border px-2.5 py-2 flex gap-2.5 transition-colors',
                  isActive
                    ? 'border-border bg-accent'
                    : 'border-border/60 bg-card/60 hover:bg-accent/70',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', stageDotClass(c))}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-[12px] leading-snug line-clamp-2',
                      isActive ? 'text-foreground' : 'text-foreground/90',
                    )}
                  >
                    {c.body}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 flex items-center gap-1.5">
                    <span className={stageTextClass(c)}>{stage}</span>
                    {ev && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{describeEvent(ev).text}</span>
                      </>
                    )}
                  </p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function stagePriority(c: Comment) {
  if (c.implementationStatus === 'in_progress') return 0
  if (c.implementationStatus === 'claimed') return 1
  if (c.implementationStatus === 'blocked') return 2
  if (c.implementationStatus === 'ready_for_testing') return 4
  if (c.implementationStatus === 'done') return 5
  return 3
}

function stageLabel(c: Comment) {
  if (c.implementationStatus === 'done') return 'Done'
  if (c.implementationStatus === 'ready_for_testing') return 'Testing'
  if (c.implementationStatus === 'in_progress') return 'Working'
  if (c.implementationStatus === 'claimed') return 'Claimed'
  if (c.implementationStatus === 'blocked') return 'Blocked'
  return 'Ready'
}

function stageDotClass(c: Comment) {
  if (c.implementationStatus === 'done') return 'bg-status-done'
  if (c.implementationStatus === 'ready_for_testing') return 'bg-status-ready-for-testing'
  if (c.implementationStatus === 'in_progress') return 'bg-status-in-progress animate-pulse-dot'
  if (c.implementationStatus === 'claimed') return 'bg-status-claimed'
  if (c.implementationStatus === 'blocked') return 'bg-status-blocked'
  return 'bg-status-accepted'
}

function stageTextClass(c: Comment) {
  if (c.implementationStatus === 'done') return 'text-status-done'
  if (c.implementationStatus === 'ready_for_testing') return 'text-status-ready-for-testing'
  if (c.implementationStatus === 'in_progress') return 'text-status-in-progress'
  if (c.implementationStatus === 'claimed') return 'text-status-claimed'
  if (c.implementationStatus === 'blocked') return 'text-status-blocked'
  return 'text-status-accepted'
}
