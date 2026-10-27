import type { VercelRequest, VercelResponse } from '@vercel/node'
import { nodeMcp } from '../../../server/mcp/http.js'
export default (req: VercelRequest, res: VercelResponse) => nodeMcp(req, res, `/api/mcp/oauth/${req.query.action}`)
