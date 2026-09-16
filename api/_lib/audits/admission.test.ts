import { describe, expect, it } from 'vitest'
import type { AuditCandidate, AuditEvidence } from '../../../shared/product-audit/contracts.js'
import { admitAuditFindings } from './admission.js'

const evidence: AuditEvidence[] = [
  { id: 'direct', source: 'url', signalKey: 'a', location: '/', observation: 'Observed', confidence: 1, direct: true },
  { id: 'signal-a', source: 'heuristic', signalKey: 'a', location: '/', observation: 'Signal A', confidence: .95, direct: false },
  { id: 'signal-b', source: 'url', signalKey: 'b', location: '/', observation: 'Signal B', confidence: .95, direct: false },
  { id: 'repo', source: 'repository', signalKey: 'r', location: 'file', observation: 'Repo', confidence: 1, direct: true },
  { id: 'heuristic-direct', source: 'heuristic', signalKey: 'h', location: '/', observation: 'Subjective', confidence: 1, direct: true },
]

const candidate = (patch: Partial<AuditCandidate> = {}): AuditCandidate => ({
  id: 'candidate', kind: 'problem', title: 'A real problem', summary: 'Summary', impact: 'high', confidence: .95,
  evidenceIds: ['direct'], recommendation: 'Fix it', ...patch,
})

describe('deterministic finding admission', () => {
  it('admits direct evidence and two independent signals with provenance', () => {
    const decisions = [{ candidateId: 'candidate', admitted: true, contradictions: [] }]
    expect(admitAuditFindings([candidate()], evidence, decisions)[0]).toMatchObject({ status: 'open', admittedBy: 'direct-evidence' })
    expect(admitAuditFindings([candidate({ confidence: .8 })], evidence, decisions)).toHaveLength(1)
    expect(admitAuditFindings([candidate({ impact: 'medium' })], evidence, decisions)).toHaveLength(1)
    expect(admitAuditFindings([candidate({ evidenceIds: ['signal-a', 'signal-b'] })], evidence, decisions)[0]).toMatchObject({ admittedBy: 'independent-signals' })
    expect(admitAuditFindings([candidate({ evidenceIds: ['repo'] })], evidence, decisions)[0]).toMatchObject({ admittedBy: 'direct-evidence' })
  })

  it.each([
    ['verifier rejection', candidate(), { candidateId: 'candidate', admitted: false, contradictions: [] }],
    ['contradiction', candidate(), { candidateId: 'candidate', admitted: true, contradictions: ['counterexample'] }],
    ['low impact', candidate({ impact: 'low' }), { candidateId: 'candidate', admitted: true, contradictions: [] }],
    ['weak confidence', candidate({ confidence: .799 }), { candidateId: 'candidate', admitted: true, contradictions: [] }],
    ['missing evidence', candidate({ evidenceIds: ['missing'] }), { candidateId: 'candidate', admitted: true, contradictions: [] }],
    ['direct heuristic', candidate({ evidenceIds: ['heuristic-direct'] }), { candidateId: 'candidate', admitted: true, contradictions: [] }],
    ['one weak signal', candidate({ evidenceIds: ['signal-a'] }), { candidateId: 'candidate', admitted: true, contradictions: [] }],
  ])('rejects %s', (_name, input, decision) => {
    expect(admitAuditFindings([input], evidence, [decision])).toEqual([])
  })

  it('deduplicates normalized titles, ignores missing decisions, and caps findings at five', () => {
    const candidates = Array.from({ length: 8 }, (_, index) => candidate({ id: `c${index}`, title: index < 2 ? 'Same problem!' : `Problem ${index}` }))
    const decisions = candidates.map((item) => ({ candidateId: item.id, admitted: true, contradictions: [] }))
    const findings = admitAuditFindings(candidates, evidence, decisions)
    expect(findings).toHaveLength(5)
    expect(findings.filter((item) => item.title.toLowerCase().startsWith('same'))).toHaveLength(1)
    expect(admitAuditFindings([candidate()], evidence, [
      { candidateId: 'candidate', admitted: false, contradictions: ['counterexample'] },
      { candidateId: 'candidate', admitted: true, contradictions: [] },
    ])).toEqual([])
  })
})
