import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const auditState = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../../../shared/product-audit/useAuditRun', async (importOriginal) => ({ ...await importOriginal(), useAuditRun: () => auditState.current }))
vi.mock('../../../shared/product-audit/browser-client', () => ({ createAudit: vi.fn() }))
vi.mock('../api', () => ({ listProjects: vi.fn() }))
import { createAudit } from '../../../shared/product-audit/browser-client'
import { listProjects } from '../api'
import { ProductAuditPage } from './ProductAuditPage'
import type { AuditEvent, AuditRunResponse } from '../../../shared/product-audit/contracts'
import type { AuditCreateResponse } from '../../../shared/product-audit/contracts'
const auditId = '11111111-1111-4111-8111-111111111111'
const now = '2026-08-25T00:00:00.000Z'
const baseRun: AuditRunResponse = { auditId, inputUrl: 'https://example.com/', mode: 'live', status: 'running', stage: 'explorer', progress: { auditId, stage: 'explorer', completedStages: [], observedEvidenceCount: 2, candidateCount: 0, admittedFindingCount: 0 }, coverage: { evaluatedSources: ['url'], unavailableSources: ['repository', 'design-system', 'customer-rule'], routesAttempted: 1, routesEvaluated: 1 }, report: null, error: null, createdAt: now, startedAt: now, completedAt: null, cancelledAt: null, expiresAt: null }
const finding = { id: 'f', kind: 'problem' as const, title: 'Problem', summary: 'Summary', impact: 'high' as const, confidence: .95, evidenceIds: ['e'], recommendation: 'Fix', status: 'open' as const, admittedBy: 'direct-evidence' as const, evidence: [{ id: 'e', source: 'url' as const, signalKey: 'signal', location: '/', observation: 'Observed', confidence: 1, direct: true, provenance: { collector: 'sandbox' } }] }
const observation = { ...finding, id: 'candidate', title: 'Possible hierarchy issue', impact: 'medium' as const, confidence: .82, status: 'needs-more-evidence' as const, reason: 'The candidate did not clear verification and deterministic admission.' }
function state(run: AuditRunResponse | null, error: string | null = null, events: AuditEvent[] = []) { return { run, events, error, cancelling: false, cancel: vi.fn(), refresh: vi.fn() } }
const props = { apiBase: '/api', accessToken: 'bearer', auditId }
beforeEach(() => {
  vi.clearAllMocks()
  auditState.current = state(baseRun)
  vi.mocked(listProjects).mockResolvedValue([{ publicKey: 'project', slug: 'project', name: 'Project', allowedOrigins: [], createdAt: now, updatedAt: now }])
})
describe('dashboard Product Audit', () => {
  it('launches an authenticated project audit and prevents duplicate submission', async () => {
    let release = (_value: AuditCreateResponse) => {}
    vi.mocked(createAudit).mockImplementation(() => new Promise((resolve) => { release = resolve }))
    render(<ProductAuditPage {...props} auditId="new" />)
    await screen.findByRole('option', { name: 'Project' })
    const project = screen.getByLabelText('Project')
    const url = screen.getByLabelText(/product url/i)
    expect(project).toHaveAttribute('name', 'projectKey')
    expect(project).toHaveAttribute('autocomplete', 'off')
    expect(url).toHaveAttribute('name', 'url')
    expect(url).toHaveAttribute('autocomplete', 'url')
    fireEvent.change(project, { target: { value: 'project' } })
    fireEvent.change(url, { target: { value: 'https://example.com' } })
    const button = screen.getByRole('button', { name: /run product audit/i })
    expect(button).toHaveAttribute('type', 'submit')
    fireEvent.click(button)
    fireEvent.submit(button.closest('form')!)
    expect(createAudit).toHaveBeenCalledTimes(1)
    expect(createAudit).toHaveBeenCalledWith('/api', { url: 'https://example.com', projectKey: 'project', accessToken: 'bearer' })
    release({ auditId, status: 'queued' })
  })
  it('shows project-load and creation errors', async () => {
    vi.mocked(listProjects).mockRejectedValueOnce(new Error('Projects unavailable'))
    const { unmount } = render(<ProductAuditPage {...props} auditId="new" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Projects unavailable')
    unmount()
    vi.mocked(listProjects).mockResolvedValueOnce([{ publicKey: 'p', slug: 'p', name: 'P', allowedOrigins: [], createdAt: now, updatedAt: now }])
    vi.mocked(createAudit).mockRejectedValueOnce(new Error('Audit quota reached'))
    render(<ProductAuditPage {...props} auditId="new" />)
    await screen.findByRole('option', { name: 'P' })
    fireEvent.change(screen.getByLabelText(/product url/i), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /run product audit/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Audit quota reached')
  })
  it('handles empty projects and non-Error failures without submitting', async () => {
    vi.mocked(listProjects).mockResolvedValueOnce([])
    const { container, unmount } = render(<ProductAuditPage {...props} auditId="new" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /run product audit/i })).toBeDisabled())
    fireEvent.submit(container.querySelector('form')!)
    expect(createAudit).not.toHaveBeenCalled()
    unmount()
    vi.mocked(listProjects).mockRejectedValueOnce('project failure')
    render(<ProductAuditPage {...props} auditId="new" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load projects')
  })
  it('uses a safe fallback for non-Error creation failures', async () => {
    vi.mocked(createAudit).mockRejectedValueOnce('audit failure')
    render(<ProductAuditPage {...props} auditId="new" />)
    await screen.findByRole('option', { name: 'Project' })
    fireEvent.change(screen.getByLabelText(/product url/i), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /run product audit/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not start audit')
  })
  it('renders loading, active progress, source coverage, and cancellation', () => {
    auditState.current = state(null)
    const { rerender } = render(<ProductAuditPage {...props} />)
    expect(screen.getByText('Loading audit state…')).toBeInTheDocument()
    auditState.current = state(baseRun)
    rerender(<ProductAuditPage {...props} />)
    expect(screen.getByText('explorer_in_progress')).toBeInTheDocument()
    expect(screen.getByText(/2 evidence · 0 candidates/i)).toBeInTheDocument()
    expect(screen.getAllByText('unavailable')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /cancel audit/i }))
    expect((auditState.current as ReturnType<typeof state>).cancel).toHaveBeenCalled()
    auditState.current = { ...state(baseRun), cancelling: true }
    rerender(<ProductAuditPage {...props} />)
    expect(screen.getByRole('button', { name: /cancelling/i })).toBeDisabled()
  })
  it('renders the model-capacity backoff state for authenticated audits', () => {
    auditState.current = state({ ...baseRun, stage: 'verifier' }, null, [{ sequence: '9', auditId, eventType: 'audit.stage.rate_limited', actorType: 'verifier', stage: 'verifier', payload: { retryAt: now }, createdAt: now }])
    render(<ProductAuditPage {...props} />)
    expect(screen.getByText('waiting_for_model_capacity')).toBeInTheDocument()
    expect(screen.getByText(/lease is safely released/i)).toBeInTheDocument()
    expect(screen.getByText('waiting')).toBeInTheDocument()
  })
  it.each([
    ['failed', 'The audit failed safely.'], ['cancelled', 'The audit was cancelled.'],
  ] as const)('renders %s safely', (status, message) => {
    auditState.current = state({ ...baseRun, status, stage: status, error: status === 'failed' ? { code: 'failed', message: 'Safe failure', retryable: false } : null })
    render(<ProductAuditPage {...props} />)
    expect(screen.getByText(message)).toBeInTheDocument()
  })
  it('renders zero findings and partial findings with provenance', () => {
    auditState.current = state({ ...baseRun, status: 'completed', stage: 'completed', completedAt: null, report: { auditId, inputUrl: baseRun.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: baseRun.coverage.unavailableSources, findings: [], observations: [observation], evidence: observation.evidence } })
    const { rerender } = render(<ProductAuditPage {...props} />)
    expect(screen.getByText('No findings cleared the bar.')).toBeInTheDocument()
    expect(screen.getByText('1 candidate observation not admitted')).toBeInTheDocument()
    expect(screen.getByText('Possible hierarchy issue')).toBeInTheDocument()
    expect(screen.getByText(/not Open findings/i)).toBeInTheDocument()
    const secondObservation = { ...observation, id: 'candidate-2', title: 'Possible copy issue', evidence: [{ ...observation.evidence[0], id: 'candidate-evidence-2', provenance: undefined }] }
    auditState.current = state({ ...baseRun, status: 'completed', stage: 'completed', completedAt: null, report: { auditId, inputUrl: baseRun.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: baseRun.coverage.unavailableSources, findings: [], observations: [observation, secondObservation], evidence: [...observation.evidence, ...secondObservation.evidence] } })
    rerender(<ProductAuditPage {...props} />)
    expect(screen.getByText('2 candidate observations not admitted')).toBeInTheDocument()
    expect(screen.getByText(/url · \/ · observable evidence/i)).toBeInTheDocument()
    auditState.current = state({ ...baseRun, status: 'partial', stage: 'completed', completedAt: now, coverage: { ...baseRun.coverage, partialReason: 'Blocked route' }, report: { auditId, inputUrl: baseRun.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: baseRun.coverage.unavailableSources, findings: [finding], evidence: finding.evidence, completedAt: now } })
    rerender(<ProductAuditPage {...props} />)
    expect(screen.getByText('1 Open finding cleared the bar.')).toBeInTheDocument()
    expect(screen.getByText(/url · \/ · sandbox/i)).toBeInTheDocument()
    expect(screen.getByText(/Blocked route/)).toBeInTheDocument()
    const second = { ...finding, id: 'f2', title: 'Second problem', evidence: [{ ...finding.evidence[0], id: 'e2', provenance: undefined }] }
    auditState.current = state({ ...baseRun, status: 'completed', stage: 'completed', completedAt: now, report: { auditId, inputUrl: baseRun.inputUrl, mode: 'live', evaluatedSources: ['url'], unavailableSources: baseRun.coverage.unavailableSources, findings: [finding, second], evidence: [...finding.evidence, ...second.evidence], completedAt: now } })
    rerender(<ProductAuditPage {...props} />)
    expect(screen.getByText('2 Open findings cleared the bar.')).toBeInTheDocument()
    expect(screen.getByText(/url · \/ · observable evidence/i)).toBeInTheDocument()
  })
  it('ignores late project responses after unmount', async () => {
    let resolve = (_value: unknown) => {}
    vi.mocked(listProjects).mockImplementationOnce(() => new Promise((done) => { resolve = done }) as never)
    const { unmount } = render(<ProductAuditPage {...props} auditId="new" />)
    unmount(); resolve([])
    await waitFor(() => expect(listProjects).toHaveBeenCalled())
    let reject = (_value: unknown) => {}
    vi.mocked(listProjects).mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail }) as never)
    const late = render(<ProductAuditPage {...props} auditId="new" />)
    late.unmount(); reject(new Error('late'))
    await waitFor(() => expect(listProjects).toHaveBeenCalledTimes(2))
  })
})
