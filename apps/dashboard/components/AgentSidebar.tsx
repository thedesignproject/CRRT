import { useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/utils'
import type { ShareEventsResponse } from '../api'
import { describeEvent } from '../lib/format'
import { AGENTS, type AgentMeta, type Comment } from '../lib/types'
import type { AgentSession } from '../hooks/useAgentSession'
import { BotIcon, CheckIcon, ChevronDownIcon, CopyIcon, SpinnerIcon, XIcon } from './icons'

type CopyStatus = 'idle' | 'copying' | 'copied' | 'error'

interface AgentSidebarProps {
  selectedProject: string
  projectComments: Comment[]
  readyCount: number
  filtered: boolean
  selectedCommentId: string
  onSelectComment: (id: string) => void
  agentSession: AgentSession | null
  agentEvents: ShareEventsResponse['events']
  agentError: string | null
  agentConnected: boolean
  selectedAgent: string
  setSelectedAgent: (id: string) => void
  selectedAgentMeta: AgentMeta
  agentDropdownOpen: boolean
  setAgentDropdownOpen: (open: boolean | ((v: boolean) => boolean)) => void
  copyStatus: CopyStatus
  onCopySessionLink: () => void
  onClose: () => void
}

const HINT_SEEN_KEY = 'crrt:dashboard:handoff-hint-seen'

export function AgentSidebar({
  selectedProject,
  projectComments,
  readyCount,
  filtered,
  selectedCommentId,
  onSelectComment,
  agentSession,
  agentEvents,
  agentError,
  agentConnected,
  selectedAgent,
  setSelectedAgent,
  selectedAgentMeta,
  agentDropdownOpen,
  setAgentDropdownOpen,
  copyStatus,
  onCopySessionLink,
  onClose,
}: AgentSidebarProps) {
  return (
    <aside className="w-[300px] shrink-0 flex flex-col border-l border-border bg-sidebar overflow-y-auto animate-slide-in">
      <div className="px-4 py-4 border-b border-sidebar-border flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground tracking-tight">Agent handoff</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close agent panel"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
        >
          <XIcon size={14} />
        </button>
      </div>

      {!selectedProject ? (
        <EmptyNoProject />
      ) : agentError ? (
        <ErrorState message={agentError} />
      ) : readyCount === 0 ? (
        <EmptyNoReady />
      ) : (
        <ReadyState
          readyCount={readyCount}
          filtered={filtered}
          projectComments={projectComments}
          selectedCommentId={selectedCommentId}
          onSelectComment={onSelectComment}
          agentSession={agentSession}
          agentEvents={agentEvents}
          agentConnected={agentConnected}
          selectedAgent={selectedAgent}
          setSelectedAgent={setSelectedAgent}
          selectedAgentMeta={selectedAgentMeta}
          agentDropdownOpen={agentDropdownOpen}
          setAgentDropdownOpen={setAgentDropdownOpen}
          copyStatus={copyStatus}
          onCopySessionLink={onCopySessionLink}
        />
      )}
    </aside>
  )
}

function EmptyNoProject() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-muted-foreground leading-relaxed max-w-[220px]">
        Select a project to hand off feedback to an AI agent.
      </p>
    </div>
  )
}

function EmptyNoReady() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center animate-fade-in">
      <div
        className="text-foreground/30 select-none leading-none mb-3"
        style={{ fontFamily: 'var(--crrt-font-crt)', fontSize: 88, letterSpacing: '0.04em' }}
        aria-hidden="true"
      >
        0
      </div>
      <p className="text-[13px] text-muted-foreground/80 mb-4">crrts ready for handoff</p>
      <p className="text-[11px] text-muted-foreground/60 leading-relaxed max-w-[230px]">
        <span aria-hidden="true" className="text-foreground/40 mr-1">←</span>
        Mark crrts <span className="text-status-accepted font-semibold">Ready for Agent</span> in the list and they queue here.
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  const friendly = message.toLowerCase().includes('project not found')
    ? "Couldn't open a session for this project."
    : message.toLowerCase().includes('lost connection')
      ? 'Lost connection to the agent session.'
      : "Couldn't open a session."
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center" role="alert" aria-live="polite">
      <div className="w-10 h-10 rounded-full bg-status-rejected/10 flex items-center justify-center mb-3 text-status-rejected">
        <XIcon size={16} />
      </div>
      <p className="text-[13px] text-foreground/90 mb-2">{friendly}</p>
      <p className="text-[11px] text-muted-foreground/70 leading-relaxed max-w-[220px]">
        Switch projects and come back to retry, or check the API server.
      </p>
    </div>
  )
}

interface ReadyStateProps {
  readyCount: number
  filtered: boolean
  projectComments: Comment[]
  selectedCommentId: string
  onSelectComment: (id: string) => void
  agentSession: AgentSession | null
  agentEvents: ShareEventsResponse['events']
  agentConnected: boolean
  selectedAgent: string
  setSelectedAgent: (id: string) => void
  selectedAgentMeta: AgentMeta
  agentDropdownOpen: boolean
  setAgentDropdownOpen: (open: boolean | ((v: boolean) => boolean)) => void
  copyStatus: CopyStatus
  onCopySessionLink: () => void
}

function ReadyState({
  readyCount,
  filtered,
  projectComments,
  selectedCommentId,
  onSelectComment,
  agentSession,
  agentEvents,
  agentConnected,
  selectedAgent,
  setSelectedAgent,
  selectedAgentMeta,
  agentDropdownOpen,
  setAgentDropdownOpen,
  copyStatus,
  onCopySessionLink,
}: ReadyStateProps) {
  return (
    <>
      <HandoffHero count={readyCount} filtered={filtered} />
      <div className="px-4 pb-4 -mt-1">
        <HandoffCTA
          selectedAgent={selectedAgent}
          setSelectedAgent={setSelectedAgent}
          selectedAgentMeta={selectedAgentMeta}
          agentDropdownOpen={agentDropdownOpen}
          setAgentDropdownOpen={setAgentDropdownOpen}
          copyStatus={copyStatus}
          onCopySessionLink={onCopySessionLink}
          disabled={!agentSession}
          count={readyCount}
        />
        <FirstTimeHint agentName={selectedAgentMeta.name} dismissed={copyStatus === 'copied'} />
      </div>
      {agentConnected ? (
        <LiveQueue
          projectComments={projectComments}
          events={agentEvents}
          selectedCommentId={selectedCommentId}
          onSelectComment={onSelectComment}
        />
      ) : (
        <WaitingForAgent agentName={selectedAgentMeta.name} active={copyStatus === 'copied'} />
      )}
    </>
  )
}

function HandoffHero({ count, filtered }: { count: number; filtered: boolean }) {
  const noun = count === 1 ? 'crrt' : 'crrts'
  const caption = filtered ? `${noun} filtered` : `${noun} ready for handoff`
  const numberSize = count >= 100 ? 64 : 84
  const logoSize = count >= 100 ? 56 : 72

  return (
    <div className="px-4 pt-6 pb-4 flex flex-col items-center animate-fade-in">
      <div
        className={cn(
          'inline-flex items-end justify-center gap-2 rounded-2xl px-4 py-1 transition-colors',
          filtered ? 'ring-1 ring-primary/30 bg-primary/5' : '',
        )}
      >
        <img
          src="/crrt-isologo.png"
          alt=""
          width={logoSize}
          height={logoSize}
          style={{
            imageRendering: 'pixelated',
            mixBlendMode: 'lighten',
            marginBottom: '-6px',
          }}
          className="shrink-0 select-none"
          aria-hidden="true"
          draggable={false}
        />
        <div
          className="select-none leading-none"
          style={{
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: numberSize,
            letterSpacing: '0.04em',
            color: 'var(--crrt-phosphor)',
            textShadow: '0 0 18px rgba(255, 176, 0, 0.35)',
          }}
          aria-hidden="true"
        >
          {count}
        </div>
      </div>
      <p className="mt-2 text-[12px] tracking-wide text-muted-foreground">{caption}</p>
    </div>
  )
}

interface HandoffCTAProps {
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

function HandoffCTA({
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
        ? `Paste into ${selectedAgentMeta.name}`
        : copyStatus === 'error'
          ? 'Copy failed — try again'
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

function FirstTimeHint({ agentName, dismissed }: { agentName: string; dismissed: boolean }) {
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

function WaitingForAgent({ agentName, active }: { agentName: string; active: boolean }) {
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

function LiveQueue({ projectComments, events, selectedCommentId, onSelectComment }: LiveQueueProps) {
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
                  'w-full text-left rounded-md border border-l-2 px-2.5 py-2 flex gap-2.5 transition-colors',
                  isActive
                    ? 'border-l-primary border-border bg-white/[0.04]'
                    : 'border-l-transparent border-border/60 bg-card/60 hover:bg-white/[0.02]',
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
  if (c.implementationStatus === 'done') return 4
  return 3
}

function stageLabel(c: Comment) {
  if (c.implementationStatus === 'done') return 'Done'
  if (c.implementationStatus === 'in_progress') return 'Working'
  if (c.implementationStatus === 'claimed') return 'Claimed'
  if (c.implementationStatus === 'blocked') return 'Blocked'
  return 'Ready'
}

function stageDotClass(c: Comment) {
  if (c.implementationStatus === 'done') return 'bg-status-done'
  if (c.implementationStatus === 'in_progress') return 'bg-status-in-progress animate-pulse-dot'
  if (c.implementationStatus === 'claimed') return 'bg-status-claimed'
  if (c.implementationStatus === 'blocked') return 'bg-status-blocked'
  return 'bg-status-accepted'
}

function stageTextClass(c: Comment) {
  if (c.implementationStatus === 'done') return 'text-status-done'
  if (c.implementationStatus === 'in_progress') return 'text-status-in-progress'
  if (c.implementationStatus === 'claimed') return 'text-status-claimed'
  if (c.implementationStatus === 'blocked') return 'text-status-blocked'
  return 'text-status-accepted'
}
