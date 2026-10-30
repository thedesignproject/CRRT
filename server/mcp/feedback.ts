import { z } from 'zod'
import { getProjectMember, listProjectComments, listProjectsForUser } from '../../api/_lib/store.js'
import { canProject, effectiveProjectRole } from '../../api/_lib/project-capabilities.js'
import { IMPLEMENTATION_STATUSES } from '../../api/_lib/status.js'
import { hashProof } from '../../api/_lib/extension-auth-contracts.js'
import { ensure, McpError, uuid, type McpIdentity } from './auth.js'
import { safeUrl } from './urls.js'
import type { ToolSpec } from './transport.js'

export const pageInput = { limit: z.number().int().min(1).max(50).default(20).describe('Results per page, 1–50; default 20.'), cursor: z.string().max(2048).optional().describe('Opaque nextCursor returned by the same tool and filters.') }
export const projectInput = z.union([
  z.object({ id: z.string().min(1).max(200) }).strict(),
  z.object({ name: z.string().min(1).max(200) }).strict(),
]).describe('Use the exact project id from list_projects; an exact name is allowed but ambiguous names return choices.')
const projectSchema = z.object({ id: z.string(), name: z.string(), feedbackReadable: z.boolean() }).strict()
export const statuses = { reviewStatus: z.enum(['open', 'accepted', 'rejected']), implementationStatus: z.enum(IMPLEMENTATION_STATUSES) }
const listInput = z.object({ ...pageInput, name: z.string().min(1).max(200).optional().describe('Optional exact project name.') }).strict()
const feedbackInput = z.object({ ...pageInput, project: projectInput, reviewStatus: statuses.reviewStatus.optional(), implementationStatus: statuses.implementationStatus.optional(), readyForAgent: z.boolean().optional().describe('Use true for Ready for Agent: accepted feedback excluding ready_for_testing and done.'), pageUrl: z.url().max(2048).optional().describe('Exact stored page URL; never fetched.') }).strict()
export const summarySchema = z.object({ id: uuid, projectId: z.string(), body: z.string(), bodyTruncated: z.boolean(), pageUrl: z.string().nullable(), authorName: z.string().nullable(), reviewStatus: statuses.reviewStatus, implementationStatus: statuses.implementationStatus, createdAt: z.string(), updatedAt: z.string() }).strict()
export function summarize(item: Awaited<ReturnType<typeof listProjectComments>>[number]) {
  return { id: item.id, projectId: item.projectId, body: item.body.slice(0, 512), bodyTruncated: item.body.length > 512,
    pageUrl: safeUrl(item.pageUrl), authorName: item.authorName, reviewStatus: item.reviewStatus, implementationStatus: item.implementationStatus,
    createdAt: item.createdAt, updatedAt: item.updatedAt }
}
export function encodeCursor(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url') }
function cursor<T>(raw: string | undefined, scope: string, schema: z.ZodType<T>): T | undefined {
  if (!raw) return undefined
  try {
    const parsed = z.object({ scope: z.literal(scope), position: schema }).strict().parse(JSON.parse(Buffer.from(raw, 'base64url').toString()))
    return parsed.position
  } catch { throw new McpError(400, 'invalid_cursor') }
}
export async function access(actor: McpIdentity, projectId: string) {
  const membership = await getProjectMember(actor.user_id, projectId)
  ensure(membership, 403, 'forbidden')
  const role = effectiveProjectRole(membership.role, membership.isOwner)
  ensure(canProject(role, 'feedback:read') && membership.feedbackAllowed !== false, 403, 'forbidden')
  return role
}
export async function resolveProject(actor: McpIdentity, project: z.infer<typeof projectInput>) {
  if ('id' in project) return { id: project.id, role: await access(actor, project.id) }
  const choices = await listProjectsForUser(actor.user_id, { name: project.name, limit: 51 })
  ensure(choices.length, 403, 'forbidden')
  if (choices.length > 1) throw new McpError(409, `ambiguous_project: ${JSON.stringify(choices.slice(0, 50).map(p => ({ id: p.publicKey, name: p.name })))}`)
  return { id: choices[0].publicKey, role: await access(actor, choices[0].publicKey) }
}
export const discoveryTools: ToolSpec[] = [{
  name: 'list_projects',
  description: 'Use when choosing a CRRT project. Lists only your memberships, with stable IDs and feedback-read capability. Exact duplicate names remain separate choices. Paginate using nextCursor; maximum 50 results.',
  input: listInput,
  output: z.object({ contractVersion: z.literal('1'), projects: z.array(projectSchema), nextCursor: z.string().nullable() }).strict(),
  async run(raw, actor) {
    const input = listInput.parse(raw)
    const scope = hashProof(JSON.stringify([actor.user_id, 'projects', input.name]))
    const after = cursor(input.cursor, scope, z.string().min(1).max(200))
    const rows = (await listProjectsForUser(actor.user_id, { after, name: input.name, limit: input.limit + 1 })).sort((a, b) => a.publicKey < b.publicKey ? -1 : 1)
    const items = rows.slice(0, input.limit)
    return { contractVersion: '1', projects: items.map(p => ({ id: p.publicKey, name: p.name, feedbackReadable: p.capabilities.includes('feedback:read') })), nextCursor: rows.length > input.limit ? encodeCursor({ scope, position: items[items.length - 1].publicKey }) : null }
  },
}, {
  name: 'list_feedback',
  description: 'Use when reviewing feedback for one authorized project. Filter by review/implementation status and exact page URL. Use readyForAgent:true for Ready for Agent; accepted alone also includes testing and completed work. Returns short summaries; inspect details with get_feedback. Ambiguous project names return choices. Maximum 50 results.',
  input: feedbackInput,
  output: z.object({ contractVersion: z.literal('1'), projectId: z.string(), feedback: z.array(summarySchema), nextCursor: z.string().nullable() }).strict(),
  async run(raw, actor) {
    const input = feedbackInput.parse(raw)
    ensure(!input.readyForAgent || ((!input.reviewStatus || input.reviewStatus === 'accepted') && !['ready_for_testing', 'done'].includes(input.implementationStatus ?? '')), 400, 'conflicting_filters')
    const { id, role } = await resolveProject(actor, input.project)
    const scope = hashProof(JSON.stringify([actor.user_id, id, input.reviewStatus, input.implementationStatus, input.pageUrl, input.readyForAgent]))
    const position = cursor(input.cursor, scope, z.object({ createdAt: z.iso.datetime({ offset: true }), id: uuid }).strict())
    const rows = await listProjectComments(id, { actorUserId: actor.user_id, readyForAgent: input.readyForAgent, reviewStatus: input.readyForAgent ? 'accepted' : input.reviewStatus, implementationStatus: input.implementationStatus, pageUrl: input.pageUrl, visibility: role === 'guest' ? 'shared' : undefined, includeExternalWork: false, limit: input.limit + 1, cursor: position })
    const items = rows.slice(0, input.limit), last = items[items.length - 1]
    return { contractVersion: '1', projectId: id, feedback: items.map(summarize), nextCursor: rows.length > input.limit ? encodeCursor({ scope, position: { createdAt: last.createdAt, id: last.id } }) : null }
  },
}]
