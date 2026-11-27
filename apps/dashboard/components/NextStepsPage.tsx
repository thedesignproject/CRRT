import { ListChecks } from 'lucide-react'
import { EmptyState, NextStepRow } from '@crrt/ui/crrt'
import type { Comment } from '../lib/types'
import { AgentError, FirstTimeHint, HandoffCTA, WaitingForAgent, type HandoffCTAProps } from './AgentHandoff'
import { DirectSendPanel } from './DirectSendPanel'
import { ACTIVE_DISPATCH_STATES, DISPATCH_LABELS, type DirectDelivery } from '../hooks/useDirectDelivery'

interface NextStepsPageProps {
  projectName: string
  /** Shared comments sent to an agent. */
  comments: Comment[]
  handoff: Omit<HandoffCTAProps, 'count' | 'disabled'> & { sessionReady: boolean }
  agentError: string | null
  agentErrorCode: string | null
  agentConnected: boolean
  onUpgrade: () => void
  /** Opens the agent session again after it failed. */
  onRetry?: () => void
  onOpenComment: (id: string) => void
  onOpenRuns: () => void
  /** Direct delivery to a listening terminal. Without it, Send to Agent copies a prompt. */
  direct?: DirectDelivery
}

/** The project's comments sent to an agent, handed off in one prompt. */
export function NextStepsPage({ projectName, comments, handoff, agentError, agentErrorCode, agentConnected, onUpgrade, onRetry, onOpenComment, onOpenRuns, direct: delivery }: NextStepsPageProps) {
  const direct = delivery?.enabled ? delivery : undefined
  const count = comments.length
  const { sessionReady, ...cta } = handoff
  const unsent = comments.filter((c) => !ACTIVE_DISPATCH_STATES.has(direct?.stateFor(c.id) ?? ''))
  // The prompt handoff stays available whenever no terminal can take the send.
  const showPrompt = !direct || !direct.online
  return (
    <section aria-labelledby="next-steps-title" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-wrap items-end gap-3 border-b border-sidebar-border px-5 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <h1 id="next-steps-title" className="text-[28px] leading-tight font-semibold tracking-[-0.025em]">Next steps</h1>
          <p className="text-text-body">
            {count === 0 ? `Nothing ready for an agent in ${projectName}.` : `${count} ready for an agent in ${projectName}.`}
          </p>
        </div>
        {count > 0 && !agentError && (
          <div className="ml-auto flex w-full max-w-72 flex-col gap-3">
            {direct && <DirectSendPanel delivery={direct} pending={unsent.length} onSend={() => { void direct.send(unsent) }} />}
            {showPrompt && (
              <div>
                <HandoffCTA {...cta} count={count} disabled={!sessionReady} />
                <FirstTimeHint agentName={cta.selectedAgentMeta.name} dismissed={cta.copyStatus === 'copied'} />
              </div>
            )}
          </div>
        )}
      </header>
      {agentError ? (
        <AgentError message={agentError} code={agentErrorCode} onUpgrade={onUpgrade} onRetry={onRetry} />
      ) : count === 0 ? (
        <EmptyState icon={<ListChecks />} title="No next steps yet">
          Use Send to Agent on comments in the Inbox and they show up here.
        </EmptyState>
      ) : (
        <>
          {agentConnected ? (
            <p className="flex items-center gap-2 border-b border-sidebar-border px-5 py-3 text-xs text-agent-working">
              {cta.selectedAgentMeta.name} is connected.
              <button type="button" onClick={onOpenRuns} className="font-medium underline-offset-2 hover:underline">See the run</button>
            </p>
          ) : (
            <WaitingForAgent agentName={cta.selectedAgentMeta.name} active={cta.copyStatus === 'copied'} />
          )}
          <ul aria-label="Next steps">
            {comments.map((c) => {
              const state = direct?.stateFor(c.id)
              return (
                <NextStepRow
                  key={c.id}
                  step={{ id: c.id, title: c.body, requesters: [c.author], comments: 1, status: state && (DISPATCH_LABELS[state] ?? 'Checking delivery'), active: state === 'working' }}
                  onOpen={onOpenComment}
                />
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
