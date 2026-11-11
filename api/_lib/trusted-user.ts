import type { VercelRequest } from '@vercel/node'
import type { AuthenticatedUser } from './auth.js'

// Object identity is the boundary: HTTP headers/body cannot manufacture this
// context. Only an already authenticated internal adapter registers a request.
type TrustedUser = AuthenticatedUser & { mcpConnectionId?: string }
const users = new WeakMap<VercelRequest, TrustedUser>()

export function trustedUser(req: VercelRequest) {
  return users.get(req)
}

export async function withTrustedUser<T>(req: VercelRequest, user: TrustedUser, run: () => Promise<T>): Promise<T> {
  users.set(req, user)
  try { return await run() }
  finally { users.delete(req) }
}
