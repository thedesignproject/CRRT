import { beforeEach, describe, expect, it, vi } from 'vitest'

const stageErrors = vi.hoisted(() => ({
  RateLimit: class AuditStageRateLimitedError extends Error {
    constructor(public readonly retryAfterMs: number) { super('audit_model_rate_limited') }
  },
  Busy: class AuditStageBusyError extends Error {
    constructor(_message: string, public readonly retryAfterMs: number) { super('audit_stage_busy') }
  },
  retryable: vi.fn(),
}))
vi.mock('workflow', () => ({
  RetryableError: class RetryableError extends Error {
    constructor(message: string, public readonly options: unknown) { super(message); stageErrors.retryable(message, options) }
  },
  sleep: vi.fn(async () => undefined),
}))
vi.mock('../api/_lib/audits/pipeline.js', () => ({
  executeAuditStage: vi.fn(), AuditStageBusyError: stageErrors.Busy, AuditStageRateLimitedError: stageErrors.RateLimit,
}))
vi.mock('../api/_lib/audits/store.js', () => ({ finishAuditModelRateLimited: vi.fn(), markAuditFailed: vi.fn() }))

import { sleep } from 'workflow'
import { AuditStageBusyError, AuditStageRateLimitedError, executeAuditStage } from '../api/_lib/audits/pipeline.js'
import { finishAuditModelRateLimited, markAuditFailed } from '../api/_lib/audits/store.js'
import { productAuditWorkflow } from './product-audit.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(executeAuditStage).mockResolvedValue({ status: 'completed', count: 1 })
  vi.mocked(markAuditFailed).mockResolvedValue({ status: 'failed' })
  vi.mocked(finishAuditModelRateLimited).mockResolvedValue({ status: 'partial' })
})

describe('product audit workflow', () => {
  it('runs Explorer, Critic, and Verifier in order', async () => {
    await productAuditWorkflow('audit-id')
    expect(vi.mocked(executeAuditStage).mock.calls.map((call) => call[1])).toEqual(['explorer', 'critic', 'verifier'])
  })

  it('spaces Vercel Critic and Verifier calls', async () => {
    process.env.AI_API_BASE_URL = 'https://ai-gateway.vercel.sh/v1'
    await productAuditWorkflow('audit-id')
    expect(sleep).toHaveBeenCalledWith(15_000)
    delete process.env.AI_API_BASE_URL
  })

  it.each([
    ['terminal', 1],
    ['cancelled', 1],
  ] as const)('stops after Explorer when it is %s', async (status, calls) => {
    vi.mocked(executeAuditStage).mockResolvedValueOnce({ status })
    await productAuditWorkflow('audit-id')
    expect(executeAuditStage).toHaveBeenCalledTimes(calls)
  })

  it('stops after a terminal Critic', async () => {
    vi.mocked(executeAuditStage).mockResolvedValueOnce({ status: 'completed' }).mockResolvedValueOnce({ status: 'terminal' })
    await productAuditWorkflow('audit-id')
    expect(executeAuditStage).toHaveBeenCalledTimes(2)
  })

  it('records a safe terminal failure and rethrows the provider error', async () => {
    vi.mocked(executeAuditStage).mockResolvedValueOnce({ status: 'completed', count: 1 }).mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(productAuditWorkflow('audit-id')).rejects.toThrow('provider unavailable')
    expect(markAuditFailed).toHaveBeenCalledWith('audit-id', 'audit_execution_failed', 'The audit could not be completed safely.')
  })

  it('converts an exhausted durable rate-limit retry into a partial report', async () => {
    vi.mocked(executeAuditStage).mockResolvedValueOnce({ status: 'completed', count: 1 }).mockRejectedValueOnce(new AuditStageRateLimitedError(60_000))
    await productAuditWorkflow('audit-id')
    expect(finishAuditModelRateLimited).toHaveBeenCalledWith('audit-id')
    expect(markAuditFailed).not.toHaveBeenCalled()
  })

  it('retries lease conflicts at the persisted expiry without marking the audit failed', async () => {
    vi.mocked(executeAuditStage).mockRejectedValueOnce(new AuditStageBusyError('audit_stage_busy', 12_000))
    await productAuditWorkflow('audit-id')
    expect(stageErrors.retryable).toHaveBeenCalledWith('audit_stage_lease_conflict', { retryAfter: 12_000 })
    expect(markAuditFailed).not.toHaveBeenCalled()
    expect(finishAuditModelRateLimited).not.toHaveBeenCalled()
  })
})
