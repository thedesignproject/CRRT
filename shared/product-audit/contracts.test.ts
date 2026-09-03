import { describe, expect, it } from 'vitest'
import {
  auditInputSchema,
  auditProgressSchema,
  auditReportSchema,
} from './contracts'

describe('shared Product Audit contracts', () => {
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
    const report = auditReportSchema.parse({
      auditId: 'audit-live',
      inputUrl: 'https://example.com',
      mode: 'live',
      evaluatedSources: ['url'],
      unavailableSources: ['repository', 'design-system', 'customer-rule'],
      findings: [],
      evidence: [],
    })

    expect(report.mode).toBe('live')
    expect(report.findings).toEqual([])
  })
})
