import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import { EmptyState, NextStepRow } from '@crrt/ui/crrt'
import type { NextStepRecord, RuleDecision } from '../api'
import { agentNoun, type Comment } from '../lib/types'
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
  /**
   * The server's grouping of ready comments into steps. Comments no step covers yet, or all of
   * them while steps load or fail, show as rows of their own.
   */
  nextSteps?: { steps: NextStepRecord[] | null; error: string | null; onAnswer: (stepId: string, decision: RuleDecision) => Promise<unknown> }
}

/** The project's comments sent to an agent, grouped into steps and handed off in one prompt. */
export function NextStepsPage({ projectName, comments, handoff, agentError, agentErrorCode, agentConnected, onUpgrade, onRetry, onOpenComment, onOpenRuns, direct: delivery, nextSteps }: NextStepsPageProps) {
  const direct = delivery?.enabled ? delivery : undefined
  const count = comments.length
  // Only steps with comments in this handoff, so a partial selection lists just its steps.
  const ids = new Set(comments.map((c) => c.id))
  const steps = (nextSteps?.steps ?? []).filter((s) => s.comments.some((c) => ids.has(c.id)))
  const grouped = new Set(steps.flatMap((s) => s.comments.map((c) => c.id)))
  const deliveryOf = (commentIds: string[]) => {
    const state = commentIds.map((id) => direct?.stateFor(id)).find(Boolean)
    return { status: state && (DISPATCH_LABELS[state] ?? 'Checking delivery'), active: state === 'working' }
  }
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
                <FirstTimeHint agentName={agentNoun(cta.selectedAgentMeta)} dismissed={cta.copyStatus === 'copied'} />
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
              {agentNoun(cta.selectedAgentMeta, true)} is connected.
              <button type="button" onClick={onOpenRuns} className="font-medium underline-offset-2 hover:underline">See the run</button>
            </p>
          ) : (
            <WaitingForAgent agentName={agentNoun(cta.selectedAgentMeta)} active={cta.copyStatus === 'copied'} />
          )}
          {nextSteps?.error && <p role="alert" className="border-b border-sidebar-border px-5 py-3 text-xs text-destructive">Couldn’t group next steps: {nextSteps.error}</p>}
          <ul aria-label="Next steps">
            {steps.map((s) => (
              <NextStepRow
                key={s.id}
                step={{ id: s.id, title: s.title, tag: s.tag, rules: s.citations.map((c) => c.title), requesters: s.requesters, comments: s.comments.length, ...deliveryOf(s.comments.map((c) => c.id)) }}
                onOpen={() => onOpenComment(s.comments[0].id)}
              >
                {s.status === 'paused' && <RuleConflict step={s} onAnswer={nextSteps!.onAnswer} />}
              </NextStepRow>
            ))}
            {comments.filter((c) => !grouped.has(c.id)).map((c) => (
              <NextStepRow
                key={c.id}
                step={{ id: c.id, title: c.body, requesters: [c.author], comments: 1, ...deliveryOf([c.id]) }}
                onOpen={onOpenComment}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const answerClass = 'inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium text-text-strong ring-1 ring-border hover:bg-accent disabled:opacity-50'

/** The agent paused this step because a comment contradicts a Brain rule: keep the rule or update it. */
function RuleConflict({ step, onAnswer }: { step: NextStepRecord; onAnswer: (stepId: string, decision: RuleDecision) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const conflict = step.conflict!
  const answer = async (decision: RuleDecision) => {
    setBusy(true)
    setError('')
    try {
      await onAnswer(step.id, decision)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div role="group" aria-label="Rule conflict" className="flex flex-col gap-2 rounded-lg bg-surface-3 p-3 ring-1 ring-agent-paused ring-inset">
      <p className="text-xs text-agent-paused">Paused · needs you{conflict.ruleTitle && <> · <span className="font-mono">{conflict.ruleTitle}</span></>}</p>
      <p className="text-text-body">{conflict.question}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => { void answer('keep_rule') }} className={answerClass}>Keep rule</button>
        <button type="button" disabled={busy} onClick={() => { void answer('update_rule') }} className={answerClass}>Update rule</button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
