import { cn } from '../lib/utils'
import type { ShareState, ShareEventsResponse } from '../api'
import { describeEvent, formatDocUrl, timeAgo } from '../lib/format'
import { AGENTS, type AgentMeta } from '../lib/types'
import type { AgentSession } from '../hooks/useAgentSession'
import { BotIcon, CheckIcon, ChevronDownIcon, CopyIcon, SpinnerIcon, XIcon } from './icons'
import { AddToCodeButton } from './AddToCodeButton'

type CopyStatus = 'idle' | 'copying' | 'copied' | 'error'

interface AgentSidebarProps {
  apiBase: string
  selectedProject: string
  agentSession: AgentSession | null
  agentShareState: ShareState | null
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

export function AgentSidebar({
  apiBase,
  selectedProject,
  agentSession,
  agentShareState,
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
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-foreground tracking-tight">Agent handoff</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <XIcon size={14} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Let AI agents fix your Ready for Agent items automatically</p>
      </div>

      {selectedProject && (
        <div className="px-4 py-3 border-b border-sidebar-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Install widget</p>
          <AddToCodeButton projectId={selectedProject} apiBase={apiBase} variant="compact" />
          <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
            Copies a setup prompt with package, mount snippet, and this project's credentials.
          </p>
        </div>
      )}

      <div className="px-4 py-4 border-b border-sidebar-border animate-fade-in">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Agent prompt</p>
        <div className="rounded-lg border border-border bg-card p-3 mb-3">
          <p className="text-[11px] font-mono text-foreground break-all leading-relaxed select-all">
            {agentError ? (
              <span className="text-status-rejected">{agentError}</span>
            ) : agentSession ? (
              formatDocUrl(agentSession.docUrl)
            ) : selectedProject ? (
              'Starting session…'
            ) : (
              'Select a project to start a session'
            )}
          </p>
        </div>
        <button
          onClick={onCopySessionLink}
          disabled={!agentSession || copyStatus === 'copying'}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity btn-press',
            copyStatus === 'copied'
              ? 'bg-status-done text-white'
              : copyStatus === 'error'
              ? 'bg-status-rejected text-white'
              : 'bg-primary text-primary-foreground hover:opacity-90',
            (!agentSession || copyStatus === 'copying') && 'opacity-70 pointer-events-none',
          )}
        >
          {copyStatus === 'copying' ? <SpinnerIcon size={13} /> : <CopyIcon size={13} />}
          {copyStatus === 'copying'
            ? 'Copying…'
            : copyStatus === 'copied'
            ? 'Copied ✓'
            : copyStatus === 'error'
            ? 'Copy failed'
            : `Copy ${selectedAgentMeta.name} prompt`}
        </button>
        <div className="mt-3 rounded-md bg-muted/60 border border-border px-3 py-2.5">
          <p className="text-[11px] text-foreground font-medium mb-1.5">How it works</p>
          <ol className="text-[10px] text-muted-foreground leading-relaxed space-y-1 list-decimal list-inside">
            <li>You review feedback and mark items as <span className="text-status-accepted font-semibold">Ready for Agent</span></li>
            <li>Copy this prompt and paste it into your AI agent</li>
            <li>The agent only sees <span className="text-status-accepted font-semibold">Ready for Agent</span> items — nothing else</li>
            <li>It claims, fixes, and marks them <span className="text-status-done font-semibold">Done</span></li>
          </ol>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-sidebar-border">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Your agent</p>
        <div className="relative">
          <button
            onClick={() => setAgentDropdownOpen((v) => !v)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 rounded-lg border bg-card text-xs font-semibold transition-colors',
              agentDropdownOpen
                ? 'border-primary/40 text-foreground'
                : 'border-border text-foreground hover:border-muted-foreground/30'
            )}
          >
            <div className="flex items-center gap-2">
              <BotIcon size={14} className="text-primary" />
              {AGENTS.find((a) => a.id === selectedAgent)?.name}
            </div>
            <ChevronDownIcon size={14} className={cn('text-muted-foreground transition-transform', agentDropdownOpen && 'rotate-180')} />
          </button>
          {agentDropdownOpen && (
            <>
              <button
                type="button"
                aria-label="Close agent selector"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setAgentDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 right-0 mt-1.5 rounded-lg border border-border bg-card shadow-xl shadow-black/30 z-50 py-1 cmd-modal-enter">
                {AGENTS.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => { setSelectedAgent(agent.id); setAgentDropdownOpen(false) }}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-left transition-colors',
                      selectedAgent === agent.id
                        ? 'bg-accent text-foreground'
                        : 'text-foreground/80 hover:bg-accent/50'
                    )}
                  >
                    <span className="text-xs font-semibold">{agent.name}</span>
                    {selectedAgent === agent.id && <CheckIcon size={13} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {AGENTS.find((a) => a.id === selectedAgent)?.hint}
        </p>
      </div>

      {agentConnected && agentShareState && (
        <div className="px-4 py-3 border-b border-sidebar-border animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-agent-active animate-pulse-dot" />
              <div className="absolute inset-0 w-2 h-2 rounded-full animate-pulse-ring" />
            </div>
            <span className="text-[10px] font-bold text-agent-active uppercase tracking-wider">
              {agentShareState.presence.length === 1 ? 'Connected' : `${agentShareState.presence.length} connected`}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {agentShareState.presence.map((p) => (
              <div key={p.agentId} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 animate-scale-in">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <BotIcon size={14} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{p.agentId}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {p.summary ?? p.status}
                  </p>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-agent-active animate-pulse-dot shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-3 flex-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Activity</p>
        {agentEvents.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            {agentSession ? 'No agent activity yet. Paste the prompt into your agent to begin.' : 'Activity will appear once a session starts.'}
          </p>
        ) : (
          <div className="space-y-0 animate-activity">
            {[...agentEvents].reverse().map((ev) => {
              const desc = describeEvent(ev)
              return (
                <div key={ev.id} className="flex gap-3 py-2 border-b border-border/40 last:border-0">
                  <div className="mt-1.5 shrink-0">
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      desc.kind === 'done' ? 'bg-status-accepted' :
                      desc.kind === 'claim' ? 'bg-status-claimed' :
                      desc.kind === 'file' ? 'bg-status-in-progress' :
                      'bg-muted-foreground/30'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-foreground leading-snug">{desc.text}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(ev.createdAt)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
