import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../../_lib/auth.js'
import { getJiraAccessToken } from '../../../../_lib/jira-connection.js'
import { buildJiraAuthorizeUrl, createJiraOAuthState, getJiraDestinations } from '../../../../_lib/jira.js'
import {
  deleteProjectIntegration,
  getProjectIntegration,
  getProjectMember,
  updateProjectIntegrationWorkspaceDestination,
} from '../../../../_lib/store.js'
import { firstHeaderValue, getAppUrl, getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'

const METHODS = ['GET', 'PATCH', 'DELETE', 'OPTIONS']

function browserOrigin(req: VercelRequest) {
  const raw = firstHeaderValue(req.headers.origin)
  try { return raw ? new URL(raw).origin : getAppUrl(req) } catch { return getAppUrl(req) }
}

function redirectUri(req: VercelRequest) {
  const configured = process.env.JIRA_REDIRECT_URI?.trim()
  return configured || `${getAppUrl(req)}/v1/integrations/jira/callback`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (!METHODS.includes(req.method ?? '')) return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const projectKey = getStringQuery(req.query.projectId)
  if (!projectKey) return jsonError(req, res, 400, 'Missing projectId')
  try {
    const membership = await getProjectMember(user.userId, projectKey)
    if (membership?.role !== 'admin') return jsonError(req, res, 403, 'Admin role required')

    if (req.method === 'DELETE') {
      await deleteProjectIntegration(projectKey, 'jira')
      setCors(req, res, METHODS)
      return res.status(204).end()
    }

    if (req.method === 'GET' && getStringQuery(req.query.action) === 'authorize') {
      const callback = redirectUri(req)
      const state = createJiraOAuthState({
        projectKey, userId: user.userId, origin: browserOrigin(req), redirectUri: callback,
      })
      setCors(req, res, METHODS)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ authorizeUrl: buildJiraAuthorizeUrl(state, callback) })
    }

    const integration = await getProjectIntegration(projectKey, 'jira')
    if (!integration) {
      setCors(req, res, METHODS)
      return res.status(200).json({ connected: false, provider: 'jira', destinations: [] })
    }
    const token = await getJiraAccessToken(integration)
    const destinations = await getJiraDestinations(token)

    if (req.method === 'PATCH') {
      const destinationId = typeof req.body?.containerId === 'string' ? req.body.containerId : ''
      const destination = destinations.find((candidate) => candidate.id === destinationId)
      if (!destination) return jsonError(req, res, 400, 'invalid_jira_project')
      await updateProjectIntegrationWorkspaceDestination({
        projectKey,
        provider: 'jira',
        workspaceId: destination.cloudId,
        workspaceName: destination.siteName,
        containerId: destination.projectId,
        containerName: `${destination.projectKey} · ${destination.projectName}`,
      })
    }

    const current = await getProjectIntegration(projectKey, 'jira')
    setCors(req, res, METHODS)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      connected: Boolean(current?.containerId),
      provider: 'jira',
      workspace: current?.workspaceName,
      selectedDestinationId: current?.workspaceId && current.containerId
        ? `${current.workspaceId}:${current.containerId}`
        : null,
      destinations: destinations.map((destination) => ({
        id: destination.id,
        name: `${destination.siteName} · ${destination.projectKey} · ${destination.projectName}`,
      })),
    })
  } catch (error) {
    const known = error instanceof Error && ['missing_jira_oauth_credentials', 'jira_reauthorization_required'].includes(error.message)
    if (!known) console.error('Jira project integration failed')
    return jsonError(req, res, known ? 409 : 502, known && error instanceof Error ? error.message : 'Jira integration request failed')
  }
}
