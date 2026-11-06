import type { Page } from '@playwright/test'
import { populatedAuditReport } from './populated-audit'
import { billing, comments, fixedTime, project } from './data'

export async function installNetwork(page: Page, state = '') {
  const unexpected: string[] = []
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    // Marketing videos use their shipped posters in visual tests. Playback is
    // nondeterministic and does not belong in the DOM/resource upload.
    if (/\.(mp4|webm)$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'video/mp4', body: '' })
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' })
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      // No real APIs, trackers, analytics or remote fonts in visual fixtures.
      if (/\.(mp4|webm)$/.test(url.pathname)) return route.fulfill({ status: 200, body: '' })
      unexpected.push(`External request: ${url.origin}${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const path = url.pathname.slice(4)
    const respond = (json: unknown, status = 200) => route.fulfill({ status, json })
    if (state === 'loading' || state === 'billing-loading' || (state === 'connecting' && path.includes('eligibility'))) {
      await new Promise<void>(resolve => page.once('close', () => resolve()))
      return
    }
    if (state === 'api-error' || state === 'billing-error') return respond({ error: 'Fixture service unavailable' }, 503)
    if (path === '/v1/projects/suggestions' || path.endsWith('/email-domains') || path.endsWith('/access-requests')) return respond([])
    if (path === '/v1/extension/import') return respond({ error: 'Cloud import is temporarily unavailable' }, 503)
    if (state === 'injected-local' && path === '/v1/projects') return respond([])
    if (path === '/v1/projects') return respond(state === 'no-projects' ? [] : state === 'ambiguous' ? [project, { ...project, publicKey: 'second', name: 'Second matching project' }] : [{ ...project, role: state === 'injected-guest' ? 'guest' : 'owner', capabilities: state === 'injected-guest' ? [] : ['feedback:manage', 'integrations:send'] }])
    if (path.includes('/domain-access')) return respond({ domains: [{ domain: 'example.test' }], requests: [] })
    if (path.endsWith('/access')) return respond({ domains: [], requests: [] })
    if (path.endsWith('/members')) return respond([{ userId: 'mock-user-id', email: 'reviewer@example.test', role: state === 'guest' ? 'guest' : 'owner', createdAt: fixedTime }])
    if (path.endsWith('/invites') || path === '/v1/notifications') return respond([])
    if (path.includes('/repo-config')) return respond(url.searchParams.has('view') ? { connected: false, available: true, repo: null } : null)
    if (path.includes('/github/install')) return respond({ installations: [], repositories: [] })
    if (path.includes('/integrations/')) return respond({ connected: false, teams: [], projects: [], sites: [] })
    if (path === '/v1/billing') return respond(url.searchParams.has('availability') ? { enabled: true } : state === 'billing-disabled' ? { enabled: false } : { ...billing, ...(state === 'billing-active' ? { plan: 'pro', lifecycle: 'active', canManageSubscription: true } : {}) })
    if (path === '/v1/admin/me') return respond({ isSuperAdmin: state !== 'guest' })
    if (path === '/v1/extension/comments') return respond({ items: state === 'inbox-empty' ? [] : comments.map(c => ({ ...c, pageUrl: 'https://example.test/pricing', pageHostname: 'example.test', screenshotUrl: null })), total: state === 'inbox-empty' ? 0 : 3, page: 1, limit: 20, totalPages: 1 })
    if (/\/v1\/projects\/[^/]+\/comments$/.test(path)) return respond(comments.map(c => ({ ...c, pageUrl: 'https://example.test/pricing' })))
    if (/\/v1\/projects\/[^/]+$/.test(path)) return respond({ ...project, isPrivate: state === 'private' })
    if (path === '/v1/storybook/connections') return respond({ connections: [] })
    if (path === '/v1/widget/auth/handoff') {
      const body = route.request().postDataJSON()
      return respond(state === 'widget-auth-error' ? { error: 'Could not connect' } : { code: 'c'.repeat(43), state: body.state }, state === 'widget-auth-error' ? 503 : 200)
    }
    if (path === '/v1/extension/auth/handoff') {
      const body = route.request().postDataJSON()
      if (state === 'extension-auth-callback') return respond({ redirectUrl: `${body.redirectUri}?code=${'c'.repeat(43)}&state=${body.state}` })
      return respond({ error: 'Could not connect the extension. Try again.' }, 503)
    }
    if (path === '/v1/widget/agent/eligibility') {
      if (state === 'error') return respond({ error: 'Agent is temporarily unavailable.' }, 503)
      const access = ['upgrade_required', 'owner_upgrade_required', 'seat_limit_reached', 'forbidden', 'project_access_denied'].includes(state) ? state : 'ready'
      return respond({ state: access, role: 'owner', comments: state === 'empty' ? [] : comments.map((comment, index) => ({ ...comment, reviewStatus: index === 0 ? 'open' : 'accepted', implementationStatus: index === 2 ? 'in_progress' : 'unassigned', claimedByAgentId: null, pageUrl: 'https://example.test/pricing' })) })
    }
    if (path === '/v1/widget/agent/session') return state === 'handoff-error' ? respond({ error: 'Could not create the Agent handoff.' }, 503) : respond({ slug: 'visual-share', token: 'visual-token', commentCount: 2 })
    if (path === '/v1/widget/feedback') return respond({ error: 'Could not update feedback. Try again.' }, 503)
    if (state === 'prompt-error' && path.includes('/prompt')) return respond({ error: 'Could not load prompt' }, 503)
    if (path.endsWith('/eligibility')) return respond({ state: state || 'ready', canRequest: false, mustSignUp: true, isProjectMember: false })
    if (state === 'private-login' && path === '/v1/public/comments') return respond({ error: 'Sign in required' }, 401)
    if (path === '/v1/public/comments') return respond(state === 'sidebar-empty' ? [] : comments.map(c => ({ ...c, pageUrl: page.url() })))
    if (path === '/v1/public/project') return respond({ projectKey: project.publicKey, projectName: project.name, doc: { slug: 'visual-share', token: 'visual-token', docUrl: 'https://example.test/review' } })
    if (path.includes('/prompt')) return respond({ prompt: 'Review the accepted feedback and implement the requested change.', slug: 'visual-share' })
    if (path.includes('/state')) return respond({ share: { slug: 'visual-share', scopeType: 'project', revision: 1 }, project: { ...project, repoUrl: null }, comments: [], presence: [] })
    if (path === '/mcp/oauth/connections') return respond({ connections: state === 'mcp-empty' ? [] : [{ id: 'visual-client', scope: 'crrt:review', mcp_clients: { name: 'Codex' } }] })
    if (path === '/mcp/oauth/consent') return respond({ name: 'Codex', redirectUri: 'https://example.test/callback', scope: 'crrt:review' })
    if (path.startsWith('/v1/audits/')) {
      if (path.endsWith('/events')) return respond({ events: state === 'capacity' ? [{ sequence: '1', auditId: '11111111-1111-4111-8111-111111111111', actorType: 'system', eventType: 'audit.stage.rate_limited', stage: 'explorer', payload: { retryAt: fixedTime }, createdAt: fixedTime }] : [], nextCursor: '1' })
      const auditState = state.replace('-findings', '')
      const status = ['completed', 'partial', 'failed', 'cancelled', 'queued'].includes(auditState) ? auditState : 'running'
      return respond({ auditId: '11111111-1111-4111-8111-111111111111', inputUrl: 'https://example.test/', mode: 'live', status, stage: 'explorer', progress: { auditId: '11111111-1111-4111-8111-111111111111', stage: 'explorer', completedStages: [], observedEvidenceCount: 2, candidateCount: 0, admittedFindingCount: 0 }, coverage: { evaluatedSources: ['url'], unavailableSources: ['repository', 'design-system', 'customer-rule'], routesAttempted: 1, routesEvaluated: 1 }, report: state.endsWith('-findings') ? populatedAuditReport : ['completed', 'partial'].includes(status) ? { auditId: '11111111-1111-4111-8111-111111111111', inputUrl: 'https://example.test/', mode: 'live', evaluatedSources: ['url'], unavailableSources: [], findings: [], observations: [], evidence: [] } : null, error: status === 'failed' ? { code: 'target_unavailable', message: 'The target could not be reached.', retryable: false } : null, createdAt: fixedTime, startedAt: fixedTime, completedAt: null, cancelledAt: null, expiresAt: null })
    }
    if (path.includes('/local-import')) return respond({ imported: 1 })
    unexpected.push(`${route.request().method()} ${path}`)
    return respond({ error: `Unmapped visual fixture: ${path}` }, 501)
  })
  return unexpected
}
