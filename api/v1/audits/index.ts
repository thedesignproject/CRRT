import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectMembership, requireUser } from '../../_lib/auth.js'
import { auditCreateRequestSchema, auditCreateResponseSchema } from '../../../shared/product-audit/contracts.js'
import { auditBudgets, auditCapabilities } from '../../_lib/audits/config.js'
import { cancelAuditExecution, startAuditExecution } from '../../_lib/audits/execution.js'
import { createAuditRun, markAuditFailed, setAuditWorkflowRunId } from '../../_lib/audits/store.js'
import { createAuditCapability, createOrVerifyAuditSession, hashAuditIp } from '../../_lib/audits/tokens.js'
import { isAuditDemoHostname, UnsafeAuditUrlError, validateAuditUrl } from '../../_lib/audits/url-safety.js'
import { firstHeaderValue, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'

const METHODS = ['POST', 'OPTIONS']

function idempotencyKey(req: VercelRequest) {
  const value = firstHeaderValue(req.headers['idempotency-key'])
  return value && value.length <= 200 ? value : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, METHODS)
  const capabilities = auditCapabilities()
  if (!capabilities.enabled) return jsonError(req, res, 404, 'Product Audit is unavailable')
  const parsed = auditCreateRequestSchema.safeParse(req.body)
  if (!parsed.success) return jsonError(req, res, 400, 'Invalid audit request')
  const key = idempotencyKey(req)
  if (!key) return jsonError(req, res, 400, 'A valid Idempotency-Key is required')

  try {
    const projectKey = parsed.data.projectKey || null
    let creatorUserId: string | null = null
    let session: ReturnType<typeof createOrVerifyAuditSession> | null = null
    let capability: ReturnType<typeof createAuditCapability> | null = null
    let expiresAt: string | null = null
    let ipHash: string | null = null

    if (projectKey) {
      if (!capabilities.authenticatedEnabled) return jsonError(req, res, 403, 'Authenticated audits are unavailable')
      if (typeof req.headers.authorization !== 'string' || !req.headers.authorization.startsWith('Bearer ')) {
        return jsonError(req, res, 401, 'Unauthorized')
      }
      const user = await requireUser(req, res)
      if (!user) return
      if (!(await requireProjectMembership(req, res, user, projectKey))) return
      creatorUserId = user.userId
    } else {
      if (!capabilities.anonymousEnabled) return jsonError(req, res, 403, 'Anonymous audits are unavailable')
      const presented = firstHeaderValue(req.headers['x-audit-session'])
      session = createOrVerifyAuditSession(presented)
      capability = createAuditCapability(`${session.hash}:${key}`)
      const ip = firstHeaderValue(req.headers['x-forwarded-for']) || firstHeaderValue(req.headers['x-real-ip']) || 'unknown'
      ipHash = hashAuditIp(ip)
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString()
    }

    const target = await validateAuditUrl(parsed.data.url)
    const mode = isAuditDemoHostname(target.hostname) ? 'local-fixture' : 'live'
    const result = await createAuditRun({
      ownerKind: projectKey ? 'project' : 'anonymous', projectKey, creatorUserId,
      idempotencyKey: key, capabilityHash: capability?.hash || null, sessionHash: session?.hash || null,
      ipHash, inputUrl: parsed.data.url, normalizedUrl: target.url,
      mode, budgets: auditBudgets(), expiresAt,
    })
    if (result.status === 'rate_limited') {
      if (result.retryAt) res.setHeader('Retry-After', String(Math.max(1, Math.ceil((new Date(result.retryAt).getTime() - Date.now()) / 1_000))))
      return jsonError(req, res, 429, 'Anonymous audit quota exceeded')
    }
    if (!result.auditId || !['created', 'existing'].includes(result.status)) {
      return jsonError(req, res, 400, 'Audit could not be created')
    }
    if (result.status === 'created') {
      let workflowRunId: string | null = null
      try {
        workflowRunId = await startAuditExecution(result.auditId, mode)
        await setAuditWorkflowRunId(result.auditId, workflowRunId)
      } catch {
        if (workflowRunId) {
          try { await cancelAuditExecution(workflowRunId) } catch { /* Best effort; the audit still fails closed. */ }
        }
        await markAuditFailed(result.auditId, 'workflow_start_failed', 'The audit could not be started safely.')
        return jsonError(req, res, 503, 'Audit execution is temporarily unavailable')
      }
    }
    const response = auditCreateResponseSchema.parse({
      auditId: result.auditId, status: result.status === 'existing' ? result.runStatus : 'queued',
      ...(session ? { sessionToken: session.token } : {}),
      ...(capability ? { auditToken: capability.token } : {}),
      ...((result.status === 'existing' ? result.expiresAt : expiresAt) ? { expiresAt: result.status === 'existing' ? result.expiresAt : expiresAt } : {}),
    })
    setCors(req, res, METHODS)
    return res.status(result.status === 'created' ? 202 : 200).json(response)
  } catch (error) {
    if (error instanceof UnsafeAuditUrlError) return jsonError(req, res, 400, `Unsafe audit URL: ${error.code}`)
    return jsonError(req, res, 500, 'Audit creation failed')
  }
}
