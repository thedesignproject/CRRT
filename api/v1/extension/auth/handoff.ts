import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import {
  ExtensionAuthContractError,
  chromeCallbackUrl,
  createProof,
  hashProof,
  parseHandoffRequest,
  requireAllowedExtension,
} from '../../../_lib/extension-auth-contracts.js'
import {
  EXTENSION_HANDOFF_TTL_MS,
  cleanupExtensionAuthHandoffs,
  createExtensionAuthHandoff,
} from '../../../_lib/extension-auth-store.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { setExtensionNoStore } from '../../../_lib/extension-auth-http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setExtensionNoStore(res)
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  if (typeof req.headers.authorization !== 'string' || !/^Bearer \S+$/.test(req.headers.authorization)) {
    return jsonError(req, res, 401, 'Unauthorized')
  }
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const input = parseHandoffRequest(req.body)
    requireAllowedExtension(input.extensionId)
    const code = createProof()
    await createExtensionAuthHandoff({
      codeHash: hashProof(code),
      stateHash: hashProof(input.state),
      codeChallenge: input.codeChallenge,
      userId: user.userId,
      extensionId: input.extensionId,
      redirectUri: input.redirectUri,
      expiresAt: new Date(Date.now() + EXTENSION_HANDOFF_TTL_MS),
    })
    try {
      await cleanupExtensionAuthHandoffs()
    } catch {
      // Cleanup is best-effort; a daily authenticated cron performs the same bounded deletion.
    }
    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(201).json({ redirectUrl: chromeCallbackUrl(input.redirectUri, code, input.state) })
  } catch (error) {
    if (error instanceof ExtensionAuthContractError) return jsonError(req, res, error.status, error.message)
    return jsonError(req, res, 500, 'Unable to create extension sign-in')
  }
}
