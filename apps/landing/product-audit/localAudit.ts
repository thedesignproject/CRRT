import {
  auditCandidateSchema,
  auditEvidenceSchema,
  auditReportSchema,
  type AuditCandidate,
  type AuditEvidence,
  type AuditFinding,
  type AuditReport,
} from '../../../shared/product-audit/contracts'

export const LOCAL_AUDIT_URL = 'https://demo.crrt.ai'

type LocalFixture = {
  id: string
  inputUrl: string
  observations: AuditEvidence[]
}

export const localDemoFixture: LocalFixture = {
  id: 'local-demo',
  inputUrl: LOCAL_AUDIT_URL,
  observations: [
    {
      id: 'pricing-promise',
      source: 'url',
      signalKey: 'trial-promise',
      location: '/pricing · hero copy',
      observation: 'The primary plan promises “Start free — no card required.”',
      confidence: 0.99,
      direct: true,
    },
    {
      id: 'signup-card-field',
      source: 'url',
      signalKey: 'signup-payment-gate',
      location: '/signup · step 2 of 2',
      observation: 'The same trial flow requires a valid card before the workspace can be created.',
      confidence: 0.99,
      direct: true,
    },
    {
      id: 'signup-field-count',
      source: 'url',
      signalKey: 'signup-friction',
      location: '/signup · first-use path',
      observation: 'Nine required fields appear before the user sees the product for the first time.',
      confidence: 0.96,
      direct: true,
    },
    {
      id: 'signup-value-delay',
      source: 'url',
      signalKey: 'delayed-value',
      location: '/signup → /onboarding · observed journey',
      observation: 'A user must complete account, company, team, and payment steps before reaching a usable screen.',
      confidence: 0.94,
      direct: false,
    },
    {
      id: 'form-reset',
      source: 'url',
      signalKey: 'destructive-error-state',
      location: '/signup · invalid promo-code interaction',
      observation: 'Submitting an invalid promo code clears the previously entered company and team fields.',
      confidence: 0.97,
      direct: true,
    },
  ],
}

export const localCleanFixture: LocalFixture = {
  id: 'local-clean',
  inputUrl: 'https://clean.demo.crrt.ai',
  observations: [
    {
      id: 'clean-navigation',
      source: 'url',
      signalKey: 'clear-navigation',
      location: '/ · primary navigation',
      observation: 'The primary navigation and call to action remain visible and operable at tested widths.',
      confidence: 0.95,
      direct: true,
    },
  ],
}

export function exploreLocalFixture(fixture: LocalFixture): AuditEvidence[] {
  return fixture.observations.map((observation) => auditEvidenceSchema.parse(observation))
}

export function critiqueEvidence(evidence: AuditEvidence[]): AuditCandidate[] {
  const evidenceIds = new Set(evidence.map((item) => item.id))
  const candidates: AuditCandidate[] = []

  if (evidenceIds.has('pricing-promise') && evidenceIds.has('signup-card-field')) {
    candidates.push({
      id: 'finding-trial-contradiction',
      kind: 'problem',
      title: 'The free-trial promise breaks at signup',
      summary: 'The acquisition page says no card is required, but the signup path blocks workspace creation behind payment details.',
      impact: 'high',
      confidence: 0.99,
      evidenceIds: ['pricing-promise', 'signup-card-field'],
      recommendation: 'Honor the no-card trial or change the promise before users enter the signup funnel.',
    })
  }

  if (evidenceIds.has('signup-field-count') && evidenceIds.has('signup-value-delay')) {
    candidates.push({
      id: 'finding-time-to-value',
      kind: 'problem',
      title: 'Signup delays the first useful moment',
      summary: 'Users face nine required fields and multiple setup steps before they can experience the product.',
      impact: 'high',
      confidence: 0.95,
      evidenceIds: ['signup-field-count', 'signup-value-delay'],
      recommendation: 'Create the workspace after the minimum account fields and defer company, team, and billing setup.',
    })
  }

  if (evidenceIds.has('form-reset')) {
    candidates.push({
      id: 'finding-form-reset',
      kind: 'problem',
      title: 'A recoverable promo error destroys user work',
      summary: 'An invalid promo code clears unrelated fields, forcing users to repeat completed signup work.',
      impact: 'high',
      confidence: 0.97,
      evidenceIds: ['form-reset'],
      recommendation: 'Keep all valid form values intact and attach the error only to the promo-code field.',
    })
  }

  return candidates.map((candidate) => auditCandidateSchema.parse(candidate))
}

export function verifyCandidates(
  candidates: AuditCandidate[],
  evidence: AuditEvidence[],
): AuditFinding[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))

  return candidates
    .map((candidate): AuditFinding | null => {
      const supportingEvidence = candidate.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((item): item is AuditEvidence => Boolean(item))
      const independentSignals = new Set(supportingEvidence.map((item) => item.signalKey)).size
      const hasDirectEvidence = supportingEvidence.some((item) => item.direct)

      if (supportingEvidence.length !== candidate.evidenceIds.length) return null
      if (!hasDirectEvidence && independentSignals < 2) return null
      if (candidate.impact !== 'high' || candidate.confidence < 0.9) return null

      return {
        ...candidate,
        status: 'open',
        admittedBy: hasDirectEvidence ? 'direct-evidence' : 'independent-signals',
        evidence: supportingEvidence,
      }
    })
    .filter((finding): finding is AuditFinding => finding !== null)
    .slice(0, 5)
}

export function runLocalAudit(fixture: LocalFixture = localDemoFixture): AuditReport {
  const evidence = exploreLocalFixture(fixture)
  const candidates = critiqueEvidence(evidence)
  const findings = verifyCandidates(candidates, evidence)

  return auditReportSchema.parse({
    auditId: `audit-${fixture.id}`,
    inputUrl: fixture.inputUrl,
    mode: 'local-fixture',
    evaluatedSources: ['url'],
    unavailableSources: ['customer-rule', 'design-system', 'repository'],
    findings,
    evidence,
  })
}
