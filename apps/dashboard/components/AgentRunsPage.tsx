import { Bot } from 'lucide-react'
import { AgentRunCard, EmptyState, type AgentStep } from '@crrt/ui/crrt'
import type { ShareEventsResponse } from '../api'
import { describeEvent } from '../lib/format'
import type { Comment } from '../lib/types'
import { AgentError, LiveQueue } from './AgentHandoff'

interface AgentRunsPageProps {
  projectName: string
  agentName: string
  connected: boolean
  queue: Comment[]
  events: ShareEventsResponse['events']
  agentError: string | null
  agentErrorCode: string | null
  /** Status from a handoff started elsewhere, e.g. a bulk selection. */
  notice?: string
  selectedCommentId: string
  onUpgrade: () => void
  /** Opens the agent session again after it failed. */
  onRetry?: () => void
  onOpenComment: (id: string) => void
  onOpenNextSteps: () => void
}

const STEP_LIMIT = 8

function clock(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** The live agent session for the selected project. History needs a backend; see the PR notes. */
export function AgentRunsPage({ projectName, agentName, connected, queue, events, agentError, agentErrorCode, notice, selectedCommentId, onUpgrade, onRetry, onOpenComment, onOpenNextSteps }: AgentRunsPageProps) {
  const open = queue.filter((c) => c.implementationStatus !== 'done' && c.implementationStatus !== 'ready_for_testing').length
  const steps: AgentStep[] = events.slice(-STEP_LIMIT).map((ev, i, list) => ({
    t: clock(ev.createdAt),
    tool: describeEvent(ev).text,
    state: connected && i === list.length - 1 ? 'running' : 'done',
  }))
  return (
    <section aria-labelledby="agent-runs-title" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-col gap-1 border-b border-sidebar-border px-5 pt-6 pb-4">
        <h1 id="agent-runs-title" className="text-[28px] leading-tight font-semibold tracking-[-0.025em]">Agent runs</h1>
        <p className="text-text-body">{connected ? `${agentName} is working in ${projectName}.` : `No agent is connected to ${projectName}.`}</p>
      </header>
      <div className="flex w-full max-w-200 flex-col gap-6 px-5 py-6">
        {notice && <p role="status" className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">{notice}</p>}
        {agentError ? (
          <AgentError message={agentError} code={agentErrorCode} onUpgrade={onUpgrade} onRetry={onRetry} />
        ) : connected ? (
          <section aria-labelledby="runs-now" className="flex flex-col gap-3">
            <h2 id="runs-now" className="text-[15px] font-semibold">Working</h2>
            <AgentRunCard
              agent={`${agentName} · ${projectName}`}
              state="working"
              title={open === 1 ? 'Working through 1 next step.' : `Working through ${open} next steps.`}
              steps={steps}
            >
              <LiveQueue projectComments={queue} events={events} selectedCommentId={selectedCommentId} onSelectComment={onOpenComment} />
            </AgentRunCard>
          </section>
        ) : (
          <EmptyState
            icon={<Bot />}
            title="No agent running"
            action={<button type="button" onClick={onOpenNextSteps} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent">Go to Next steps</button>}
          >
            Send next steps to an agent and its run shows up here live.
          </EmptyState>
        )}
        <p className="flex items-center gap-2 text-xs text-text-subtle">
          <Bot className="size-3.5" /> Runs show here while an agent is connected. Past runs aren't kept yet.
        </p>
      </div>
    </section>
  )
}
