import { getRun, start } from 'workflow/api'
import type { AuditMode } from '../../../shared/product-audit/contracts.js'
import { PRODUCT_AUDIT_WORKFLOW_ID } from '../../../workflows/product-audit-id.js'
import { auditLocalExecution } from './config.js'
import { executeAuditPipeline } from './pipeline.js'

const WORKFLOW = { workflowId: PRODUCT_AUDIT_WORKFLOW_ID }

export async function startAuditExecution(auditId: string, mode: AuditMode) {
  if (auditLocalExecution()) {
    const runId = `local-${mode}-${auditId}`
    queueMicrotask(() => { void executeAuditPipeline(auditId).catch(() => undefined) })
    return runId
  }
  const run = await start(WORKFLOW, [auditId])
  return run.runId
}

export async function cancelAuditExecution(runId: string | null) {
  if (!runId || runId.startsWith('local-')) return
  await getRun(runId).cancel()
}
