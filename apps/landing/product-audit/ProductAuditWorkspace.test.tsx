import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditEvent, AuditRunResponse } from '../../../shared/product-audit/contracts'
const auditState = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../../../shared/product-audit/useAuditRun', async (importOriginal) => ({ ...await importOriginal(), useAuditRun: () => auditState.current }))
import { ProductAuditWorkspace } from './ProductAuditWorkspace'
const auditId = '11111111-1111-4111-8111-111111111111'
const now = '2026-08-25T00:00:00.000Z'
const baseRun: AuditRunResponse = {
  auditId, inputUrl: 'https://demo.crrt.ai/', mode: 'live', status: 'running', stage: 'explorer',
  progress: { auditId, stage: 'explorer', completedStages: [], observedEvidenceCount: 0, candidateCount: 0, admittedFindingCount: 0 },
  coverage: { evaluatedSources: [], unavailableSources: ['repository', 'design-system', 'customer-rule'], routesAttempted: 1, routesEvaluated: 0 },
  report: null, error: null, createdAt: now, startedAt: now, completedAt: null, cancelledAt: null, expiresAt: null,
}
const finding = {
  id: 'finding', kind: 'problem' as const, title: 'Signup promise conflict', summary: 'Summary', impact: 'high' as const,
  confidence: .97, evidenceIds: ['evidence'], recommendation: 'Align the promise.', status: 'open' as const,
  admittedBy: 'direct-evidence' as const,
  evidence: [{ id: 'evidence', source: 'url' as const, signalKey: 'signal', location: '/signup', observation: 'A card is required.', confidence: 1, direct: true, provenance: { collector: 'vercel-sandbox' }, capture: { capturedAt: now } }],
}
const observation = { ...finding, id: 'candidate', title: 'Possible navigation ambiguity', impact: 'medium' as const, confidence: .82, status: 'needs-more-evidence' as const, reason: 'The candidate did not clear verification and deterministic admission.', evidence: finding.evidence }

function state(run: AuditRunResponse | null, error: string | null = null, events: AuditEvent[] = []) {
  return { run, events, error, cancelling: false, cancel: vi.fn(), refresh: vi.fn() }
}
beforeEach(() => { auditState.current = state(baseRun) })
describe('ProductAuditWorkspace', () => {
  it('shows queued runs honestly instead of claiming Explorer is active', () => {
    auditState.current = state({ ...baseRun, status: 'queued', stage: 'queued', startedAt: null, progress: { ...baseRun.progress, stage: 'queued' } })
    window.history.pushState({}, '', `/audit/${auditId}`)
    render(<ProductAuditWorkspace />)
    expect(screen.getByText('AUDIT_QUEUED')).toBeInTheDocument()
    expect(screen.getByText('Waiting for durable execution', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('EXPLORER_IN_PROGRESS')).not.toBeInTheDocument()
  })

  it('shows live progress, unavailable sources, and cancellation', () => {
    render(<ProductAuditWorkspace auditId={auditId} />)
    expect(screen.getByText('EXPLORER_IN_PROGRESS')).toBeInTheDocument()
    expect(screen.getAllByText('unavailable')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /cancel audit/i }))
    expect((auditState.current as ReturnType<typeof state>).cancel).toHaveBeenCalled()
  })

  it('shows durable model-capacity waiting without claiming the stage is stuck', () => {
    auditState.current = state({ ...baseRun, stage: 'critic' }, null, [{ sequence: '8', auditId, eventType: 'audit.stage.rate_limited', actorType: 'critic', stage: 'critic', payload: { retryAt: now }, createdAt: now }])
    render(<ProductAuditWorkspace auditId={auditId} />)
    expect(screen.getByText('WAITING_FOR_MODEL_CAPACITY')).toBeInTheDocument()
    expect(screen.getByText(/lease has been released safely/i)).toBeInTheDocument()
    expect(screen.getByText('waiting')).toBeInTheDocument()
  })

  it('renders zero findings without padding', () => {
    auditState.current = state({ ...baseRun, status: 'completed', stage: 'completed', completedAt: now, progress: { ...baseRun.progress, stage: 'completed', completedStages: ['explorer', 'critic', 'verifier'] }, report: { auditId, inputUrl: baseRun.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: baseRun.coverage.unavailableSources, findings: [], observations: [observation], evidence: finding.evidence, completedAt: now } })
    const { rerender } = render(<ProductAuditWorkspace auditId={auditId} />)
    expect(screen.getByText('No findings cleared the bar.')).toBeInTheDocument()
    expect(screen.getByText('0 padded')).toBeInTheDocument()
    expect(screen.getByText('1 candidate observation not admitted')).toBeInTheDocument()
    expect(screen.getByText('Possible navigation ambiguity')).toBeInTheDocument()
    expect(screen.getByText(/not Open findings/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
    const secondObservation = { ...observation, id: 'candidate-2', title: 'Possible copy ambiguity', evidence: [{ ...observation.evidence[0], id: 'evidence-2', provenance: undefined }] }
    auditState.current = state({ ...baseRun, status: 'completed', stage: 'completed', completedAt: now, report: { auditId, inputUrl: baseRun.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: baseRun.coverage.unavailableSources, findings: [], observations: [observation, secondObservation], evidence: [...observation.evidence, ...secondObservation.evidence], completedAt: now } })
    rerender(<ProductAuditWorkspace auditId={auditId} />)
    expect(screen.getByText('2 candidate observations not admitted')).toBeInTheDocument()
    expect(screen.getByText('Observable URL evidence')).toBeInTheDocument()
  })

  it('renders Open findings with source provenance and partial coverage', () => {
    auditState.current = state({ ...baseRun, status: 'partial', stage: 'completed', completedAt: now, coverage: { ...baseRun.coverage, evaluatedSources: ['url'], partialReason: 'One route was blocked.' }, report: { auditId, inputUrl: baseRun.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: baseRun.coverage.unavailableSources, findings: [finding], evidence: finding.evidence, completedAt: now } })
    const { rerender } = render(<ProductAuditWorkspace auditId={auditId} />)
    expect(screen.getByText('Signup promise conflict')).toBeInTheDocument()
    expect(screen.getByText(/url · \/signup/i)).toBeInTheDocument()
    expect(screen.getByText(/collected by vercel-sandbox/i)).toBeInTheDocument()
    expect(screen.getByText('One route was blocked.')).toBeInTheDocument()
    auditState.current = state({ ...baseRun, status: 'completed', stage: 'completed', completedAt: now, report: { auditId, inputUrl: baseRun.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: baseRun.coverage.unavailableSources, findings: [finding, { ...finding, id: 'finding-2' }], evidence: finding.evidence, completedAt: now } })
    rerender(<ProductAuditWorkspace auditId={auditId} />)
    expect(screen.getByText('2 findings cleared the bar.')).toBeInTheDocument()
  })

  it.each([
    ['failed', 'The audit failed safely.'],
    ['cancelled', 'This audit was cancelled.'],
  ] as const)('renders the %s terminal state', (status, message) => {
    auditState.current = state({ ...baseRun, status, stage: status, error: status === 'failed' ? { code: 'blocked', message: 'Could not explore.', retryable: false } : null })
    render(<ProductAuditWorkspace auditId={auditId} />)
    expect(screen.getByText(message)).toBeInTheDocument()
  })

  it('renders loading and polling errors without leaking credentials', () => {
    auditState.current = state(null, 'Unauthorized')
    render(<ProductAuditWorkspace auditId={auditId} />)
    expect(screen.getByText('Unauthorized')).toBeInTheDocument()
    expect(screen.getByText(/tokens stay in request headers/i)).toBeInTheDocument()
  })
})
