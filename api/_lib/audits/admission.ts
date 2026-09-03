import {
  auditFindingSchema,
  type AuditCandidate,
  type AuditEvidence,
  type AuditFinding,
} from '../../../shared/product-audit/contracts.js'

export type VerificationDecision = {
  candidateId: string
  admitted: boolean
  contradictions: string[]
}

const minimumFindingConfidence = 0.8

function fingerprint(candidate: AuditCandidate) {
  return candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function admitAuditFindings(
  candidates: AuditCandidate[],
  evidence: AuditEvidence[],
  decisions: VerificationDecision[],
): AuditFinding[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  const duplicateDecisionIds = new Set<string>()
  const decisionsById = new Map<string, VerificationDecision>()
  for (const decision of decisions) {
    if (decisionsById.has(decision.candidateId)) duplicateDecisionIds.add(decision.candidateId)
    else decisionsById.set(decision.candidateId, decision)
  }
  const seen = new Set<string>()
  const findings: AuditFinding[] = []

  for (const candidate of candidates) {
    const decision = decisionsById.get(candidate.id)
    if (duplicateDecisionIds.has(candidate.id)) continue
    if (!decision?.admitted || decision.contradictions.length) continue
    if (candidate.impact === 'low' || candidate.confidence < minimumFindingConfidence) continue
    const support = candidate.evidenceIds
      .map((id) => evidenceById.get(id))
      .filter((item): item is AuditEvidence => Boolean(item))
    if (support.length !== candidate.evidenceIds.length) continue
    const direct = support.some((item) => item.direct && item.source !== 'heuristic')
    const independentSignals = new Set(support.map((item) => item.signalKey)).size
    if (!direct && independentSignals < 2) continue
    const key = fingerprint(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    findings.push(auditFindingSchema.parse({
      ...candidate,
      status: 'open',
      admittedBy: direct ? 'direct-evidence' : 'independent-signals',
      evidence: support,
    }))
    if (findings.length === 5) break
  }
  return findings
}
