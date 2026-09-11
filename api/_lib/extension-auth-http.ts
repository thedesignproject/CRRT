import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ExtensionAuthContractError, extensionIdFromOrigin, requireAllowedExtension } from './extension-auth-contracts.js'
import { firstHeaderValue } from './http.js'

export function setExtensionNoStore(res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

export function setExtensionCors(req: VercelRequest, res: VercelResponse, methods: string[]): string {
  const origin = firstHeaderValue(req.headers.origin)
  const extensionId = extensionIdFromOrigin(origin)
  if (!origin || !extensionId) throw new ExtensionAuthContractError(403, 'Extension origin is not allowed')
  requireAllowedExtension(extensionId)
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', methods.join(', '))
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '600')
  res.setHeader('Vary', 'Origin')
  return extensionId
}

export function extensionJsonError(res: VercelResponse, status: number, error: string) {
  setExtensionNoStore(res)
  return res.status(status).json({ error })
}
