import { z } from 'zod'

export const contractVersion = 'record.v1' as const
export const uuid = z.uuid().transform(value => value.toLowerCase())
export const clock = z.number().int().min(0).max(3_600_000)
const title = z.string().trim().min(1).max(240)
export const consentSchema = z.object({
  policyVersion: z.literal('record-v1'),
  hostedTranscription: z.boolean(),
  provider: z.literal('deepgram'),
  language: z.enum(['multi', 'en', 'es']),
}).strict()
export const createSchema = z.object({
  clientKey: uuid, title, source: z.enum(['tab', 'window', 'screen']),
  consent: consentSchema,
}).strict()
export const titleSchema = z.object({ title }).strict()
export const projectSchema = z.object({ projectKey: z.string().trim().min(1).max(120).nullable() }).strict()
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict()
const bounds = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict()
const dimensions = z.object({ width: z.number().int().positive().max(16384), height: z.number().int().positive().max(16384) }).strict()
const pageUrl = z.url().max(4000).transform((value, ctx) => {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') { ctx.addIssue({ code: 'custom', message: 'Page URL must use HTTP(S)' }); return z.NEVER }
  const router = url.hash.startsWith('#!/') ? '#!' : url.hash.startsWith('#/') ? '#' : ''
  const routePath = router ? url.hash.slice(router.length).split(/[?#]/, 1)[0] : ''
  url.username = ''; url.password = ''; url.search = ''; url.hash = router ? `${router.slice(1)}${routePath}` : ''
  return url.href
})
export const eventSchema = z.object({
  id: uuid, sequence: z.number().int().min(0).max(10000), atMs: clock,
  kind: z.enum(['mark', 'click', 'route']),
  mark: z.object({ type: z.enum(['draw', 'arrow', 'box', 'text', 'pin']), points: z.array(point).max(2048), text: z.string().max(2000).optional(), pinNumber: z.number().int().positive().optional() }).strict().optional(),
  target: z.object({ selector: z.string().max(2000).optional(), pageUrl: pageUrl.optional(), tagName: z.string().max(100).optional(), component: z.string().max(240).optional(), bounds: bounds.optional() }).strict().optional(),
  viewport: dimensions.optional(), capture: dimensions.optional(),
  scroll: z.object({ x: z.number().finite().min(0), y: z.number().finite().min(0) }).strict().optional(),
  point: point.optional(), crop: bounds.optional(),
}).strict().superRefine((event, ctx) => {
  if ((event.kind === 'mark') !== Boolean(event.mark)) ctx.addIssue({ code: 'custom', message: 'Only mark events contain a mark' })
  if (event.crop && (event.crop.x + event.crop.width > 1 || event.crop.y + event.crop.height > 1)) ctx.addIssue({ code: 'custom', message: 'Crop exceeds capture bounds' })
})
export const artifactSchema = z.object({
  id: uuid, kind: z.enum(['screen', 'camera', 'audio']),
  mime: z.enum(['video/webm', 'audio/webm']), bytes: z.number().int().positive().max(1_073_741_824),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), offsetMs: clock,
}).strict().superRefine((a, ctx) => {
  if ((a.kind === 'audio') !== (a.mime === 'audio/webm')) ctx.addIssue({ code: 'custom', message: 'Artifact media type does not match kind' })
  if (a.kind === 'screen' && a.offsetMs !== 0) ctx.addIssue({ code: 'custom', message: 'Screen is the timeline origin' })
})
export const manifestSchema = z.object({
  version: z.literal(contractVersion), durationMs: clock.min(1),
  artifacts: z.array(artifactSchema).min(1).max(32),
  events: z.array(eventSchema).max(500),
}).strict().superRefine((m, ctx) => {
  const unique = new Set(m.artifacts.map(a => a.kind))
  if (!unique.has('screen') || unique.size !== m.artifacts.length) ctx.addIssue({ code: 'custom', message: 'Exactly one artifact per kind and a screen artifact are required' })
  if (m.artifacts.some(a => a.offsetMs >= m.durationMs)) ctx.addIssue({ code: 'custom', message: 'Artifact offset exceeds recording' })
  const ids = new Set(m.events.map(e => e.id))
  if (ids.size !== m.events.length || m.events.some((e, i) => e.sequence !== i || e.atMs > m.durationMs || (i > 0 && e.atMs < m.events[i - 1].atMs))) ctx.addIssue({ code: 'custom', message: 'Events must have unique IDs and ordered contiguous sequence/timestamps' })
})
export const retrySchema = z.object({ stage: z.enum(['metadata', 'transcription', 'alignment']) }).strict()
export const payloadSchema = z.object({ requestKey: uuid }).strict()
export type CaptureEvent = z.infer<typeof eventSchema>
export type ArtifactDeclaration = z.infer<typeof artifactSchema>
export type Manifest = z.infer<typeof manifestSchema>
export type RecordingState = 'recording' | 'uploading' | 'processing' | 'ready' | 'failed'
export type Failure = { code: string; stage: string; retryable: boolean }
