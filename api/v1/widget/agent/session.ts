import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eligibleAgentPriceIds, resolveWidgetAgentAccess } from '../../../_lib/billing/agent-entitlement.js'
import { getAppUrl, handleOptions, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { createWidgetAgentShare } from '../../../_lib/store.js'
import { decryptToken, encryptToken, generateAccessToken, generateSlug, hashToken } from '../../../_lib/tokens.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from '../../../_lib/widget-session.js'
import { parseWidgetAgentSessionRequest, sendWidgetAgentError, widgetAgentRequestHash } from '../../../_lib/widget-agent.js'

function databaseFailureCode(message: string) {
  if (message.includes('idempotency_conflict')) return 'idempotency_conflict' as const
  if (message.includes('invalid_selection') || message.includes('share_comments_changed')) return 'invalid_selection' as const
  if (message.includes('seat_limit_reached')) return 'seat_limit_reached' as const
  if (message.includes('upgrade_required')) return 'upgrade_required' as const
  if (message.includes('forbidden')) return 'project_access_denied' as const
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])

  let projectKey: string | undefined
  try {
    const session = await requireWidgetSession(req)
    const input = parseWidgetAgentSessionRequest(req.body, req.headers['idempotency-key'])
    if (!input) return sendWidgetAgentError(req, res, 'invalid_selection')
    projectKey = input.projectKey
    assertWidgetPage(session, input.projectKey, input.pageUrl)

    const access = await resolveWidgetAgentAccess(input.projectKey, session.user_id)
    if (access.state !== 'ready') return sendWidgetAgentError(req, res, access.state)

    const allowedPriceIds = eligibleAgentPriceIds()
    if (allowedPriceIds.length === 0) return sendWidgetAgentError(req, res, 'upgrade_required')

    const generatedToken = generateAccessToken()
    const generatedTokenHash = hashToken(generatedToken)
    const share = await createWidgetAgentShare({
      projectKey: input.projectKey,
      actorUserId: session.user_id,
      pageUrl: input.pageUrl,
      idempotencyKey: input.idempotencyKey,
      requestHash: widgetAgentRequestHash(input),
      allowedPriceIds,
      commentIds: input.commentIds,
      slug: generateSlug(),
      accessTokenHash: generatedTokenHash,
      accessTokenCiphertext: encryptToken(generatedToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })

    const created = share.accessTokenHash === generatedTokenHash
    const token = created ? generatedToken : decryptToken(share.accessTokenCiphertext)
    const tokenUrl = `${getAppUrl(req)}/api/v1/agent/shares/${share.slug}/state?token=${encodeURIComponent(token)}`
    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(created ? 201 : 200).json({
      shareId: share.id,
      slug: share.slug,
      token,
      tokenUrl,
      expiresAt: share.expiresAt,
      commentCount: input.commentIds.length,
    })
  } catch (error) {
    if (error instanceof WidgetSessionError) {
      return sendWidgetAgentError(req, res, error.status === 401 ? 'authentication_required' : 'project_access_denied')
    }
    const code = error instanceof Error ? databaseFailureCode(error.message) : null
    if (code) return sendWidgetAgentError(req, res, code)
    console.error('[widget-agent/session] creation failed', { projectKey, error })
    return sendWidgetAgentError(req, res, 'error')
  }
}
