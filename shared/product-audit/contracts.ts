import { z } from 'zod'

export const auditSourceSchema = z.enum([
  'customer-rule',
  'design-system',
  'repository',
  'url',
  'heuristic',
])

export const auditModeSchema = z.enum(['local-fixture', 'live'])

export const auditStageSchema = z.enum([
  'queued',
  'explorer',
  'critic',
  'verifier',
  'completed',
  'failed',
  'cancelled',
])

export const auditInputSchema = z.object({
  url: z.url(),
  repository: z.object({
    url: z.url(),
    ref: z.string().min(1).optional(),
  }).optional(),
  designSystem: z.object({
    url: z.url(),
  }).optional(),
  customerRules: z.array(z.string().min(1)).optional(),
})

export const auditEvidenceSchema = z.object({
  id: z.string().min(1),
  source: auditSourceSchema,
  signalKey: z.string().min(1),
  location: z.string().min(1),
  observation: z.string().min(1),
  confidence: z.number().min(0).max(1),
  direct: z.boolean(),
})

export const auditCandidateSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['problem', 'opportunity']),
  title: z.string().min(1),
  summary: z.string().min(1),
  impact: z.enum(['high', 'medium', 'low']),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  recommendation: z.string().min(1),
})

export const auditFindingSchema = auditCandidateSchema.extend({
  status: z.literal('open'),
  admittedBy: z.enum(['direct-evidence', 'independent-signals']),
  evidence: z.array(auditEvidenceSchema).min(1),
})

export const auditReportSchema = z.object({
  auditId: z.string().min(1),
  inputUrl: z.url(),
  mode: auditModeSchema,
  evaluatedSources: z.array(auditSourceSchema),
  unavailableSources: z.array(auditSourceSchema),
  findings: z.array(auditFindingSchema).max(5),
  evidence: z.array(auditEvidenceSchema),
})

export const auditProgressSchema = z.object({
  auditId: z.string().min(1),
  stage: auditStageSchema,
  completedStages: z.array(auditStageSchema),
  observedEvidenceCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  admittedFindingCount: z.number().int().min(0).max(5),
  error: z.string().min(1).optional(),
})

export type AuditSource = z.infer<typeof auditSourceSchema>
export type AuditMode = z.infer<typeof auditModeSchema>
export type AuditStage = z.infer<typeof auditStageSchema>
export type AuditInput = z.infer<typeof auditInputSchema>
export type AuditEvidence = z.infer<typeof auditEvidenceSchema>
export type AuditCandidate = z.infer<typeof auditCandidateSchema>
export type AuditFinding = z.infer<typeof auditFindingSchema>
export type AuditReport = z.infer<typeof auditReportSchema>
export type AuditProgress = z.infer<typeof auditProgressSchema>

