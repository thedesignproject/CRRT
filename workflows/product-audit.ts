import { RetryableError, sleep } from 'workflow'
import { auditModelInterStageDelay } from '../api/_lib/audits/config.js'
import { AuditStageBusyError, AuditStageRateLimitedError, executeAuditStage, type PipelineStage } from '../api/_lib/audits/pipeline.js'
import { finishAuditModelRateLimited, markAuditFailed } from '../api/_lib/audits/store.js'

const rateLimitMarker = 'audit_model_rate_limited'
const leaseConflictMarker = 'audit_stage_lease_conflict'

async function executeDurableStage(auditId: string, stage: PipelineStage) {
  try {
    return await executeAuditStage(auditId, stage)
  } catch (error) {
    if (error instanceof AuditStageRateLimitedError) {
      throw new RetryableError(rateLimitMarker, { retryAfter: error.retryAfterMs })
    }
    if (error instanceof AuditStageBusyError) {
      throw new RetryableError(leaseConflictMarker, { retryAfter: error.retryAfterMs })
    }
    throw error
  }
}

async function explorerStep(auditId: string) {
  'use step'
  return executeDurableStage(auditId, 'explorer')
}
explorerStep.maxRetries = 3

async function criticStep(auditId: string) {
  'use step'
  return executeDurableStage(auditId, 'critic')
}
criticStep.maxRetries = 3

async function verifierStep(auditId: string) {
  'use step'
  return executeDurableStage(auditId, 'verifier')
}
verifierStep.maxRetries = 3

async function failureStep(auditId: string) {
  'use step'
  await markAuditFailed(auditId, 'audit_execution_failed', 'The audit could not be completed safely.')
}

async function rateLimitFailureStep(auditId: string) {
  'use step'
  await finishAuditModelRateLimited(auditId)
}

export async function productAuditWorkflow(auditId: string) {
  'use workflow'
  try {
    const explored = await explorerStep(auditId)
    if (explored.status === 'terminal' || explored.status === 'cancelled') return
    const criticized = await criticStep(auditId)
    if (criticized.status === 'terminal' || criticized.status === 'cancelled') return
    const interStageDelayMs = auditModelInterStageDelay()
    if (interStageDelayMs > 0) await sleep(interStageDelayMs)
    await verifierStep(auditId)
  } catch (error) {
    if (error instanceof Error && error.message.includes(rateLimitMarker)) {
      await rateLimitFailureStep(auditId)
      return
    }
    if (error instanceof Error && error.message.includes(leaseConflictMarker)) return
    await failureStep(auditId)
    throw error
  }
}
