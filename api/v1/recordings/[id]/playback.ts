import { ownerEndpoint } from '../../../_lib/record/http.js'
import { ownerPlayback } from '../../../_lib/record/sharing.js'
export default ownerEndpoint({ GET: (actor, req) => ownerPlayback(actor, String(req.query.id)) })
