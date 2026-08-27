import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./browser-client', () => ({ cancelAudit: vi.fn(), getAudit: vi.fn(), getAuditEvents: vi.fn() }))
import { cancelAudit, getAudit, getAuditEvents } from './browser-client'
import { latestModelCapacityWait, useAuditRun } from './useAuditRun'
const auditId = '11111111-1111-4111-8111-111111111111'
const now = '2026-08-25T00:00:00.000Z'
const run = { auditId, inputUrl: 'https://example.com/', mode: 'live' as const, status: 'running' as const, stage: 'explorer' as const, progress: { auditId, stage: 'explorer' as const, completedStages: [], observedEvidenceCount: 0, candidateCount: 0, admittedFindingCount: 0 }, coverage: { evaluatedSources: [], unavailableSources: ['repository' as const, 'design-system' as const, 'customer-rule' as const], routesAttempted: 0, routesEvaluated: 0 }, report: null, error: null, createdAt: now, startedAt: null, completedAt: null, cancelledAt: null, expiresAt: null }
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.mocked(getAudit).mockResolvedValue(run)
  vi.mocked(getAuditEvents).mockResolvedValue({ events: [], nextCursor: '0' })
  vi.mocked(cancelAudit).mockResolvedValue({ ...run, status: 'cancelled', stage: 'cancelled', cancelledAt: now })
})
afterEach(() => vi.useRealTimers())
describe('useAuditRun', () => {
  it('only treats the latest rate-limit event as an active capacity wait', () => {
    const limited = { sequence: '1', auditId, eventType: 'audit.stage.rate_limited' as const, actorType: 'critic' as const, stage: 'critic' as const, payload: { retryAt: now }, createdAt: now }
    expect(latestModelCapacityWait([limited])).toEqual({ stage: 'critic', retryAt: now })
    expect(latestModelCapacityWait([limited, { ...limited, sequence: '2', eventType: 'audit.stage.started', payload: {} }])).toBeNull()
    expect(latestModelCapacityWait([{ ...limited, payload: {} }])).toEqual({ stage: 'critic', retryAt: null })
  })
  it('polls cursor-based state, deduplicates events, and stops on terminal state', async () => {
    const event = { sequence: '1', auditId, eventType: 'audit.queued' as const, actorType: 'system' as const, stage: 'queued' as const, payload: {}, createdAt: now }
    vi.mocked(getAuditEvents).mockResolvedValue({ events: [event], nextCursor: '1' })
    vi.mocked(getAudit).mockResolvedValueOnce(run).mockResolvedValueOnce({ ...run, status: 'completed', stage: 'completed', completedAt: now, report: { auditId, inputUrl: run.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: run.coverage.unavailableSources, findings: [], evidence: [], completedAt: now } })
    const { result } = renderHook(() => useAuditRun('/api', auditId, 'bearer'))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.run).not.toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(result.current.run?.status).toBe('completed')
    expect(result.current.events).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(getAudit).toHaveBeenCalledTimes(2)
  })
  it('backs off after polling failures and cancels safely', async () => {
    vi.mocked(getAudit).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(run)
    const { result, unmount } = renderHook(() => useAuditRun('/api', auditId))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.error).toBe('offline')
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(result.current.run).not.toBeNull()
    await act(async () => { await result.current.cancel() })
    expect(result.current.run?.status).toBe('cancelled')
    vi.mocked(cancelAudit).mockRejectedValueOnce(new Error('cannot cancel'))
    await act(async () => { await result.current.cancel() })
    expect(result.current.error).toBe('cannot cancel')
    unmount()
  })
  it('uses safe fallback messages for non-Error failures', async () => {
    vi.mocked(getAudit).mockRejectedValueOnce('offline').mockResolvedValue(run)
    const { result, unmount } = renderHook(() => useAuditRun('/api', auditId))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.error).toBe('Audit polling failed')
    vi.mocked(cancelAudit).mockRejectedValueOnce('blocked')
    await act(async () => { await result.current.cancel() })
    expect(result.current.error).toBe('Audit cancellation failed')
    unmount()
  })
  it('ignores a polling rejection caused by cleanup aborting the request', async () => {
    vi.mocked(getAudit).mockImplementation((_apiBase, _auditId, _accessToken, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const { unmount } = renderHook(() => useAuditRun('/api', auditId))
    unmount()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
  })
  it('renders a terminal report even when event polling fails', async () => {
    vi.mocked(getAudit).mockResolvedValue({ ...run, status: 'completed', stage: 'completed', completedAt: now, report: { auditId, inputUrl: run.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: run.coverage.unavailableSources, findings: [], evidence: [], completedAt: now } })
    vi.mocked(getAuditEvents).mockRejectedValue(new Error('events unavailable'))
    const { result } = renderHook(() => useAuditRun('/api', auditId))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.run?.status).toBe('completed')
    expect(result.current.error).toBeNull()
  })
  it('resets state and the event cursor when the audit identity changes', async () => {
    const event = { sequence: '4', auditId, eventType: 'audit.queued' as const, actorType: 'system' as const, stage: 'queued' as const, payload: {}, createdAt: now }
    vi.mocked(getAuditEvents).mockResolvedValueOnce({ events: [event], nextCursor: '4' }).mockResolvedValue({ events: [], nextCursor: '0' }); const { result, rerender } = renderHook(({ id }) => useAuditRun('/api', id), { initialProps: { id: auditId } })
    await act(async () => { await Promise.resolve(); await Promise.resolve() }); expect(result.current.events).toHaveLength(1)
    rerender({ id: '22222222-2222-4222-8222-222222222222' }); await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.events).toEqual([]); expect(getAuditEvents).toHaveBeenLastCalledWith('/api', '22222222-2222-4222-8222-222222222222', '0', undefined, expect.any(AbortSignal))
  })
})
