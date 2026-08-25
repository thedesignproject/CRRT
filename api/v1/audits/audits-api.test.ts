import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireProjectMembership: vi.fn(), requireUser: vi.fn() }))
vi.mock('../../_lib/audits/config.js', () => ({
  auditCapabilities: vi.fn(), auditBudgets: vi.fn(),
}))
vi.mock('../../_lib/audits/execution.js', () => ({ startAuditExecution: vi.fn(), cancelAuditExecution: vi.fn() }))
vi.mock('../../_lib/audits/store.js', () => ({
  cancelAudit: vi.fn(), createAuditRun: vi.fn(), getAuditResponse: vi.fn(), listAuditEvents: vi.fn(),
  markAuditFailed: vi.fn(), setAuditWorkflowRunId: vi.fn(),
}))
vi.mock('../../_lib/audits/tokens.js', () => ({
  createAuditCapability: vi.fn(), createOrVerifyAuditSession: vi.fn(), hashAuditIp: vi.fn(),
}))
vi.mock('../../_lib/audits/url-safety.js', () => ({
  UnsafeAuditUrlError: class UnsafeAuditUrlError extends Error {
    constructor(public readonly code: string) { super(code) }
  },
  isAuditDemoHostname: vi.fn(),
  validateAuditUrl: vi.fn(),
}))
vi.mock('../../_lib/audits/access.js', () => ({ requireAuditAccess: vi.fn() }))

import createHandler from './index.js'
import capabilitiesHandler from './capabilities.js'
import readHandler from './[auditId]/index.js'
import eventsHandler from './[auditId]/events.js'
import cancelHandler from './[auditId]/cancel.js'
import { requireProjectMembership, requireUser } from '../../_lib/auth.js'
import { auditBudgets, auditCapabilities } from '../../_lib/audits/config.js'
import { cancelAuditExecution, startAuditExecution } from '../../_lib/audits/execution.js'
import { requireAuditAccess } from '../../_lib/audits/access.js'
import { cancelAudit, createAuditRun, getAuditResponse, listAuditEvents, markAuditFailed, setAuditWorkflowRunId } from '../../_lib/audits/store.js'
import { createAuditCapability, createOrVerifyAuditSession, hashAuditIp } from '../../_lib/audits/tokens.js'
import { isAuditDemoHostname, UnsafeAuditUrlError, validateAuditUrl } from '../../_lib/audits/url-safety.js'

const auditId = '11111111-1111-4111-8111-111111111111'
const now = '2026-08-25T00:00:00.000Z'
const runResponse = {
  auditId, inputUrl: 'https://example.com/', mode: 'local-fixture', status: 'cancelled', stage: 'cancelled',
  progress: { auditId, stage: 'cancelled', completedStages: [], observedEvidenceCount: 0, candidateCount: 0, admittedFindingCount: 0 },
  coverage: { evaluatedSources: [], unavailableSources: ['repository', 'design-system', 'customer-rule'], routesAttempted: 0, routesEvaluated: 0 },
  report: null, error: null, createdAt: now, startedAt: null, completedAt: null, cancelledAt: now, expiresAt: null,
}

function mockRes() {
  return {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(value: unknown) { this.body = value; return this },
    end() { return this }, setHeader(key: string, value: string) { this.headers[key] = value },
  }
}

async function call(handler: unknown, req: Record<string, unknown>) {
  const res = mockRes()
  await (handler as (req: never, res: never) => Promise<unknown>)(req as never, res as never)
  return res
}

const createReq = (body: unknown = { url: 'https://example.com' }, headers: Record<string, string> = { 'idempotency-key': 'request-1', 'x-forwarded-for': '203.0.113.1' }) => ({ method: 'POST', query: {}, body, headers })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auditCapabilities).mockReturnValue({ enabled: true, anonymousEnabled: true, authenticatedEnabled: true })
  vi.mocked(auditBudgets).mockReturnValue({ maxRoutes: 5, maxActions: 20, wallClockMs: 300_000, modelTokens: 8000, maxArtifacts: 10 })
  vi.mocked(isAuditDemoHostname).mockReturnValue(false)
  vi.mocked(validateAuditUrl).mockResolvedValue({ url: 'https://example.com/', origin: 'https://example.com', hostname: 'example.com', addresses: ['8.8.8.8'] })
  vi.mocked(createOrVerifyAuditSession).mockReturnValue({ token: 'session', hash: 'session-hash', created: true })
  vi.mocked(createAuditCapability).mockReturnValue({ token: 'capability', hash: 'capability-hash' })
  vi.mocked(hashAuditIp).mockReturnValue('ip-hash')
  vi.mocked(createAuditRun).mockResolvedValue({ status: 'created', auditId })
  vi.mocked(startAuditExecution).mockResolvedValue('workflow-run')
  vi.mocked(setAuditWorkflowRunId).mockResolvedValue(undefined)
  vi.mocked(markAuditFailed).mockResolvedValue({ status: 'failed' })
  vi.mocked(requireUser).mockResolvedValue({ userId: 'user', email: 'user@example.com' })
  vi.mocked(requireProjectMembership).mockResolvedValue(true)
  vi.mocked(requireAuditAccess).mockResolvedValue({ workflow_run_id: 'workflow-run' })
  vi.mocked(getAuditResponse).mockResolvedValue(runResponse as never)
  vi.mocked(listAuditEvents).mockResolvedValue({ events: [], nextCursor: '0' })
  vi.mocked(cancelAudit).mockResolvedValue({ status: 'cancelled' })
  vi.mocked(cancelAuditExecution).mockResolvedValue(undefined)
})

describe('Product Audit API', () => {
  it('serves server-controlled capabilities and standard method handling', async () => {
    expect((await call(capabilitiesHandler, { method: 'OPTIONS', query: {}, headers: {} })).statusCode).toBe(204)
    expect((await call(capabilitiesHandler, { method: 'POST', query: {}, headers: {} })).statusCode).toBe(405)
    expect((await call(capabilitiesHandler, { method: 'GET', query: {}, headers: {} })).body).toEqual({ enabled: true, anonymousEnabled: true, authenticatedEnabled: true })
    expect((await call(createHandler, { method: 'GET', query: {}, headers: {} })).statusCode).toBe(405)
    expect((await call(createHandler, { method: 'OPTIONS', query: {}, headers: {} })).statusCode).toBe(204)
  })

  it('creates an anonymous run and returns only raw client credentials', async () => {
    const response = await call(createHandler, createReq())
    expect(response.statusCode).toBe(202)
    expect(response.body).toMatchObject({ auditId, status: 'queued', sessionToken: 'session', auditToken: 'capability' })
    expect(createAuditCapability).toHaveBeenCalledWith('session-hash:request-1')
    expect(createAuditRun).toHaveBeenCalledWith(expect.objectContaining({ capabilityHash: 'capability-hash', sessionHash: 'session-hash', ipHash: 'ip-hash' }))
    expect(setAuditWorkflowRunId).toHaveBeenCalledWith(auditId, 'workflow-run')
    expect(createAuditRun).toHaveBeenCalledWith(expect.objectContaining({ mode: 'live' }))
    expect(startAuditExecution).toHaveBeenCalledWith(auditId, 'live')
  })

  it('uses the no-AI fixture only for demo.crrt.ai', async () => {
    vi.mocked(validateAuditUrl).mockResolvedValueOnce({ url: 'https://demo.crrt.ai/', origin: 'https://demo.crrt.ai', hostname: 'demo.crrt.ai', addresses: [] })
    vi.mocked(isAuditDemoHostname).mockReturnValueOnce(true)
    const response = await call(createHandler, createReq({ url: 'https://demo.crrt.ai' }))
    expect(response.statusCode).toBe(202)
    expect(createAuditRun).toHaveBeenCalledWith(expect.objectContaining({ normalizedUrl: 'https://demo.crrt.ai/', mode: 'local-fixture' }))
    expect(startAuditExecution).toHaveBeenCalledWith(auditId, 'local-fixture')
  })

  it('creates authenticated project runs only after membership and supports idempotent replay', async () => {
    vi.mocked(createAuditRun).mockResolvedValue({ status: 'existing', auditId, runStatus: 'running', expiresAt: null })
    const response = await call(createHandler, createReq({ url: 'https://example.com', projectKey: 'project' }, { 'idempotency-key': 'key', authorization: 'Bearer token' }))
    expect(response.statusCode).toBe(200)
    expect(requireProjectMembership).toHaveBeenCalled()
    expect(response.body).not.toHaveProperty('auditToken')
    expect(response.body).toMatchObject({ status: 'running' })
    expect(startAuditExecution).not.toHaveBeenCalled()
    expect(createAuditRun).toHaveBeenCalledWith(expect.objectContaining({ ownerKind: 'project', mode: 'live', creatorUserId: 'user' }))
  })

  it('replays persisted anonymous status, expiry, and deterministic credentials', async () => {
    vi.mocked(createAuditRun).mockResolvedValue({ status: 'existing', auditId, runStatus: 'completed', expiresAt: now })
    const response = await call(createHandler, createReq())
    expect(response).toMatchObject({ statusCode: 200, body: {
      auditId, status: 'completed', expiresAt: now, sessionToken: 'session', auditToken: 'capability',
    } })
    expect(startAuditExecution).not.toHaveBeenCalled()
  })

  it('validates availability, request contracts, idempotency, and anonymous policy', async () => {
    vi.mocked(auditCapabilities).mockReturnValueOnce({ enabled: false, anonymousEnabled: false, authenticatedEnabled: false })
    expect((await call(createHandler, createReq())).statusCode).toBe(404)
    expect((await call(createHandler, createReq({ url: 'bad' }))).statusCode).toBe(400)
    expect((await call(createHandler, createReq(undefined, {}))).statusCode).toBe(400)
    vi.mocked(auditCapabilities).mockReturnValueOnce({ enabled: true, anonymousEnabled: false, authenticatedEnabled: true })
    expect((await call(createHandler, createReq())).statusCode).toBe(403)
    vi.mocked(auditCapabilities).mockReturnValueOnce({ enabled: true, anonymousEnabled: true, authenticatedEnabled: false })
    expect((await call(createHandler, createReq({ url: 'https://example.com', projectKey: 'p' }, { 'idempotency-key': 'key', authorization: 'Bearer token' }))).statusCode).toBe(403)
    expect(validateAuditUrl).not.toHaveBeenCalled()
  })

  it('uses each privacy-preserving client IP fallback and handles quota responses without retry metadata', async () => {
    await call(createHandler, createReq(undefined, { 'idempotency-key': 'real-ip', 'x-real-ip': '203.0.113.2' }))
    await call(createHandler, createReq(undefined, { 'idempotency-key': 'unknown-ip' }))
    expect(hashAuditIp).toHaveBeenNthCalledWith(1, '203.0.113.2')
    expect(hashAuditIp).toHaveBeenNthCalledWith(2, 'unknown')
    vi.mocked(createAuditRun).mockResolvedValueOnce({ status: 'rate_limited' })
    const response = await call(createHandler, createReq())
    expect(response.statusCode).toBe(429)
    expect(response.headers['Retry-After']).toBeUndefined()
  })

  it('stops project creation when authentication or membership fails', async () => {
    expect((await call(createHandler, createReq({ url: 'https://example.com', projectKey: 'p' }))).statusCode).toBe(401)
    expect(validateAuditUrl).not.toHaveBeenCalled()
    vi.mocked(requireUser).mockImplementationOnce(async (_req, res) => { res.status(401).json({ error: 'Unauthorized' }); return null })
    expect((await call(createHandler, createReq({ url: 'https://example.com', projectKey: 'p' }, { 'idempotency-key': 'key', authorization: 'Bearer bad' }))).statusCode).toBe(401)
    expect(validateAuditUrl).not.toHaveBeenCalled()
    vi.mocked(requireProjectMembership).mockImplementationOnce(async (_req, res) => { res.status(403).json({ error: 'Forbidden' }); return false })
    expect((await call(createHandler, createReq({ url: 'https://example.com', projectKey: 'p' }, { 'idempotency-key': 'key', authorization: 'Bearer token' }))).statusCode).toBe(403)
    expect(validateAuditUrl).not.toHaveBeenCalled()
  })

  it('maps quotas, invalid RPC results, unsafe URLs, workflow start failure, and internal failures safely', async () => {
    vi.mocked(createAuditRun).mockResolvedValueOnce({ status: 'rate_limited', retryAt: new Date(Date.now() + 5_000).toISOString() })
    let response = await call(createHandler, createReq())
    expect(response.statusCode).toBe(429)
    expect(response.headers['Retry-After']).toBeDefined()
    vi.mocked(createAuditRun).mockResolvedValueOnce({ status: 'invalid_input' })
    expect((await call(createHandler, createReq())).statusCode).toBe(400)
    vi.mocked(validateAuditUrl).mockRejectedValueOnce(new UnsafeAuditUrlError('private_target'))
    response = await call(createHandler, createReq())
    expect(response).toMatchObject({ statusCode: 400, body: { error: 'Unsafe audit URL: private_target' } })
    vi.mocked(startAuditExecution).mockRejectedValueOnce(new Error('provider unavailable'))
    expect((await call(createHandler, createReq())).statusCode).toBe(503)
    expect(markAuditFailed).toHaveBeenCalled()
    expect(cancelAuditExecution).not.toHaveBeenCalled()
    vi.mocked(createAuditRun).mockRejectedValueOnce(new Error('db'))
    expect((await call(createHandler, createReq())).statusCode).toBe(500)
  })

  it.each([false, true])('compensating-cancels a started workflow when durable linkage fails (cancel fails: %s)', async (cancelFails) => {
    vi.mocked(setAuditWorkflowRunId).mockRejectedValueOnce(new Error('link failed'))
    if (cancelFails) vi.mocked(cancelAuditExecution).mockRejectedValueOnce(new Error('cancel failed'))
    const response = await call(createHandler, createReq())
    expect(response.statusCode).toBe(503)
    expect(cancelAuditExecution).toHaveBeenCalledWith('workflow-run')
    expect(markAuditFailed).toHaveBeenCalledWith(auditId, 'workflow_start_failed', 'The audit could not be started safely.')
  })

  it('reads validated state and cursor-based events', async () => {
    expect((await call(readHandler, { method: 'OPTIONS', query: {}, headers: {} })).statusCode).toBe(204)
    expect((await call(readHandler, { method: 'POST', query: {}, headers: {} })).statusCode).toBe(405)
    expect((await call(readHandler, { method: 'GET', query: {}, headers: {} })).statusCode).toBe(400)
    expect((await call(readHandler, { method: 'GET', query: { auditId: 'bad' }, headers: {} })).statusCode).toBe(400)
    let response = await call(readHandler, { method: 'GET', query: { auditId }, headers: {} })
    expect(response).toMatchObject({ statusCode: 200, body: { auditId } })
    vi.mocked(requireAuditAccess).mockResolvedValueOnce(null)
    expect((await call(readHandler, { method: 'GET', query: { auditId }, headers: {} })).body).toBeUndefined()
    vi.mocked(getAuditResponse).mockResolvedValueOnce(null)
    expect((await call(readHandler, { method: 'GET', query: { auditId }, headers: {} })).statusCode).toBe(404)
    vi.mocked(getAuditResponse).mockRejectedValueOnce(new Error('db'))
    expect((await call(readHandler, { method: 'GET', query: { auditId }, headers: {} })).statusCode).toBe(500)

    expect((await call(eventsHandler, { method: 'OPTIONS', query: {}, headers: {} })).statusCode).toBe(204)
    expect((await call(eventsHandler, { method: 'POST', query: {}, headers: {} })).statusCode).toBe(405)
    expect((await call(eventsHandler, { method: 'GET', query: {}, headers: {} })).statusCode).toBe(400)
    expect((await call(eventsHandler, { method: 'GET', query: { auditId, after: 'bad' }, headers: {} })).statusCode).toBe(400)
    expect((await call(eventsHandler, { method: 'GET', query: { auditId, limit: '1.5' }, headers: {} })).statusCode).toBe(400)
    expect((await call(eventsHandler, { method: 'GET', query: { auditId, limit: '0' }, headers: {} })).statusCode).toBe(400)
    expect((await call(eventsHandler, { method: 'GET', query: { auditId, limit: '101' }, headers: {} })).statusCode).toBe(400)
    response = await call(eventsHandler, { method: 'GET', query: { auditId, after: '4', limit: '10' }, headers: {} })
    expect(response).toMatchObject({ statusCode: 200, body: { nextCursor: '0' } })
    expect(listAuditEvents).toHaveBeenCalledWith(auditId, '4', 10)
    vi.mocked(requireAuditAccess).mockResolvedValueOnce(null)
    expect((await call(eventsHandler, { method: 'GET', query: { auditId }, headers: {} })).body).toBeUndefined()
    vi.mocked(listAuditEvents).mockRejectedValueOnce(new Error('db'))
    expect((await call(eventsHandler, { method: 'GET', query: { auditId }, headers: {} })).statusCode).toBe(500)
  })

  it('persists cancellation before best-effort provider cancellation', async () => {
    expect((await call(cancelHandler, { method: 'OPTIONS', query: {}, headers: {} })).statusCode).toBe(204)
    expect((await call(cancelHandler, { method: 'GET', query: {}, headers: {} })).statusCode).toBe(405)
    expect((await call(cancelHandler, { method: 'POST', query: {}, headers: {} })).statusCode).toBe(400)
    expect((await call(cancelHandler, { method: 'POST', query: { auditId: 'bad' }, headers: {} })).statusCode).toBe(400)
    let response = await call(cancelHandler, { method: 'POST', query: { auditId }, headers: {} })
    expect(response.statusCode).toBe(200)
    expect(vi.mocked(cancelAudit).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(cancelAuditExecution).mock.invocationCallOrder[0])
    vi.mocked(cancelAuditExecution).mockRejectedValueOnce(new Error('provider'))
    expect((await call(cancelHandler, { method: 'POST', query: { auditId }, headers: {} })).statusCode).toBe(200)
    vi.mocked(requireAuditAccess).mockResolvedValueOnce(null)
    response = await call(cancelHandler, { method: 'POST', query: { auditId }, headers: {} })
    expect(cancelAudit).toHaveBeenCalledTimes(2)
    vi.mocked(requireAuditAccess).mockResolvedValueOnce({ workflow_run_id: null })
    expect((await call(cancelHandler, { method: 'POST', query: { auditId }, headers: {} })).statusCode).toBe(200)
    vi.mocked(getAuditResponse).mockResolvedValueOnce(null)
    expect((await call(cancelHandler, { method: 'POST', query: { auditId }, headers: {} })).statusCode).toBe(404)
    vi.mocked(cancelAudit).mockRejectedValueOnce(new Error('db'))
    expect((await call(cancelHandler, { method: 'POST', query: { auditId }, headers: {} })).statusCode).toBe(500)
  })
})
