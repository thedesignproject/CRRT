import type { AuditCandidate, AuditEvidence, AuditMode, AuditSourceCoverage } from '../../../shared/product-audit/contracts.js'
import { admitAuditFindings, type VerificationDecision } from './admission.js'
import { auditBudgets, auditLocalExecution, auditModelInterStageDelay } from './config.js'
import { DockerAuditExplorer, FixtureAuditExplorer, SandboxAuditExplorer, type AuditExplorer } from './explorer.js'
import { auditErrorLogFields, auditServerLog } from './log.js'
import { AuditModelError, AuditModelRateLimitError, FakeAuditModel, OpenAiCompatibleAuditModel, runCritic, runVerifier, type AuditModel } from './model.js'
import * as store from './store.js'
import { validateAuditUrl } from './url-safety.js'

export type PipelineStage = 'explorer' | 'critic' | 'verifier'
export type AuditStageResult = { status: string; count?: number }

export class AuditStageBusyError extends Error {
  constructor(message: string, public readonly retryAfterMs = 1_000) {
    super(message)
  }
}
export class AuditStageRateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('audit_model_rate_limited')
  }
}

export type PipelineStore = Pick<typeof store,
  'acquireAuditStage' | 'renewAuditStage' | 'completeAuditStage' | 'finalizeAudit' | 'finishAuditPartial'
  | 'loadAuditPipelineState' | 'deferAuditStageRetry' | 'finishAuditModelRateLimited' | 'markAuditFailed'>

export type PipelineDependencies = {
  store: PipelineStore
  explorer: AuditExplorer
  model: AuditModel
  validateTarget: typeof validateAuditUrl
  wait: (milliseconds: number) => Promise<void>
  interStageDelayMs: number
  log: typeof auditServerLog
}

function fixtureModel(evidence: AuditEvidence[]) {
  const clean = evidence.every((item) => item.id === 'clean-navigation')
  const candidates: AuditCandidate[] = clean ? [] : [
    {
      id: 'trial-promise-conflict', kind: 'problem', title: 'Trial promise conflicts with the signup gate',
      summary: 'The pricing promise says no card is required while signup requires one.', impact: 'high', confidence: 0.99,
      evidenceIds: ['pricing-promise', 'signup-card-field'], recommendation: 'Align the trial promise and the actual signup requirements.',
    },
    {
      id: 'destructive-form-error', kind: 'problem', title: 'A validation error destroys completed form work',
      summary: 'An invalid promo code clears fields that the user already completed.', impact: 'high', confidence: 0.97,
      evidenceIds: ['form-reset'], recommendation: 'Preserve unrelated form state when validation fails.',
    },
  ]
  const decisions: VerificationDecision[] = candidates.map((candidate) => ({ candidateId: candidate.id, admitted: true, contradictions: [] }))
  return new FakeAuditModel({ critic: { candidates }, verifier: { decisions } })
}

export function defaultPipelineDependencies(mode: AuditMode, evidence: AuditEvidence[] = []): PipelineDependencies {
  const fixture = mode === 'local-fixture'
  return {
    store,
    explorer: fixture ? new FixtureAuditExplorer() : auditLocalExecution() ? new DockerAuditExplorer() : new SandboxAuditExplorer(),
    model: fixture ? fixtureModel(evidence) : new OpenAiCompatibleAuditModel(),
    validateTarget: validateAuditUrl,
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    interStageDelayMs: fixture ? 0 : auditModelInterStageDelay(),
    log: auditServerLog,
  }
}

function terminal(status: string) {
  return status === 'terminal' || status === 'cancelled'
}

function persisted(status: string, accepted: string[]) {
  if (terminal(status) || accepted.includes(status)) return status
  if (status === 'lease_expired' || status === 'lease_mismatch' || status === 'busy') {
    throw new AuditStageBusyError('audit_stage_lease_lost')
  }
  throw new Error('audit_stage_persistence_failed')
}

const budgetReason = 'The audit reached its overall time budget.'
const stageLeaseSeconds = 60
const stageLeaseHeartbeatMs = 20_000

function remainingBudget(run: Record<string, any>, wallClockMs: number) {
  const started = run.started_at ? new Date(run.started_at).getTime() : Date.now()
  const deadlineMs = started + wallClockMs
  return { deadlineMs, remainingMs: Math.max(0, deadlineMs - Date.now()) }
}

function partialCoverage(coverage: AuditSourceCoverage): AuditSourceCoverage {
  return { ...coverage, partialReason: coverage.partialReason || budgetReason }
}

async function withLeaseHeartbeat<T>(
  resolved: PipelineDependencies,
  auditId: string,
  stage: PipelineStage,
  leaseToken: string,
  work: () => Promise<T>,
) {
  let renewal: Promise<void> | null = null
  let renewalFailure: unknown
  const renew = () => {
    if (renewal) return
    renewal = resolved.store.renewAuditStage(auditId, stage, leaseToken, stageLeaseSeconds)
      .then((result) => {
        if (result.status !== 'renewed') throw new AuditStageBusyError(`audit_stage_lease_${result.status}`)
      })
      .catch((error) => { renewalFailure = error })
      .finally(() => { renewal = null })
  }
  const timer = setInterval(renew, stageLeaseHeartbeatMs)
  try {
    const result = await work()
    if (renewal) await renewal
    if (renewalFailure) throw renewalFailure
    return result
  } finally {
    clearInterval(timer)
  }
}

async function finishModelBudgetPartial(
  resolved: PipelineDependencies,
  auditId: string,
  stage: 'critic' | 'verifier',
  leaseToken: string,
  coverage: AuditSourceCoverage,
  error: AuditModelError,
) {
  const timeout = error.code === 'timeout'
  const code = timeout ? 'model_timeout' : 'model_input_budget'
  const reason = timeout
    ? 'The model stage reached the audit time budget.'
    : 'The collected evidence exceeded the safe model input budget.'
  const result = await resolved.store.finishAuditPartial(
    auditId, stage, leaseToken, { ...coverage, partialReason: reason }, code, reason,
  )
  const status = result.status === 'unchanged' ? 'terminal' : persisted(result.status, ['partial'])
  resolved.log('warn', 'run.partial', { auditId, stage, reason: code, persistenceStatus: status })
  return { status, count: 0 }
}

async function deferRateLimitedStage(
  resolved: PipelineDependencies,
  auditId: string,
  stage: 'critic' | 'verifier',
  leaseToken: string,
  error: AuditModelRateLimitError,
  deadlineMs: number,
) {
  const log = resolved.log
  const requestedRetryAt = new Date(Date.now() + error.retryAfterMs).toISOString()
  const deferred = await resolved.store.deferAuditStageRetry(auditId, stage, leaseToken, requestedRetryAt)
  const status = persisted(deferred.status, ['deferred'])
  log('warn', 'stage.rate_limited', {
    auditId,
    stage,
    persistenceStatus: status,
    retryAt: deferred.retryAt || requestedRetryAt,
    ...auditErrorLogFields(error),
  })
  if (terminal(status)) return { status }
  const retryAt = deferred.retryAt ? new Date(deferred.retryAt).getTime() : Date.now() + error.retryAfterMs
  if (retryAt >= deadlineMs) {
    const finished = await resolved.store.finishAuditModelRateLimited(auditId)
    log('warn', 'run.partial', { auditId, reason: 'model_rate_limit_budget_exhausted', persistenceStatus: finished.status })
    return { status: finished.status === 'unchanged' ? 'terminal' : persisted(finished.status, ['partial']) }
  }
  throw new AuditStageRateLimitedError(Math.max(1_000, retryAt - Date.now()))
}

export async function executeAuditStage(auditId: string, stage: PipelineStage, deps?: PipelineDependencies): Promise<AuditStageResult> {
  const state = await (deps?.store || store).loadAuditPipelineState(auditId)
  const resolved = deps || defaultPipelineDependencies(state.run.mode as AuditMode, state.evidence)
  const budgets = state.run.budgets || auditBudgets()
  const { deadlineMs, remainingMs } = remainingBudget(state.run, budgets.wallClockMs)
  const lease = await resolved.store.acquireAuditStage(auditId, stage, stageLeaseSeconds)
  if (terminal(lease.status)) return { status: lease.status }
  if (lease.status === 'already_completed') return { status: 'completed', count: 0 }
  if (lease.status === 'deferred') {
    const retryAt = lease.retryAt ? new Date(lease.retryAt).getTime() : Date.now() + 1_000
    throw new AuditStageRateLimitedError(Math.max(1_000, retryAt - Date.now()))
  }
  if (lease.status === 'busy' || lease.status === 'not_ready') {
    const leaseExpiry = Date.parse(lease.expiresAt || '')
    const retryAfterMs = Number.isFinite(leaseExpiry) ? Math.max(1_000, leaseExpiry - Date.now()) : 1_000
    throw new AuditStageBusyError(`audit_stage_${lease.status}`, retryAfterMs)
  }
  if (lease.status !== 'acquired' || !lease.leaseToken) throw new Error('audit_stage_lease_failed')
  const log = resolved.log
  log('info', 'stage.started', { auditId, stage, remainingMs })

  if (stage === 'explorer') {
    let result
    try {
      result = remainingMs > 0
        ? await withLeaseHeartbeat(resolved, auditId, stage, lease.leaseToken, async () => {
            const target = await resolved.validateTarget(state.run.normalized_url)
            return resolved.explorer.explore(target, { ...budgets, wallClockMs: remainingMs })
          })
        : { evidence: [], coverage: partialCoverage(state.run.coverage as AuditSourceCoverage) }
    } catch (error) {
      if (error instanceof AuditStageBusyError) throw error
      log('warn', 'explorer.failed', { auditId, stage, ...auditErrorLogFields(error) })
      result = { evidence: [], coverage: { ...partialCoverage(state.run.coverage as AuditSourceCoverage), routesAttempted: 0, routesEvaluated: 0 } }
    }
    const completion = await resolved.store.completeAuditStage(auditId, stage, lease.leaseToken, result)
    const status = persisted(completion.status, ['completed'])
    log('info', 'stage.completed', {
      auditId,
      stage,
      persistenceStatus: status,
      evidenceCount: result.evidence.length,
      routesAttempted: result.coverage.routesAttempted,
      routesEvaluated: result.coverage.routesEvaluated,
    })
    return { status, count: result.evidence.length }
  }

  if (stage === 'critic') {
    let candidates: AuditCandidate[]
    try {
      candidates = remainingMs > 0
        ? await withLeaseHeartbeat(resolved, auditId, stage, lease.leaseToken, () => runCritic(resolved.model, state.evidence, Math.floor(budgets.modelTokens / 2), deadlineMs, auditId))
        : []
    } catch (error) {
      if (error instanceof AuditModelRateLimitError) return deferRateLimitedStage(resolved, auditId, stage, lease.leaseToken, error, deadlineMs)
      if (error instanceof AuditModelError && (error.code === 'budget' || error.code === 'timeout')) {
        return finishModelBudgetPartial(resolved, auditId, stage, lease.leaseToken, state.run.coverage as AuditSourceCoverage, error)
      }
      log('error', 'stage.failed', { auditId, stage, ...auditErrorLogFields(error) })
      throw error
    }
    const completion = await resolved.store.completeAuditStage(auditId, stage, lease.leaseToken, { candidates })
    const status = persisted(completion.status, ['completed'])
    log('info', 'stage.completed', { auditId, stage, persistenceStatus: status, candidateCount: candidates.length })
    return { status, count: candidates.length }
  }

  const exhausted = remainingMs <= 0
  let decisions: VerificationDecision[]
  try {
    decisions = exhausted
      ? []
      : await withLeaseHeartbeat(resolved, auditId, stage, lease.leaseToken, () => runVerifier(resolved.model, state.candidates, state.evidence, Math.floor(budgets.modelTokens / 2), deadlineMs, auditId))
  } catch (error) {
    if (error instanceof AuditModelRateLimitError) return deferRateLimitedStage(resolved, auditId, stage, lease.leaseToken, error, deadlineMs)
    if (error instanceof AuditModelError && (error.code === 'budget' || error.code === 'timeout')) {
      return finishModelBudgetPartial(resolved, auditId, stage, lease.leaseToken, state.run.coverage as AuditSourceCoverage, error)
    }
    log('error', 'stage.failed', { auditId, stage, ...auditErrorLogFields(error) })
    throw error
  }
  const findings = admitAuditFindings(state.candidates, state.evidence, decisions)
  const coverage = exhausted ? partialCoverage(state.run.coverage as AuditSourceCoverage) : state.run.coverage as AuditSourceCoverage
  const finalization = await resolved.store.finalizeAudit(auditId, lease.leaseToken, findings, coverage)
  const status = finalization.status === 'unchanged' ? 'terminal' : persisted(finalization.status, ['completed', 'partial'])
  log('info', 'stage.completed', { auditId, stage, persistenceStatus: status, decisionCount: decisions.length, findingCount: findings.length })
  return { status, count: findings.length }
}

export async function executeAuditPipeline(auditId: string, dependencies?: PipelineDependencies) {
  const resolvedStore = dependencies?.store || store
  const log = dependencies?.log || auditServerLog
  log('info', 'run.started', { auditId })
  try {
    for (const stage of ['explorer', 'critic', 'verifier'] as const) {
      let rateLimitRetries = 0
      for (;;) {
        try {
          const result = await executeAuditStage(auditId, stage, dependencies)
          if (terminal(result.status)) {
            log('info', 'run.stopped', { auditId, stage, persistenceStatus: result.status })
            return
          }
          break
        } catch (error) {
          if (!(error instanceof AuditStageRateLimitedError)) throw error
          if (rateLimitRetries >= 3) {
            const finished = await resolvedStore.finishAuditModelRateLimited(auditId)
            log('warn', 'run.partial', { auditId, stage, reason: 'model_rate_limit_retries_exhausted', persistenceStatus: finished.status })
            return
          }
          rateLimitRetries += 1
          await (dependencies?.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(error.retryAfterMs)
        }
      }
      if (stage === 'critic') {
        const delay = dependencies?.interStageDelayMs ?? auditModelInterStageDelay()
        if (delay > 0) await (dependencies?.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(delay)
      }
    }
    log('info', 'run.completed', { auditId })
  } catch (error) {
    if (error instanceof AuditStageBusyError || error instanceof AuditStageRateLimitedError) throw error
    await resolvedStore.markAuditFailed(auditId, 'audit_execution_failed', 'The audit could not be completed safely.')
    log('error', 'run.failed', { auditId, ...auditErrorLogFields(error) })
    throw error
  }
}
