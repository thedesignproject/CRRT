import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  assertGitHubUserInstallationAccess,
  createGitHubAppInstallationToken,
  listUserInstallationRepositories,
  verifyGitHubAppReuseAuthState,
  verifyGitHubAppSetupAuthState,
} from '../../../_lib/github-app.js'
import {
  deleteGitHubUserInstallation,
  getGithubConnectionVersion,
  getGitHubUserInstallation,
  getProjectMember,
  getRepoConfig,
  upsertGitHubUserInstallation,
} from '../../../_lib/store.js'
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
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  return res.status(200).send(body)
}

async function handleGitHubAppSetupCallback(res: VercelResponse, code: string, state: string) {
  const setupState = verifyGitHubAppSetupAuthState(state)
  const reuseState = setupState ? null : verifyGitHubAppReuseAuthState(state)
  const verifiedState = setupState ?? reuseState
  if (!verifiedState) return false

  try {
    const membership = await getProjectMember(verifiedState.userId, verifiedState.projectKey)
    if (membership?.role !== 'admin') throw new Error('github_app_install_forbidden')

    const existing = reuseState
      ? await getGitHubUserInstallation(reuseState.userId, reuseState.installationRef)
      : null
    const installationId = setupState?.installationId ?? existing?.installationId
    if (!installationId) throw new Error('github_installation_inaccessible')

    const accessToken = await exchangeGitHubCode(code)
    const account = await assertGitHubUserInstallationAccess(accessToken, installationId)
    await upsertGitHubUserInstallation({
      userId: verifiedState.userId,
      installationId,
      githubAccountId: account.id,
      githubAccountLogin: account.login,
      githubAccountType: account.type,
    })
    const repositories = await listUserInstallationRepositories(accessToken, installationId)
    const expectedConnectionVersion = await getGithubConnectionVersion(verifiedState.projectKey)
    const installationToken = createGitHubAppInstallationToken({
      projectKey: verifiedState.projectKey,
      userId: verifiedState.userId,
      installationId,
      expectedConnectionVersion,
    })

    html(res, widgetCallbackHtml(verifiedState.origin, {
      type: 'crrt:github-app-install',
      ok: true,
      projectKey: verifiedState.projectKey,
      installationToken,
      repositories,
      githubAccountLogin: account.login,
      githubAccountType: account.type,
    }))
    return true
  } catch (error) {
    if (
      reuseState
      && error instanceof Error
      && error.message === 'github_installation_inaccessible'
    ) {
      try {
        await deleteGitHubUserInstallation(reuseState.userId, reuseState.installationRef)
      } catch {
        console.error('GitHub installation cleanup failed')
      }
    }
    const known = error instanceof Error && [
      'github_code_exchange_failed',
      'github_user_installations_failed',
      'github_installation_inaccessible',
      'github_installation_repos_failed',
      'github_app_install_forbidden',
    ].includes(error.message)
    if (!known) console.error('GitHub App callback failed')
    html(res, widgetCallbackHtml(verifiedState.origin, {
      type: 'crrt:github-app-install',
      ok: false,
      error: 'github_app_install_failed',
    }))
    return true
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])

  const code = getStringQuery(req.query.code)
  const state = getStringQuery(req.query.state)
  if (!code || !state) return jsonError(req, res, 400, 'Missing code or state')

  if (await handleGitHubAppSetupCallback(res, code, state)) return

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
    if (!known) console.error('GitHub OAuth callback failed')
    return html(res, widgetCallbackHtml(verifiedState.origin, {
      type: 'crrt:github-auth',
      ok: false,
      error: known && error instanceof Error ? error.message : 'github_auth_failed',
    }))
  }
}
