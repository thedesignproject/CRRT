import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ExtensionAuthContractError, hashProof, parseExchangeRequest } from '../../../_lib/extension-auth-contracts.js'
import { extensionJsonError, setExtensionCors, setExtensionNoStore } from '../../../_lib/extension-auth-http.js'
import { consumeExtensionAuthHandoff, mintExtensionSession } from '../../../_lib/extension-auth-store.js'

const methods = ['POST', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setExtensionNoStore(res)
  let originExtensionId: string
  try {
    originExtensionId = setExtensionCors(req, res, methods)
  } catch (error) {
    const status = error instanceof ExtensionAuthContractError ? error.status : 500
    return extensionJsonError(res, status, status === 500 ? 'Extension authentication unavailable' : 'Extension origin is not allowed')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return extensionJsonError(res, 405, 'Method not allowed')

  try {
    const input = parseExchangeRequest(req.body)
    if (input.extensionId !== originExtensionId) {
      throw new ExtensionAuthContractError(403, 'Extension origin does not match redirect')
    }
    const userId = await consumeExtensionAuthHandoff({
      codeHash: hashProof(input.code),
      stateHash: hashProof(input.state),
      codeChallenge: input.codeChallenge,
      extensionId: input.extensionId,
      redirectUri: input.redirectUri,
    })
    if (!userId) return extensionJsonError(res, 400, 'Invalid or expired extension sign-in')
    const session = await mintExtensionSession(userId)
    return res.status(200).json(session)
  } catch (error) {
    if (error instanceof ExtensionAuthContractError) return extensionJsonError(res, error.status, error.message)
    return extensionJsonError(res, 500, 'Unable to complete extension sign-in')
  }
}
