import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../../../_lib/auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'
import { getGithubIssueConnection, getProjectIntegration } from '../../../../_lib/store.js'

const METHODS = ['GET', 'OPTIONS']

// Which trackers can take feedback, so the tracker menu can offer "Connect X" before sending.
// Connected means a saved destination, the same check the send flow starts from.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')
  if (!(await requireProjectCapability(req, res, user, projectKey, 'integrations:send'))) return

  try {
    const [github, linear, jira] = await Promise.all([
      getGithubIssueConnection(projectKey),
      getProjectIntegration(projectKey, 'linear'),
      getProjectIntegration(projectKey, 'jira'),
    ])
    setCors(req, res, METHODS)
    return res.status(200).json({
      github: { connected: Boolean(github) },
      linear: { connected: Boolean(linear?.containerId) },
      jira: { connected: Boolean(jira?.containerId) },
    })
  } catch (error) {
    console.error('Integrations request failed', error)
    return jsonError(req, res, 500, 'Unable to load integrations')
  }
}
