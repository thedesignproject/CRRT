import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuditCandidate, AuditEvidence, AuditSourceCoverage } from '../../../shared/product-audit/contracts.js'
import { DockerAuditExplorer, FixtureAuditExplorer, SandboxAuditExplorer } from './explorer.js'
import { AuditModelError, AuditModelRateLimitError, FakeAuditModel } from './model.js'
import { AuditStageBusyError, AuditStageRateLimitedError, defaultPipelineDependencies, executeAuditPipeline, executeAuditStage, type PipelineDependencies } from './pipeline.js'
import * as auditStore from './store.js'

const evidence: AuditEvidence = { id: 'e1', source: 'url', signalKey: 'direct', location: '/', observation: 'Observed', confidence: 1, direct: true }
const candidate: AuditCandidate = { id: 'c1', kind: 'problem', title: 'Problem', summary: 'Summary', impact: 'high', confidence: .96, evidenceIds: ['e1'], recommendation: 'Fix it' }
const coverage: AuditSourceCoverage = { evaluatedSources: ['url'], unavailableSources: ['repository', 'design-system', 'customer-rule'], routesAttempted: 1, routesEvaluated: 1 }
const originalEnv = { ...process.env }

afterEach(() => { process.env = { ...originalEnv }; vi.useRealTimers(); vi.restoreAllMocks() })

function harness(overrides: {
  acquireStatus?: string
  acquireRetryAt?: string
  acquireExpiresAt?: string
  renewStatus?: string
  completeStatus?: string
  finalizeStatus?: string
  partialStatus?: string
  deferStatus?: string
  deferRetryAt?: string | null
  finishStatus?: string
  failExplorer?: boolean
  startedAt?: string
  candidates?: AuditCandidate[]
} = {}) {
  const startedAt = overrides.startedAt || new Date().toISOString()
  const modelCandidates = overrides.candidates ?? (overrides.failExplorer ? [] : [candidate])
  const state: { evidence: AuditEvidence[]; candidates: AuditCandidate[]; coverage: AuditSourceCoverage } = { evidence: [], candidates: [], coverage }
  const fakeStore = {
    acquireAuditStage: vi.fn(async (_id: string, stage: string) => ({
      status: overrides.acquireStatus || 'acquired',
      leaseToken: `lease-${stage}`,
      ...(overrides.acquireRetryAt ? { retryAt: overrides.acquireRetryAt } : {}),
      ...(overrides.acquireExpiresAt ? { expiresAt: overrides.acquireExpiresAt } : {}),
    })),
    renewAuditStage: vi.fn(async () => ({ status: overrides.renewStatus || 'renewed' })),
    completeAuditStage: vi.fn(async (_id: string, stage: string, _lease: string, output: { evidence?: AuditEvidence[]; coverage?: AuditSourceCoverage; candidates?: AuditCandidate[] }) => {
      if (output.evidence) state.evidence = output.evidence
      if (output.coverage) state.coverage = output.coverage
      if (output.candidates) state.candidates = output.candidates
      return { status: overrides.completeStatus || 'completed' }
    }),
    finalizeAudit: vi.fn(async (_id: string, _lease: string, findings: unknown[]) => ({ status: overrides.finalizeStatus || 'completed', findingCount: findings.length })),
    finishAuditPartial: vi.fn(async () => ({ status: overrides.partialStatus || 'partial', findingCount: 0 })),
    deferAuditStageRetry: vi.fn(async () => ({ status: overrides.deferStatus || 'deferred', ...(overrides.deferRetryAt === null ? {} : { retryAt: overrides.deferRetryAt || new Date(Date.now() + 1_000).toISOString() }) })),
    finishAuditModelRateLimited: vi.fn(async () => ({ status: overrides.finishStatus || 'partial', findingCount: 0 })),
    loadAuditPipelineState: vi.fn(async () => ({ run: { normalized_url: 'https://example.com/', mode: 'live', started_at: startedAt, budgets: { maxRoutes: 5, maxActions: 20, wallClockMs: 30_000, modelTokens: 1_000, maxArtifacts: 5 }, coverage: state.coverage }, evidence: [...state.evidence], candidates: [...state.candidates] })),
    markAuditFailed: vi.fn(async () => undefined),
  }
  const model = new FakeAuditModel({
    critic: { candidates: modelCandidates },
    verifier: { decisions: modelCandidates.map((item) => ({ candidateId: item.id, admitted: true, contradictions: [] })) },
  })
  const deps = {
    store: fakeStore,
    explorer: { explore: vi.fn(async () => {
      if (overrides.failExplorer) throw new Error('blocked')
      return { evidence: [evidence], coverage }
    }) },
    model,
    validateTarget: vi.fn(async () => ({ url: 'https://example.com/', origin: 'https://example.com', hostname: 'example.com', addresses: ['8.8.8.8'] })),
    wait: vi.fn(async () => undefined),
    interStageDelayMs: 0,
    log: vi.fn(),
  } as unknown as PipelineDependencies
  return { deps, fakeStore, state, model }
}

describe('durable audit pipeline', () => {
  it('persists each completed Explorer → Critic → Verifier stage before advancing', async () => {
    const { deps, fakeStore, model } = harness()
    const generate = vi.spyOn(model, 'generate')
    await executeAuditPipeline('audit-id', deps)
    expect(fakeStore.acquireAuditStage.mock.calls.map((call) => call[1])).toEqual(['explorer', 'critic', 'verifier'])
    expect(fakeStore.acquireAuditStage).toHaveBeenCalledWith('audit-id', 'explorer', 60)
    expect(fakeStore.completeAuditStage).toHaveBeenCalledTimes(2)
    expect(fakeStore.completeAuditStage).toHaveBeenNthCalledWith(1, 'audit-id', 'explorer', 'lease-explorer', { evidence: [evidence], coverage })
    expect(generate.mock.calls.map((call) => call[3])).toEqual([500, 500])
    expect(generate.mock.calls.map((call) => call[4])).toEqual([expect.any(Number), expect.any(Number)])
    expect(fakeStore.finalizeAudit).toHaveBeenCalledWith('audit-id', 'lease-verifier', [expect.objectContaining({ status: 'open' })], coverage)
    expect(deps.log).toHaveBeenCalledWith('info', 'run.started', { auditId: 'audit-id' })
    expect(deps.log).toHaveBeenCalledWith('info', 'stage.completed', expect.objectContaining({ auditId: 'audit-id', stage: 'verifier', findingCount: 1 }))
    expect(deps.log).toHaveBeenCalledWith('info', 'run.completed', { auditId: 'audit-id' })
  })

  it('allows zero findings without padding', async () => {
    const { deps, fakeStore } = harness({ candidates: [] })
    await executeAuditPipeline('audit-id', deps)
    expect(fakeStore.finalizeAudit).toHaveBeenCalledWith('audit-id', 'lease-verifier', [], coverage)
  })

  it('defers rate-limited stages without holding a lease, then resumes locally', async () => {
    const retrying = harness()
    retrying.deps.model = { generate: vi.fn()
      .mockRejectedValueOnce(new AuditModelRateLimitError(1_000))
      .mockResolvedValueOnce({ candidates: [candidate] })
      .mockResolvedValueOnce({ decisions: [{ candidateId: candidate.id, admitted: true, contradictions: [] }] }) }
    await executeAuditPipeline('audit-id', retrying.deps)
    expect(retrying.fakeStore.deferAuditStageRetry).toHaveBeenCalledWith('audit-id', 'critic', 'lease-critic', expect.any(String))
    expect(retrying.deps.wait).toHaveBeenCalledWith(expect.any(Number))
    expect(retrying.fakeStore.finishAuditModelRateLimited).not.toHaveBeenCalled()
    expect(retrying.deps.log).toHaveBeenCalledWith('warn', 'stage.rate_limited', expect.objectContaining({ auditId: 'audit-id', stage: 'critic' }))

    const direct = harness()
    direct.deps.model = { generate: vi.fn().mockRejectedValue(new AuditModelRateLimitError(1_000)) }
    await expect(executeAuditStage('audit-id', 'critic', direct.deps)).rejects.toBeInstanceOf(AuditStageRateLimitedError)
  })

  it('honors a durable deferred lease response without calling the model', async () => {
    const retryAt = new Date(Date.now() + 5_000).toISOString()
    const deferred = harness({ acquireStatus: 'deferred', acquireRetryAt: retryAt })
    const generate = vi.spyOn(deferred.model, 'generate')
    await expect(executeAuditStage('audit-id', 'critic', deferred.deps)).rejects.toMatchObject({ retryAfterMs: expect.any(Number) })
    expect(generate).not.toHaveBeenCalled()
    expect(deferred.fakeStore.completeAuditStage).not.toHaveBeenCalled()

    const fallback = harness({ acquireStatus: 'deferred' })
    await expect(executeAuditStage('audit-id', 'critic', fallback.deps)).rejects.toMatchObject({ retryAfterMs: 1_000 })
  })

  it('renews short leases while a stage is running and stops before stale persistence', async () => {
    vi.useFakeTimers()
    let finishWork!: (value: { candidates: AuditCandidate[] }) => void
    let finishRenewal!: (value: { status: string }) => void
    const running = harness()
    running.fakeStore.renewAuditStage.mockImplementation(() => new Promise((resolve) => { finishRenewal = resolve }))
    running.deps.model = { generate: vi.fn(() => new Promise((resolve) => { finishWork = resolve })) } as unknown as PipelineDependencies['model']
    const pending = executeAuditStage('audit-id', 'critic', running.deps)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(running.fakeStore.renewAuditStage).toHaveBeenCalledWith('audit-id', 'critic', 'lease-critic', 60)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(running.fakeStore.renewAuditStage).toHaveBeenCalledTimes(1)
    finishWork({ candidates: [candidate] })
    finishRenewal({ status: 'renewed' })
    await pending
    expect(running.fakeStore.completeAuditStage).toHaveBeenCalledTimes(1)

    let finishStaleWork!: (value: { evidence: AuditEvidence[]; coverage: AuditSourceCoverage }) => void
    const stale = harness({ renewStatus: 'lease_expired' })
    stale.deps.explorer = { explore: vi.fn(() => new Promise((resolve) => { finishStaleWork = resolve })) } as unknown as PipelineDependencies['explorer']
    const stalePending = executeAuditStage('audit-id', 'explorer', stale.deps)
    await vi.advanceTimersByTimeAsync(20_000)
    finishStaleWork({ evidence: [evidence], coverage })
    await expect(stalePending).rejects.toBeInstanceOf(AuditStageBusyError)
    expect(stale.fakeStore.completeAuditStage).not.toHaveBeenCalled()
    expect(stale.deps.log).not.toHaveBeenCalledWith('warn', 'explorer.failed', expect.anything())
  })

  it.each(['budget', 'timeout'] as const)('finishes a mid-request model %s as a fenced partial report', async (code) => {
    for (const stage of ['critic', 'verifier'] as const) {
      const failed = harness()
      failed.deps.model = { generate: vi.fn().mockRejectedValue(new AuditModelError(code)) }
      await expect(executeAuditStage('audit-id', stage, failed.deps)).resolves.toEqual({ status: 'partial', count: 0 })
      expect(failed.fakeStore.finishAuditPartial).toHaveBeenCalledWith(
        'audit-id', stage, `lease-${stage}`, expect.objectContaining({ partialReason: expect.any(String) }),
        code === 'timeout' ? 'model_timeout' : 'model_input_budget', expect.any(String),
      )
      expect(failed.fakeStore.markAuditFailed).not.toHaveBeenCalled()
    }

    const terminal = harness({ partialStatus: 'unchanged' })
    terminal.deps.model = { generate: vi.fn().mockRejectedValue(new AuditModelError(code)) }
    await expect(executeAuditStage('audit-id', 'verifier', terminal.deps)).resolves.toEqual({ status: 'terminal', count: 0 })
  })

  it('finishes repeated model rate limits as a partial zero-finding report', async () => {
    const limited = harness()
    limited.deps.model = { generate: vi.fn().mockRejectedValue(new AuditModelRateLimitError(1_000)) }
    await executeAuditPipeline('audit-id', limited.deps)
    expect(limited.fakeStore.deferAuditStageRetry).toHaveBeenCalledTimes(4)
    expect(limited.fakeStore.finishAuditModelRateLimited).toHaveBeenCalledWith('audit-id')
    expect(limited.fakeStore.finalizeAudit).not.toHaveBeenCalled()
    expect(limited.fakeStore.markAuditFailed).not.toHaveBeenCalled()
    expect(limited.deps.log).toHaveBeenCalledWith('warn', 'run.partial', expect.objectContaining({ reason: 'model_rate_limit_retries_exhausted' }))
  })

  it.each(['terminal', 'cancelled'])('stops when a stage is %s', async (acquireStatus) => {
    const { deps, fakeStore } = harness({ acquireStatus })
    await executeAuditPipeline('audit-id', deps)
    expect(fakeStore.acquireAuditStage).toHaveBeenCalledTimes(1)
    expect(fakeStore.completeAuditStage).not.toHaveBeenCalled()
  })

  it('leaves a concurrent lease retryable and marks actual safe failures', async () => {
    vi.useFakeTimers()
    const busy = harness({ acquireStatus: 'busy', acquireExpiresAt: new Date(Date.now() + 5_000).toISOString() })
    await expect(executeAuditPipeline('audit-id', busy.deps)).rejects.toMatchObject({ retryAfterMs: 5_000 })
    expect(busy.fakeStore.markAuditFailed).not.toHaveBeenCalled()

    for (const completeStatus of ['lease_expired', 'lease_mismatch', 'busy']) {
      const stale = harness({ completeStatus })
      await expect(executeAuditPipeline('audit-id', stale.deps)).rejects.toBeInstanceOf(AuditStageBusyError)
      expect(stale.fakeStore.markAuditFailed).not.toHaveBeenCalled()
    }

    const blocked = harness({ failExplorer: true })
    await executeAuditPipeline('audit-id', blocked.deps)
    expect(blocked.fakeStore.markAuditFailed).not.toHaveBeenCalled()
    expect(blocked.fakeStore.finalizeAudit).toHaveBeenCalledWith('audit-id', 'lease-verifier', [], expect.objectContaining({ partialReason: expect.any(String) }))
    expect(blocked.deps.log).toHaveBeenCalledWith('warn', 'explorer.failed', expect.objectContaining({ errorMessage: 'blocked' }))
  })

  it('rejects malformed leases and selects dependencies from the persisted run mode', async () => {
    const invalid = harness({ acquireStatus: 'invalid_input' })
    await expect(executeAuditStage('audit-id', 'explorer', invalid.deps)).rejects.toThrow('audit_stage_lease_failed')
    expect(defaultPipelineDependencies('local-fixture')).toMatchObject({ explorer: expect.any(Object), model: expect.any(Object) })
    expect(defaultPipelineDependencies('local-fixture', [evidence])).toMatchObject({ explorer: expect.any(Object), model: expect.any(Object) })
    expect(defaultPipelineDependencies('local-fixture').explorer).toBeInstanceOf(FixtureAuditExplorer)
    await defaultPipelineDependencies('local-fixture').wait(0)
    Object.assign(process.env, { NODE_ENV: 'test', AUDIT_LOCAL_EXECUTION: 'false' })
    expect(defaultPipelineDependencies('live').explorer).toBeInstanceOf(SandboxAuditExplorer)
    Object.assign(process.env, { AUDIT_LOCAL_EXECUTION: 'true' })
    expect(defaultPipelineDependencies('live').explorer).toBeInstanceOf(DockerAuditExplorer)
  })

  it('handles every fenced rate-limit persistence outcome', async () => {
    const terminal = harness({ deferStatus: 'terminal' })
    terminal.deps.model = { generate: vi.fn().mockRejectedValue(new AuditModelRateLimitError(1_000)) }
    await expect(executeAuditStage('audit-id', 'critic', terminal.deps)).resolves.toEqual({ status: 'terminal' })

    const fallback = harness({ deferRetryAt: null })
    fallback.deps.model = { generate: vi.fn().mockRejectedValue(new AuditModelRateLimitError(1_000)) }
    await expect(executeAuditStage('audit-id', 'critic', fallback.deps)).rejects.toMatchObject({ retryAfterMs: 1_000 })

    for (const finishStatus of ['partial', 'unchanged']) {
      const exhausted = harness({ deferRetryAt: new Date(Date.now() + 60_000).toISOString(), finishStatus })
      exhausted.deps.model = { generate: vi.fn().mockRejectedValue(new AuditModelRateLimitError(1_000)) }
      await expect(executeAuditStage('audit-id', 'critic', exhausted.deps)).resolves.toMatchObject({ status: finishStatus === 'unchanged' ? 'terminal' : 'partial' })
    }
  })

  it('does not misclassify ordinary Critic or Verifier errors as rate limits', async () => {
    for (const stage of ['critic', 'verifier'] as const) {
      const failed = harness()
      failed.deps.model = { generate: vi.fn().mockRejectedValue(new Error(`${stage} failed`)) }
      await expect(executeAuditStage('audit-id', stage, failed.deps)).rejects.toThrow(`${stage} failed`)
      expect(failed.fakeStore.deferAuditStageRetry).not.toHaveBeenCalled()
      expect(failed.deps.log).toHaveBeenCalledWith('error', 'stage.failed', expect.objectContaining({ auditId: 'audit-id', stage }))
    }
  })

  it('defers Verifier rate limits and applies configured inter-stage spacing', async () => {
    const verifier = harness()
    verifier.deps.model = { generate: vi.fn().mockRejectedValue(new AuditModelRateLimitError(1_000)) }
    await expect(executeAuditStage('audit-id', 'verifier', verifier.deps)).rejects.toBeInstanceOf(AuditStageRateLimitedError)

    const spaced = harness()
    spaced.deps.interStageDelayMs = 10
    await executeAuditPipeline('audit-id', spaced.deps)
    expect(spaced.deps.wait).toHaveBeenCalledWith(10)

    const configured = harness()
    configured.deps.interStageDelayMs = undefined as never
    process.env.AI_API_BASE_URL = 'https://ai-gateway.vercel.sh/v1'
    await executeAuditPipeline('audit-id', configured.deps)
    expect(configured.deps.wait).toHaveBeenCalledWith(15_000)
  })

  it('uses the default timer when a local caller omits a retry waiter', async () => {
    vi.useFakeTimers()
    const retrying = harness()
    retrying.deps.wait = undefined as never
    retrying.deps.model = { generate: vi.fn()
      .mockRejectedValueOnce(new AuditModelRateLimitError(1_000))
      .mockResolvedValueOnce({ candidates: [candidate] })
      .mockResolvedValueOnce({ decisions: [{ candidateId: candidate.id, admitted: true, contradictions: [] }] }) }
    const pending = executeAuditPipeline('audit-id', retrying.deps)
    await vi.advanceTimersByTimeAsync(1_000)
    await pending
    expect(retrying.fakeStore.finishAuditModelRateLimited).not.toHaveBeenCalled()

    const spaced = harness()
    spaced.deps.wait = undefined as never
    spaced.deps.interStageDelayMs = 10
    const spacedPending = executeAuditPipeline('audit-id', spaced.deps)
    await vi.advanceTimersByTimeAsync(10)
    await spacedPending
  })

  it('rejects unknown persistence results and treats unchanged finalization as terminal', async () => {
    await expect(executeAuditStage('audit-id', 'explorer', harness({ completeStatus: 'unknown' }).deps)).rejects.toThrow('audit_stage_persistence_failed')
    await expect(executeAuditStage('audit-id', 'verifier', harness({ finalizeStatus: 'unchanged', candidates: [] }).deps)).resolves.toMatchObject({ status: 'terminal' })
  })

  it('resumes checkpoints, waits for stage order, and finalizes an exhausted run as partial', async () => {
    const resumed = harness({ acquireStatus: 'already_completed' })
    await executeAuditPipeline('audit-id', resumed.deps)
    expect(resumed.fakeStore.acquireAuditStage).toHaveBeenCalledTimes(3)
    expect(resumed.fakeStore.completeAuditStage).not.toHaveBeenCalled()
    const waiting = harness({ acquireStatus: 'not_ready' })
    await expect(executeAuditPipeline('audit-id', waiting.deps)).rejects.toBeInstanceOf(AuditStageBusyError)
    expect(waiting.fakeStore.markAuditFailed).not.toHaveBeenCalled()
    const expired = harness({ startedAt: '2000-01-01T00:00:00.000Z' })
    const generate = vi.spyOn(expired.model, 'generate')
    await executeAuditPipeline('audit-id', expired.deps)
    expect(expired.deps.explorer.explore).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
    expect(expired.fakeStore.finalizeAudit).toHaveBeenCalledWith('audit-id', 'lease-verifier', [], expect.objectContaining({ partialReason: expect.any(String) }))
  })

  it('uses production defaults, fallback budgets, and safe failure persistence when dependencies are omitted', async () => {
    vi.spyOn(auditStore, 'loadAuditPipelineState').mockResolvedValue({ run: { normalized_url: 'https://demo.crrt.ai/', mode: 'local-fixture', coverage }, evidence: [], candidates: [] } as never)
    vi.spyOn(auditStore, 'acquireAuditStage').mockResolvedValueOnce({ status: 'acquired', leaseToken: 'lease' }).mockResolvedValueOnce({ status: 'invalid_input' })
    vi.spyOn(auditStore, 'completeAuditStage').mockResolvedValue({ status: 'completed' })
    const failed = vi.spyOn(auditStore, 'markAuditFailed').mockResolvedValue({ status: 'failed' })
    await expect(executeAuditStage('audit-id', 'explorer')).resolves.toMatchObject({ status: 'completed' })
    await expect(executeAuditPipeline('audit-id')).rejects.toThrow('audit_stage_lease_failed')
    expect(failed).toHaveBeenCalled()
  })
})
