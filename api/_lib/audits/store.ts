import { getServiceSupabase } from '../supabase.js'
import {
  auditCandidateSchema,
  auditEvidenceSchema,
  auditFindingSchema,
  auditSourceCoverageSchema,
  type AuditBudgets,
  type AuditCandidate,
  type AuditEvidence,
  type AuditFinding,
  type AuditMode,
  type AuditRunResponse,
  type AuditSourceCoverage,
  type AuditStage,
} from '../../../shared/product-audit/contracts.js'

type Row = Record<string, any>

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback)
}

function requireData<T>(result: { data: T | null; error: { message?: string } | null }, fallback: string): T {
  if (result.error || result.data === null) fail(result.error, fallback)
  return result.data
}

function requireSuccess(result: { error: { message?: string } | null }, fallback: string) {
  if (result.error) fail(result.error, fallback)
}

export type CreateRunInput = {
  ownerKind: 'anonymous' | 'project'
  projectKey: string | null
  creatorUserId: string | null
  idempotencyKey: string
  capabilityHash: string | null
  sessionHash: string | null
  ipHash: string | null
  inputUrl: string
  normalizedUrl: string
  mode: AuditMode
  budgets: AuditBudgets
  expiresAt: string | null
}

export async function createAuditRun(input: CreateRunInput) {
  const { data, error } = await getServiceSupabase().rpc('create_audit_run', {
    p_owner_kind: input.ownerKind,
    p_project_key: input.projectKey,
    p_creator_user_id: input.creatorUserId,
    p_start_idempotency_key: input.idempotencyKey,
    p_capability_token_hash: input.capabilityHash,
    p_anonymous_session_hash: input.sessionHash,
    p_anonymous_ip_hash: input.ipHash,
    p_input_url: input.inputUrl,
    p_normalized_url: input.normalizedUrl,
    p_mode: input.mode,
    p_budgets: input.budgets,
    p_coverage: { evaluatedSources: [], unavailableSources: ['customer-rule', 'design-system', 'repository'], routesAttempted: 0, routesEvaluated: 0 },
    p_source_snapshot: { url: input.normalizedUrl, capturedAt: new Date().toISOString() },
    p_expires_at: input.expiresAt,
  })
  return requireData({ data, error }, 'audit_create_failed') as { status: string; auditId?: string; scope?: string; retryAt?: string }
}

export async function setAuditWorkflowRunId(auditId: string, workflowRunId: string) {
  const { error } = await getServiceSupabase().from('audit_runs').update({ workflow_run_id: workflowRunId, updated_at: new Date().toISOString() }).eq('id', auditId)
  requireSuccess({ error }, 'audit_workflow_link_failed')
}

export async function getAuditAccessRow(auditId: string) {
  const { data, error } = await getServiceSupabase().from('audit_runs').select('*').eq('id', auditId).maybeSingle()
  requireSuccess({ error }, 'audit_read_failed')
  return data as Row | null
}

export async function acquireAuditStage(auditId: string, stage: 'explorer' | 'critic' | 'verifier', leaseSeconds = 60) {
  const { data, error } = await getServiceSupabase().rpc('acquire_audit_stage_lease', { p_audit_id: auditId, p_stage: stage, p_lease_seconds: leaseSeconds })
  return requireData({ data, error }, 'audit_lease_failed') as { status: string; leaseToken?: string; runStatus?: string; retryAt?: string; expiresAt?: string }
}

export async function renewAuditStage(auditId: string, stage: 'explorer' | 'critic' | 'verifier', leaseToken: string, leaseSeconds = 60) {
  const { data, error } = await getServiceSupabase().rpc('renew_audit_stage_lease', {
    p_audit_id: auditId, p_stage: stage, p_lease_token: leaseToken, p_lease_seconds: leaseSeconds,
  })
  return requireData({ data, error }, 'audit_lease_renew_failed') as { status: string; runStatus?: string; expiresAt?: string }
}

export async function completeAuditStage(auditId: string, stage: 'explorer' | 'critic', leaseToken: string, payload: unknown) {
  const { data, error } = await getServiceSupabase().rpc('complete_audit_stage', { p_audit_id: auditId, p_stage: stage, p_lease_token: leaseToken, p_payload: payload })
  return requireData({ data, error }, 'audit_stage_complete_failed') as { status: string }
}

export async function finishAuditPartial(
  auditId: string,
  stage: 'critic' | 'verifier',
  leaseToken: string,
  coverage: AuditSourceCoverage,
  code: string,
  message: string,
) {
  const { data, error } = await getServiceSupabase().rpc('finish_audit_partial', {
    p_audit_id: auditId, p_stage: stage, p_lease_token: leaseToken,
    p_coverage: coverage, p_error_code: code, p_error_message: message,
  })
  return requireData({ data, error }, 'audit_partial_finish_failed') as { status: string; runStatus?: string; findingCount?: number }
}

export async function deferAuditStageRetry(auditId: string, stage: 'critic' | 'verifier', leaseToken: string, retryAt: string) {
  const { data, error } = await getServiceSupabase().rpc('defer_audit_stage_retry', {
    p_audit_id: auditId,
    p_stage: stage,
    p_lease_token: leaseToken,
    p_retry_at: retryAt,
  })
  return requireData({ data, error }, 'audit_stage_defer_failed') as { status: string; retryAt?: string; runStatus?: string }
}

export async function finalizeAudit(
  auditId: string,
  leaseToken: string,
  findings: AuditFinding[],
  coverage: AuditSourceCoverage,
) {
  const { data, error } = await getServiceSupabase().rpc('finalize_audit_verification', {
    p_audit_id: auditId,
    p_lease_token: leaseToken,
    p_findings: findings.map((finding) => ({ findingKey: finding.id, admittedBy: finding.admittedBy, payload: finding })),
    p_coverage: coverage,
    p_partial: Boolean(coverage.partialReason),
    p_error_code: coverage.partialReason ? 'partial_coverage' : null,
    p_error_message: coverage.partialReason || null,
  })
  return requireData({ data, error }, 'audit_finalize_failed') as { status: string; findingCount?: number }
}

export async function cancelAudit(auditId: string) {
  const { data, error } = await getServiceSupabase().rpc('cancel_audit_run', { p_audit_id: auditId })
  return requireData({ data, error }, 'audit_cancel_failed') as { status: string; runStatus?: string }
}

export async function markAuditFailed(auditId: string, code: string, message: string) {
  const { data, error } = await getServiceSupabase().rpc('mark_audit_run_failed', { p_audit_id: auditId, p_error_code: code, p_error_message: message })
  return requireData({ data, error }, 'audit_fail_write_failed') as { status: string; runStatus?: string }
}

export async function finishAuditModelRateLimited(auditId: string) {
  const { data, error } = await getServiceSupabase().rpc('finish_audit_model_rate_limited', { p_audit_id: auditId })
  return requireData({ data, error }, 'audit_rate_limit_finish_failed') as { status: string; runStatus?: string; findingCount?: number }
}

export async function loadAuditPipelineState(auditId: string) {
  const client = getServiceSupabase()
  const [runResult, evidenceResult, candidateResult] = await Promise.all([
    client.from('audit_runs').select('*').eq('id', auditId).single(),
    client.from('audit_evidence').select('*').eq('audit_id', auditId).order('created_at'),
    client.from('audit_candidates').select('*').eq('audit_id', auditId).order('created_at'),
  ])
  requireData(runResult, 'audit_read_failed')
  requireSuccess(evidenceResult, 'audit_evidence_read_failed')
  requireSuccess(candidateResult, 'audit_candidate_read_failed')
  return {
    run: runResult.data as Row,
    evidence: (evidenceResult.data || []).map((row: Row) => auditEvidenceSchema.parse({ id: row.evidence_key, source: row.source, signalKey: row.signal_key, location: row.route, observation: row.observation, confidence: row.confidence, direct: row.direct, kind: row.kind, route: row.route, element: row.element, provenance: row.provenance, artifact: row.artifact, capture: row.capture })),
    candidates: (candidateResult.data || []).map((row: Row) => auditCandidateSchema.parse(row.payload)),
  }
}

function iso(value: unknown) {
  return typeof value === 'string' ? value : null
}

export async function getAuditResponse(auditId: string): Promise<AuditRunResponse | null> {
  const client = getServiceSupabase()
  const [runResult, evidenceResult, candidateResult, findingResult, eventResult] = await Promise.all([
    client.from('audit_runs').select('*').eq('id', auditId).maybeSingle(),
    client.from('audit_evidence').select('*').eq('audit_id', auditId).order('created_at'),
    client.from('audit_candidates').select('payload').eq('audit_id', auditId),
    client.from('audit_findings').select('payload').eq('audit_id', auditId).order('rank'),
    client.from('audit_events').select('stage,event_type').eq('audit_id', auditId).eq('event_type', 'audit.stage.completed'),
  ])
  requireSuccess(runResult, 'audit_read_failed')
  if (!runResult.data) return null
  for (const result of [evidenceResult, candidateResult, findingResult, eventResult]) requireSuccess(result, 'audit_projection_failed')
  const row = runResult.data as Row
  const evidence = (evidenceResult.data || []).map((item: Row) => auditEvidenceSchema.parse({ id: item.evidence_key, source: item.source, signalKey: item.signal_key, location: item.route, observation: item.observation, confidence: item.confidence, direct: item.direct, kind: item.kind, route: item.route, element: item.element, provenance: item.provenance, artifact: item.artifact, capture: item.capture }))
  const findings = (findingResult.data || []).map((item: Row) => auditFindingSchema.parse(item.payload))
  const terminal = ['completed', 'partial'].includes(row.status)
  return {
    auditId: row.id,
    inputUrl: row.normalized_url,
    mode: row.mode,
    status: row.status,
    stage: row.current_stage as AuditStage,
    progress: {
      auditId: row.id,
      stage: row.current_stage,
      completedStages: (eventResult.data || []).map((event: Row) => event.stage).filter(Boolean),
      observedEvidenceCount: evidence.length,
      candidateCount: candidateResult.data?.length || 0,
      admittedFindingCount: findings.length,
      ...(row.error_message ? { error: row.error_message } : {}),
    },
    coverage: auditSourceCoverageSchema.parse(row.coverage),
    report: terminal ? { auditId: row.id, inputUrl: row.normalized_url, mode: row.mode, evaluatedSources: row.coverage.evaluatedSources, unavailableSources: row.unavailable_sources, findings, evidence, ...(row.completed_at ? { completedAt: row.completed_at } : {}) } : null,
    error: row.error_code ? { code: row.error_code, message: row.error_message || 'Audit failed.', retryable: false } : null,
    createdAt: row.created_at,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    cancelledAt: iso(row.cancelled_at),
    expiresAt: iso(row.expires_at),
  }
}

export async function listAuditEvents(auditId: string, after: string, limit: number) {
  const { data, error } = await getServiceSupabase().from('audit_events').select('*').eq('audit_id', auditId).gt('id', after).order('id').limit(limit)
  requireSuccess({ error }, 'audit_events_read_failed')
  const events = (data || []).map((row: Row) => ({ sequence: String(row.id), auditId: row.audit_id, eventType: row.event_type, actorType: row.actor_type, stage: row.stage, payload: row.payload || {}, createdAt: row.created_at }))
  return { events, nextCursor: events[events.length - 1]?.sequence || after }
}
