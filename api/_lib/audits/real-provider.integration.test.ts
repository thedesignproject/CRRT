import { describe, expect, it } from 'vitest'
import { SandboxAuditExplorer } from './explorer.js'
import { OpenAiCompatibleAuditModel, runCritic, runVerifier } from './model.js'
import { auditBudgets } from './config.js'
import { validateAuditUrl } from './url-safety.js'

const enabled = process.env.AUDIT_REAL_PROVIDER_TEST === 'true'

describe.skipIf(!enabled)('credential-gated Product Audit providers', () => {
  it('explores an explicit public fixture and schema-validates both model stages', async () => {
    const url = process.env.AUDIT_REAL_PROVIDER_URL
    if (!url) throw new Error('AUDIT_REAL_PROVIDER_URL is required')
    const target = await validateAuditUrl(url)
    const exploration = await new SandboxAuditExplorer().explore(target, auditBudgets())
    const model = new OpenAiCompatibleAuditModel()
    const candidates = await runCritic(model, exploration.evidence)
    const decisions = await runVerifier(model, candidates, exploration.evidence)
    expect(decisions.every((decision) => candidates.some((candidate) => candidate.id === decision.candidateId))).toBe(true)
  }, 180_000)
})
