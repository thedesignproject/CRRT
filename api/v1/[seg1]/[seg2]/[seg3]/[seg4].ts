import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dispatchV1 } from '../../../../_lib/v1-router.js'
import { getStringQuery } from '../../../../_lib/http.js'

// Self-host patch — see api/_lib/v1-router.ts for why this file exists.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return dispatchV1(req, res, [
    getStringQuery(req.query.seg1),
    getStringQuery(req.query.seg2),
    getStringQuery(req.query.seg3),
    getStringQuery(req.query.seg4),
  ])
}
