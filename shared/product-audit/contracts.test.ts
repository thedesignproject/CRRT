import { describe, expect, it } from 'vitest'
import {
  auditEventSchema,
  auditInputSchema,
  auditProgressSchema,
  auditReportSchema,
  auditRunResponseSchema,
} from './contracts'

describe('shared Product Audit contracts', () => {
  it('accepts Supabase timestamp offsets in durable run projections', () => {
    const timestamp = '2026-08-25T14:04:01.738452+00:00'
    expect(auditRunResponseSchema.parse({
      auditId: '11111111-1111-4111-8111-111111111111', inputUrl: 'https://example.com/', mode: 'live', status: 'completed', stage: 'completed',
      progress: { auditId: '11111111-1111-4111-8111-111111111111', stage: 'completed', completedStages: ['explorer', 'critic'], observedEvidenceCount: 0, candidateCount: 0, admittedFindingCount: 0 },
      coverage: { evaluatedSources: ['url'], unavailableSources: [], routesAttempted: 1, routesEvaluated: 1 },
      report: { auditId: '11111111-1111-4111-8111-111111111111', inputUrl: 'https://example.com/', mode: 'live', evaluatedSources: ['url'], unavailableSources: [], findings: [], evidence: [], completedAt: timestamp },
      error: null, createdAt: timestamp, startedAt: timestamp, completedAt: timestamp, cancelledAt: null, expiresAt: timestamp,
    }).completedAt).toBe(timestamp)
  })
  it('accepts URL-only and enriched audit inputs', () => {
    expect(auditInputSchema.parse({ url: 'https://example.com' })).toEqual({
      url: 'https://example.com',
    })

    expect(auditInputSchema.parse({
      url: 'https://example.com',
      repository: { url: 'https://github.com/example/product', ref: 'main' },
      designSystem: { url: 'https://github.com/example/design-system' },
      customerRules: ['Checkout must remain available without signup.'],
    })).toMatchObject({
      repository: { ref: 'main' },
      customerRules: expect.any(Array),
    })
  })

  it('supports production progress without allowing more than five findings', () => {
    expect(auditEventSchema.parse({
      sequence: '1', auditId: '11111111-1111-4111-8111-111111111111',
      eventType: 'audit.stage.rate_limited', actorType: 'critic', stage: 'critic',
      payload: { retryAt: '2026-08-25T14:05:01.738452+00:00' }, createdAt: '2026-08-25T14:04:01.738452+00:00',
    }).eventType).toBe('audit.stage.rate_limited')
    expect(auditProgressSchema.parse({
      auditId: 'audit-1',
      stage: 'verifier',
      completedStages: ['explorer', 'critic'],
      observedEvidenceCount: 8,
      candidateCount: 6,
      admittedFindingCount: 3,
    }).stage).toBe('verifier')

    expect(() => auditProgressSchema.parse({
      auditId: 'audit-1',
      stage: 'completed',
      completedStages: ['explorer', 'critic', 'verifier'],
      observedEvidenceCount: 8,
      candidateCount: 6,
      admittedFindingCount: 6,
    })).toThrow()
  })

  it('accepts live reports while preserving Open as the only finding status', () => {
    const evidence = { id: 'evidence-1', source: 'url', signalKey: 'navigation', location: '/', observation: 'The primary action is difficult to identify.', confidence: .82, direct: true }
    const report = auditReportSchema.parse({
      auditId: 'audit-live',
      inputUrl: 'https://example.com',
      mode: 'live',
      evaluatedSources: ['url'],
      unavailableSources: ['repository', 'design-system', 'customer-rule'],
      findings: [],
      observations: [{ id: 'candidate-1', kind: 'opportunity', title: 'Clarify the primary action', summary: 'The primary action may be hard to identify.', impact: 'medium', confidence: .82, evidenceIds: ['evidence-1'], recommendation: 'Increase the primary action prominence.', status: 'needs-more-evidence', reason: 'The candidate did not clear verification and deterministic admission.', evidence: [evidence] }],
      evidence: [evidence],
    })

    expect(report.mode).toBe('live')
    expect(report.findings).toEqual([])
    expect(report.observations).toEqual([expect.objectContaining({ status: 'needs-more-evidence' })])
    expect(() => auditReportSchema.parse({ ...report, observations: Array(6).fill(report.observations?.[0]) })).toThrow()
  })
})
