import { describe, expect, it } from 'vitest'
import type { AuditCandidate, AuditEvidence } from '../../../shared/product-audit/contracts'
import {
  critiqueEvidence,
  exploreLocalFixture,
  localCleanFixture,
  localDemoFixture,
  runLocalAudit,
  verifyCandidates,
} from './localAudit'

describe('local product audit pipeline', () => {
  it('keeps Explorer limited to observations', () => {
    const evidence = exploreLocalFixture(localDemoFixture)

    expect(evidence).toHaveLength(5)
    expect(evidence[0]).toMatchObject({ source: 'url', location: expect.any(String) })
    expect(evidence[0]).not.toHaveProperty('recommendation')
  })

  it('lets Critic generate candidates from observed patterns', () => {
    const candidates = critiqueEvidence(exploreLocalFixture(localDemoFixture))

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'finding-trial-contradiction',
      'finding-time-to-value',
      'finding-form-reset',
    ])
  })

  it('rejects unsupported, weak, and low-impact candidates instead of padding the report', () => {
    const evidence: AuditEvidence[] = [{
      id: 'indirect-only',
      source: 'heuristic',
      signalKey: 'single-signal',
      location: 'checkout',
      observation: 'A heuristic suggests possible friction.',
      confidence: 0.7,
      direct: false,
    }]
    const baseCandidate: AuditCandidate = {
      id: 'candidate',
      kind: 'problem',
      title: 'Possible friction',
      summary: 'This is not sufficiently supported.',
      impact: 'high',
      confidence: 0.95,
      evidenceIds: ['indirect-only'],
      recommendation: 'Investigate further.',
    }

    expect(verifyCandidates([baseCandidate], evidence)).toEqual([])
    expect(verifyCandidates([{ ...baseCandidate, evidenceIds: ['missing'] }], evidence)).toEqual([])
    expect(verifyCandidates([{ ...baseCandidate, impact: 'medium' }], [{ ...evidence[0], direct: true }])).toEqual([])
    expect(verifyCandidates([{ ...baseCandidate, confidence: 0.89 }], [{ ...evidence[0], direct: true }])).toEqual([])
  })

  it('admits indirect evidence only when two independent signals agree', () => {
    const evidence: AuditEvidence[] = [
      {
        id: 'signal-a', source: 'url', signalKey: 'a', location: '/a',
        observation: 'First observation.', confidence: 0.95, direct: false,
      },
      {
        id: 'signal-b', source: 'heuristic', signalKey: 'b', location: 'rule:b',
        observation: 'Second observation.', confidence: 0.94, direct: false,
      },
    ]
    const candidate: AuditCandidate = {
      id: 'supported', kind: 'opportunity', title: 'Supported opportunity',
      summary: 'Two signals support this.', impact: 'high', confidence: 0.93,
      evidenceIds: ['signal-a', 'signal-b'], recommendation: 'Test it.',
    }

    expect(verifyCandidates([candidate], evidence)[0]?.admittedBy).toBe('independent-signals')
  })

  it('returns zero findings when no candidate clears the bar', () => {
    const report = runLocalAudit(localCleanFixture)

    expect(report.findings).toEqual([])
    expect(report.evaluatedSources).toEqual(['url'])
    expect(report.unavailableSources).toContain('design-system')
  })

  it('returns only high-impact, high-confidence open findings for the demo', () => {
    const report = runLocalAudit()

    expect(report.findings).toHaveLength(3)
    expect(report.findings.every((finding) => (
      finding.impact === 'high' && finding.confidence >= 0.9 && finding.status === 'open'
    ))).toBe(true)
  })
})
