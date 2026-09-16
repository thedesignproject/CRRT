import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase.js', () => ({ getServiceSupabase: vi.fn() }))

import { getServiceSupabase } from '../supabase.js'
import {
  acquireAuditStage, cancelAudit, completeAuditStage, createAuditRun, finalizeAudit, finishAuditPartial,
  deferAuditStageRetry, finishAuditModelRateLimited, getAuditAccessRow, getAuditResponse, listAuditEvents,
  loadAuditPipelineState, markAuditFailed, renewAuditStage, setAuditWorkflowRunId,
} from './store.js'

type Result = { data: unknown; error: null | { message?: string } }

function chain(result: Result, beforeResolve: () => void = () => undefined) {
  const value: Record<string, unknown> = {}
  for (const method of ['select', 'update', 'upsert', 'eq', 'in', 'gt', 'order', 'limit', 'single', 'maybeSingle']) {
    value[method] = vi.fn(() => value)
  }
  value.then = (resolve: (result: Result) => unknown, reject: (error: unknown) => unknown) => {
    beforeResolve()
    return Promise.resolve(result).then(resolve, reject)
  }
  return value
}

const evidence = { id: 'e1', source: 'url' as const, signalKey: 'signal', location: '/', observation: 'Observed', confidence: 1, direct: true }
const candidate = { id: 'c1', kind: 'problem' as const, title: 'Problem', summary: 'Summary', impact: 'high' as const, confidence: .95, evidenceIds: ['e1'], recommendation: 'Fix' }
const rejectedCandidate = { ...candidate, id: 'c2', title: 'Possible opportunity', impact: 'medium' as const, confidence: .82 }
const finding = { ...candidate, status: 'open' as const, admittedBy: 'direct-evidence' as const, evidence: [evidence] }
const coverage = { evaluatedSources: ['url' as const], unavailableSources: ['repository' as const, 'design-system' as const, 'customer-rule' as const], routesAttempted: 1, routesEvaluated: 1 }
const budgets = { maxRoutes: 5, maxActions: 20, wallClockMs: 300_000, modelTokens: 8_000, maxArtifacts: 10 }
const now = '2026-08-25T00:00:00.000Z'

function rowFor(table: string): Result {
  if (table === 'audit_runs') return { data: { id: '11111111-1111-4111-8111-111111111111', owner_kind: 'anonymous', normalized_url: 'https://example.com/', mode: 'local-fixture', status: 'completed', current_stage: 'completed', budgets, coverage, unavailable_sources: coverage.unavailableSources, error_code: null, error_message: null, created_at: now, started_at: now, completed_at: now, cancelled_at: null, expires_at: null }, error: null }
  if (table === 'audit_evidence') return { data: [{ audit_id: 'a', evidence_key: 'e1', source: 'url', signal_key: 'signal', kind: 'observable', route: '/', element: null, observation: 'Observed', confidence: 1, direct: true, provenance: {}, artifact: null, capture: {} }], error: null }
  if (table === 'audit_candidates') return { data: [{ payload: candidate }], error: null }
  if (table === 'audit_findings') return { data: [{ payload: finding }], error: null }
  if (table === 'audit_events') return { data: [{ id: 9, audit_id: '11111111-1111-4111-8111-111111111111', event_type: 'audit.stage.completed', actor_type: 'explorer', stage: 'explorer', payload: {}, created_at: now }], error: null }
  return { data: [], error: null }
}

function client(resultForTable = rowFor) {
  return {
    rpc: vi.fn(async (name: string) => ({ data: name === 'create_audit_run' ? { status: 'created', auditId: 'a' } : name === 'finalize_audit_verification' ? { status: 'completed', findingCount: 1 } : { status: 'completed', leaseToken: 'lease' }, error: null })),
    from: vi.fn((table: string) => chain(resultForTable(table))),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('audit Supabase store', () => {
  it('creates runs and persists idempotent stage data through approved RPCs', async () => {
    const db = client()
    vi.mocked(getServiceSupabase).mockReturnValue(db as never)
    await expect(createAuditRun({ ownerKind: 'anonymous', projectKey: null, creatorUserId: null, idempotencyKey: 'key', capabilityHash: 'cap', sessionHash: 'session', ipHash: 'ip', inputUrl: 'https://example.com', normalizedUrl: 'https://example.com/', mode: 'local-fixture', budgets, expiresAt: now })).resolves.toMatchObject({ status: 'created' })
    await setAuditWorkflowRunId('a', 'run')
    await expect(acquireAuditStage('a', 'explorer')).resolves.toMatchObject({ leaseToken: 'lease' })
    await expect(renewAuditStage('a', 'explorer', 'lease')).resolves.toMatchObject({ status: 'completed' })
    await expect(completeAuditStage('a', 'explorer', 'lease', {})).resolves.toMatchObject({ status: 'completed' })
    await expect(finishAuditPartial('a', 'critic', 'lease', coverage, 'model_budget', 'Model input budget reached.')).resolves.toMatchObject({ status: 'completed' })
    await expect(deferAuditStageRetry('a', 'critic', 'lease', now)).resolves.toMatchObject({ status: 'completed' })
    await expect(finalizeAudit('a', 'lease', [finding], coverage)).resolves.toMatchObject({ findingCount: 1 })
    await expect(finalizeAudit('a', 'lease', [], { ...coverage, partialReason: 'Blocked route' })).resolves.toMatchObject({ findingCount: 1 })
    await expect(cancelAudit('a')).resolves.toMatchObject({ status: 'completed' })
    await expect(finishAuditModelRateLimited('a')).resolves.toMatchObject({ status: 'completed' })
    expect(db.rpc).toHaveBeenCalledWith('create_audit_run', expect.objectContaining({ p_owner_kind: 'anonymous', p_coverage: expect.objectContaining({ unavailableSources: expect.any(Array) }) }))
    expect(db.rpc).toHaveBeenCalledWith('renew_audit_stage_lease', expect.objectContaining({ p_stage: 'explorer', p_lease_seconds: 60 }))
    expect(db.rpc).toHaveBeenCalledWith('finish_audit_partial', expect.objectContaining({ p_stage: 'critic', p_error_code: 'model_budget' }))
    expect(db.rpc).toHaveBeenCalledWith('defer_audit_stage_retry', expect.objectContaining({ p_stage: 'critic', p_retry_at: now }))
    expect(db.rpc).toHaveBeenCalledWith('finish_audit_model_rate_limited', { p_audit_id: 'a' })
    expect(db.from).not.toHaveBeenCalledWith('audit_evidence')
  })

  it('loads persisted pipeline state, public projections, events, and nullable access', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(client() as never)
    await expect(getAuditAccessRow('a')).resolves.toMatchObject({ owner_kind: 'anonymous' })
    await expect(loadAuditPipelineState('a')).resolves.toMatchObject({ evidence: [expect.objectContaining({ id: 'e1' })], candidates: [candidate] })
    const response = await getAuditResponse('a')
    expect(response).toMatchObject({ status: 'completed', report: { findings: [expect.objectContaining({ status: 'open' })] }, error: null })
    await expect(listAuditEvents('a', '0', 50)).resolves.toEqual({ events: [expect.objectContaining({ sequence: '9' })], nextCursor: '9' })
    vi.mocked(getServiceSupabase).mockReturnValue(client((table) => table === 'audit_runs' ? { data: null, error: null } : rowFor(table)) as never)
    await expect(getAuditAccessRow('a')).resolves.toBeNull()
    await expect(getAuditResponse('a')).resolves.toBeNull()
    vi.mocked(getServiceSupabase).mockReturnValue(client((table) => {
      if (table === 'audit_evidence' || table === 'audit_candidates' || table === 'audit_findings') return { data: null, error: null }
      if (table === 'audit_events') return { data: null, error: null }
      return rowFor(table)
    }) as never)
    await expect(loadAuditPipelineState('a')).resolves.toMatchObject({ evidence: [], candidates: [] })
    await expect(getAuditResponse('a')).resolves.toMatchObject({ progress: { candidateCount: 0 }, report: { evidence: [], findings: [] } })
    await expect(listAuditEvents('a', '7', 10)).resolves.toEqual({ events: [], nextCursor: '7' })
    vi.mocked(getServiceSupabase).mockReturnValue(client((table) => table === 'audit_events' ? { data: [{ id: 9, audit_id: '11111111-1111-4111-8111-111111111111', event_type: 'audit.stage.completed', actor_type: 'explorer', stage: 'explorer', payload: null, created_at: now }], error: null } : rowFor(table)) as never)
    await expect(listAuditEvents('a', '0', 10)).resolves.toMatchObject({ events: [{ payload: {} }] })
  })

  it('projects evidenced non-admitted candidates separately from Open findings', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(client((table) => {
      if (table === 'audit_candidates') return { data: [{ payload: candidate }, { payload: rejectedCandidate }, { payload: { ...rejectedCandidate, id: 'c3', evidenceIds: ['missing'] } }], error: null }
      return rowFor(table)
    }) as never)
    await expect(getAuditResponse('a')).resolves.toMatchObject({
      report: {
        findings: [expect.objectContaining({ id: 'c1', status: 'open' })],
        observations: [expect.objectContaining({ id: 'c2', status: 'needs-more-evidence', evidence: [expect.objectContaining({ id: 'e1' })] })],
      },
    })
  })

  it('reads the run before terminal report projections', async () => {
    let runObserved = false
    const db = {
      rpc: vi.fn(),
      from: vi.fn((table: string) => table === 'audit_runs'
        ? chain(rowFor(table), () => { runObserved = true })
        : chain(runObserved ? rowFor(table) : { data: null, error: { message: 'projection raced terminal state' } })),
    }
    vi.mocked(getServiceSupabase).mockReturnValue(db as never)
    await expect(getAuditResponse('a')).resolves.toMatchObject({
      status: 'completed',
      report: { findings: [expect.objectContaining({ id: candidate.id })] },
    })
    expect(db.from.mock.calls.map(([table]) => table)).toEqual([
      'audit_runs', 'audit_evidence', 'audit_candidates', 'audit_findings', 'audit_events',
    ])
  })

  it('projects active and failed runs without fabricating a report', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(client((table) => {
      if (table === 'audit_runs') return { data: { ...rowFor(table).data as object, status: 'failed', current_stage: 'failed', completed_at: null, error_code: 'blocked', error_message: 'Could not explore' }, error: null }
      if (table === 'audit_findings' || table === 'audit_events') return { data: [], error: null }
      return rowFor(table)
    }) as never)
    await expect(getAuditResponse('a')).resolves.toMatchObject({ report: null, error: { code: 'blocked', retryable: false }, completedAt: null })
    vi.mocked(getServiceSupabase).mockReturnValue(client((table) => {
      if (table === 'audit_runs') return { data: { ...rowFor(table).data as object, status: 'partial', completed_at: null, error_code: 'partial_coverage', error_message: null }, error: null }
      if (table === 'audit_candidates') return { data: null, error: null }
      return rowFor(table)
    }) as never)
    await expect(getAuditResponse('a')).resolves.toMatchObject({ progress: { candidateCount: 0 }, report: { findings: expect.any(Array) }, error: { message: 'Audit failed.' } })
  })

  it('marks failures with a terminal event and surfaces database/no-data failures safely', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(client() as never)
    await expect(markAuditFailed('a', 'code', 'message')).resolves.toMatchObject({ status: 'completed' })
    const terminalClient = client((table) => table === 'audit_runs' ? { data: null, error: null } : rowFor(table))
    vi.mocked(getServiceSupabase).mockReturnValue(terminalClient as never)
    await markAuditFailed('a', 'late', 'ignored')
    expect(terminalClient.rpc).toHaveBeenCalledWith('mark_audit_run_failed', expect.objectContaining({ p_error_code: 'late' }))
    const errorClient = { rpc: vi.fn(async () => ({ data: null, error: { message: 'database unavailable' } })), from: vi.fn(() => chain({ data: null, error: { message: 'database unavailable' } })) }
    vi.mocked(getServiceSupabase).mockReturnValue(errorClient as never)
    await expect(createAuditRun({ ownerKind: 'project', projectKey: 'p', creatorUserId: 'u', idempotencyKey: 'key', capabilityHash: null, sessionHash: null, ipHash: null, inputUrl: 'https://example.com', normalizedUrl: 'https://example.com/', mode: 'live', budgets, expiresAt: null })).rejects.toThrow('database unavailable')
    await expect(setAuditWorkflowRunId('a', 'run')).rejects.toThrow('database unavailable')
    await expect(getAuditAccessRow('a')).rejects.toThrow('database unavailable')
    vi.mocked(getServiceSupabase).mockReturnValue({ from: vi.fn(() => chain({ data: null, error: null })) } as never)
    await expect(setAuditWorkflowRunId('missing', 'run')).rejects.toThrow('audit_workflow_link_failed')
    const noDataClient = { rpc: vi.fn(async () => ({ data: null, error: null })), from: vi.fn(() => chain({ data: null, error: {} })) }
    vi.mocked(getServiceSupabase).mockReturnValue(noDataClient as never)
    await expect(createAuditRun({ ownerKind: 'project', projectKey: 'p', creatorUserId: 'u', idempotencyKey: 'key', capabilityHash: null, sessionHash: null, ipHash: null, inputUrl: 'https://example.com', normalizedUrl: 'https://example.com/', mode: 'live', budgets, expiresAt: null })).rejects.toThrow('audit_create_failed')
    await expect(setAuditWorkflowRunId('a', 'run')).rejects.toThrow('audit_workflow_link_failed')
  })
})
