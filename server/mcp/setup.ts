import { z } from 'zod'
import { getProject, getProjectMember } from '../../api/_lib/store.js'
import { getServiceSupabase } from '../../api/_lib/supabase.js'
import { canProject, effectiveProjectRole } from '../../api/_lib/project-capabilities.js'
import { config, ensure, hasScope, McpError } from './auth.js'
import type { ToolSpec } from './transport.js'

const projectId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(63)
const input = z.object({ projectId: z.string().min(1).max(200) }).strict()
const createInput = z.object({
  projectId: projectId.describe('Stable public key derived from the repository name. Reuse this key for retries; never claim an unrelated project.'),
  name: z.string().trim().min(1).max(80),
  origins: z.array(z.url().refine(raw => { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password }, 'Use HTTP(S) site URLs without credentials.')).min(1).max(20).describe('Actual deployment/local site URLs requested by the user. New projects allow only these hostnames and their subdomains.'),
}).strict()
const output = z.object({
  projectId: z.string(), name: z.string(), allowedOrigins: z.array(z.string()),
  packageName: z.literal('@thedesignproject/crrt'), apiBase: z.string(), skillUrl: z.string(),
  configuration: z.object({ projectId: z.string(), apiBase: z.string() }).strict(),
}).strict()
export const setupTools: ToolSpec[] = [{
  name: 'connection_status', description: 'Verify your existing CRRT connection without logging in again. Returns the current identity and approved scopes; no credentials.',
  input: z.object({}).strict(), output: z.object({ userId: z.string(), scopes: z.array(z.string()) }).strict(),
  async run(_input, actor) { return { userId: actor.user_id, scopes: (actor.scope ?? 'crrt:read').split(' ') } },
}, {
  name: 'get_installation', description: 'Get public widget configuration for an authorized project. Use this after list_projects to install CRRT without asking the user for a project ID or opening the dashboard. Requires project management permission. Follow skillUrl; never deploy without user authorization.',
  input, output,
  async run(raw, actor) {
    const { projectId } = input.parse(raw)
    const member = await getProjectMember(actor.user_id, projectId)
    ensure(member && canProject(effectiveProjectRole(member.role, member.isOwner), 'project:manage'), 403, 'forbidden')
    const project = await getProject(projectId)
    ensure(project, 404, 'project_not_found')
    const { origin } = config()
    return { projectId, name: project.name, allowedOrigins: project.allowedOrigins,
      packageName: '@thedesignproject/crrt', apiBase: `${origin}/api`, skillUrl: `${origin}/agent-skills/setup.md`,
      configuration: { projectId, apiBase: `${origin}/api` } }
  },
}, {
  name: 'create_project', scope: 'crrt:projects',
  description: 'Create a CRRT project only when the user requests installation or creation. First check repo configuration and list_projects; reuse an existing intended project. Retries with the same key/name/origins are safe. A collision never claims or changes another project. Requires the separately approved crrt:projects scope. Returns installation configuration, not credentials.',
  input: createInput, output,
  async run(raw, actor) {
    ensure(hasScope(actor, 'crrt:projects'), 403, 'insufficient_scope')
    const input = createInput.parse(raw)
    const origins = [...new Set(input.origins.map(raw => new URL(raw).hostname.toLowerCase()))].sort()
    const { error } = await getServiceSupabase().rpc('mcp_create_project', {
      p_connection: actor.connection_id, p_actor: actor.user_id, p_project: input.projectId, p_name: input.name, p_origins: origins,
    })
    if (error) {
      const code = ['project_key_unavailable', 'project_configuration_conflict', 'insufficient_scope'].find(code => error.message.includes(code))
      throw new McpError(code ? 409 : 503, code ?? 'project_creation_unavailable')
    }
    return setupTools[1].run({ projectId: input.projectId }, actor)
  },
}]
