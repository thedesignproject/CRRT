import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRepoConfig } from '../../../_lib/store.js'
import {
  assertGitHubRepoAccess,
  createWidgetAuthToken,
  exchangeGitHubCode,
  getGitHubUser,
  verifyWidgetGithubState,
  widgetCallbackHtml,
} from '../../../_lib/widget-github-auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed } from '../../../_lib/http.js'

function html(res: VercelResponse, body: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])

  const code = getStringQuery(req.query.code)
  const state = getStringQuery(req.query.state)
  if (!code || !state) return jsonError(req, res, 400, 'Missing code or state')

  const verifiedState = verifyWidgetGithubState(state)
  if (!verifiedState) return jsonError(req, res, 400, 'Invalid or expired state')

  try {
    const config = await getRepoConfig(verifiedState.projectKey)
    if (!config?.githubOwner || !config.githubRepo) {
      return html(res, widgetCallbackHtml(verifiedState.origin, {
        type: 'crrt:github-auth',
        ok: false,
        error: 'repo_not_configured',
      }))
    }

    const accessToken = await exchangeGitHubCode(code)
    await assertGitHubRepoAccess(accessToken, config.githubOwner, config.githubRepo)
    const user = await getGitHubUser(accessToken)
    const token = createWidgetAuthToken({
      projectKey: verifiedState.projectKey,
      githubUserId: user.id,
      githubLogin: user.login,
      githubOwner: config.githubOwner,
      githubRepo: config.githubRepo,
    })

    return html(res, widgetCallbackHtml(verifiedState.origin, {
      type: 'crrt:github-auth',
      ok: true,
      token,
      githubLogin: user.login,
    }))
  } catch (error) {
    const known = error instanceof Error && [
      'github_code_exchange_failed',
      'github_user_lookup_failed',
      'github_repo_inaccessible',
      'github_repo_lookup_failed',
    ].includes(error.message)
    if (!known) console.error(error)
    return html(res, widgetCallbackHtml(verifiedState.origin, {
      type: 'crrt:github-auth',
      ok: false,
      error: known && error instanceof Error ? error.message : 'github_auth_failed',
    }))
  }
}
