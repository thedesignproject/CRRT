import { z } from 'zod'

export const auditSourceSchema = z.enum([
  'customer-rule',
  'design-system',
  'repository',
  'url',
  'heuristic',
])

export const auditModeSchema = z.enum(['local-fixture', 'live'])

export const auditRunStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'partial',
  'failed',
  'cancelled',
])

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
  kind: z.string().min(1).optional(),
  route: z.string().min(1).optional(),
  element: z.string().min(1).nullable().optional(),
  provenance: z.record(z.string(), z.unknown()).optional(),
  artifact: z.record(z.string(), z.unknown()).nullable().optional(),
  capture: z.record(z.string(), z.unknown()).optional(),
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
  completedAt: z.iso.datetime({ offset: true }).optional(),
})

export const auditBudgetsSchema = z.object({
  maxRoutes: z.number().int().min(1).max(20),
  maxActions: z.number().int().min(1).max(100),
  wallClockMs: z.number().int().min(1_000).max(900_000),
  modelTokens: z.number().int().min(256).max(100_000),
  maxArtifacts: z.number().int().min(0).max(100),
})

export const auditSourceCoverageSchema = z.object({
  evaluatedSources: z.array(auditSourceSchema),
  unavailableSources: z.array(auditSourceSchema),
  routesAttempted: z.number().int().nonnegative(),
  routesEvaluated: z.number().int().nonnegative(),
  partialReason: z.string().min(1).optional(),
})

export const auditErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
})

export const auditEventTypeSchema = z.enum([
  'audit.queued',
  'audit.stage.started',
  'audit.stage.rate_limited',
  'audit.evidence.captured',
  'audit.stage.completed',
  'audit.coverage.partial',
  'audit.finding.verified',
  'audit.completed',
  'audit.failed',
  'audit.cancelled',
])

export const auditEventSchema = z.object({
  sequence: z.string().regex(/^\d+$/),
  auditId: z.string().uuid(),
  eventType: auditEventTypeSchema,
  actorType: z.enum(['system', 'explorer', 'critic', 'verifier', 'user']),
  stage: auditStageSchema.nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
})

export const auditCreateRequestSchema = z.object({
  url: z.url(),
  projectKey: z.string().min(1).max(120).optional(),
}).strict()

export const auditCreateResponseSchema = z.object({
  auditId: z.string().uuid(),
  status: auditRunStatusSchema,
  sessionToken: z.string().min(1).optional(),
  auditToken: z.string().min(1).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
})

export const auditCapabilitiesSchema = z.object({
  enabled: z.boolean(),
  anonymousEnabled: z.boolean(),
  authenticatedEnabled: z.boolean(),
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

export const auditRunResponseSchema = z.object({
  auditId: z.string().uuid(),
  inputUrl: z.url(),
  mode: auditModeSchema,
  status: auditRunStatusSchema,
  stage: auditStageSchema,
  progress: auditProgressSchema,
  coverage: auditSourceCoverageSchema,
  report: auditReportSchema.nullable(),
  error: auditErrorSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  cancelledAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
})

export const auditEventsResponseSchema = z.object({
  events: z.array(auditEventSchema),
  nextCursor: z.string().regex(/^\d+$/),
})

export type AuditSource = z.infer<typeof auditSourceSchema>
export type AuditMode = z.infer<typeof auditModeSchema>
export type AuditRunStatus = z.infer<typeof auditRunStatusSchema>
export type AuditStage = z.infer<typeof auditStageSchema>
export type AuditInput = z.infer<typeof auditInputSchema>
export type AuditEvidence = z.infer<typeof auditEvidenceSchema>
export type AuditCandidate = z.infer<typeof auditCandidateSchema>
export type AuditFinding = z.infer<typeof auditFindingSchema>
export type AuditReport = z.infer<typeof auditReportSchema>
export type AuditProgress = z.infer<typeof auditProgressSchema>
export type AuditBudgets = z.infer<typeof auditBudgetsSchema>
export type AuditSourceCoverage = z.infer<typeof auditSourceCoverageSchema>
export type AuditError = z.infer<typeof auditErrorSchema>
export type AuditEvent = z.infer<typeof auditEventSchema>
export type AuditCreateRequest = z.infer<typeof auditCreateRequestSchema>
export type AuditCreateResponse = z.infer<typeof auditCreateResponseSchema>
export type AuditCapabilities = z.infer<typeof auditCapabilitiesSchema>
export type AuditRunResponse = z.infer<typeof auditRunResponseSchema>
export type AuditEventsResponse = z.infer<typeof auditEventsResponseSchema>
