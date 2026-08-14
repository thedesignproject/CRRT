import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dispatchV1 } from '../../../_lib/v1-router.js'

// Self-host patch — see api/_lib/v1-router.ts for why this file exists.
export default function handler(req: VercelRequest, res: VercelResponse) {
  return dispatchV1(req, res, 3)
}
