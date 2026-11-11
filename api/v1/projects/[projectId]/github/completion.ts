import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../../../_lib/auth.js'
import { trustedUser } from '../../../../_lib/trusted-user.js'
import { readMcpGithubFlow } from '../../../../_lib/mcp-github-flow.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed } from '../../../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return
  const project = getStringQuery(req.query.projectId), flowId = getStringQuery(req.query.flowId)
  if (!project || !flowId) return jsonError(req, res, 400, 'Missing projectId or flowId')
  const connectionId = trustedUser(req)?.mcpConnectionId
  if (!connectionId) return jsonError(req, res, 403, 'Use your connected MCP client')
  if (!await requireProjectCapability(req, res, user, project, 'project:manage')) return
  try {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(await readMcpGithubFlow({ connectionId, requestKey: flowId }, user.userId, project))
  } catch { return jsonError(req, res, 409, 'GitHub verification expired or is unavailable. Request a new installation flow.') }
}
