import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../../../_lib/auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'
import { resolveWidgetAgentAccess } from '../../../../_lib/billing/agent-entitlement.js'
import { sendWidgetAgentError } from '../../../../_lib/widget-agent.js'
import { DispatchError, deliveryState, dispatchRpc, sendInput } from '../../../../_lib/agent-dispatch.js'

const METHODS = ['GET', 'POST', 'OPTIONS']
// Direct send from the dashboard: who is listening, what was sent, and send one comment.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')
  // The Agent panel's rule: members who may operate agents, on a plan that includes Agent.
  if (!(await requireProjectCapability(req, res, user, projectKey, 'agent:operate'))) return
  setCors(req, res, METHODS)
  res.setHeader('Cache-Control', 'no-store')
  try {
    const access = await resolveWidgetAgentAccess(projectKey, user.userId)
    if (access.state !== 'ready') return sendWidgetAgentError(req, res, access.state)
    if (req.method === 'GET') return res.status(200).json(await deliveryState(projectKey, user.userId))
    const input = sendInput.safeParse(req.body)
    if (!input.success) return res.status(400).json({ error: 'Invalid send request', code: 'invalid_request' })
    const { listenerId, commentId, expectedUpdatedAt, idempotencyKey } = input.data
    return res.status(200).json(await dispatchRpc('agent_dispatch_send', { p_actor: user.userId, p_project: projectKey, p_listener: listenerId,
      p_comment: commentId, p_expected: expectedUpdatedAt, p_key: idempotencyKey }))
  } catch (error) {
    if (error instanceof DispatchError) return res.status(error.status).json({ error: error.code, code: error.code })
    console.error('Direct send request failed', error)
    return res.status(503).json({ error: 'dispatch_unavailable', code: 'dispatch_unavailable' })
  }
}
