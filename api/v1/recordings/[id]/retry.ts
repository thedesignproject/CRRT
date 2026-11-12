import { ownerEndpoint } from '../../../_lib/record/http.js'
import { retryProcessing } from '../../../_lib/record/processing.js'
export default ownerEndpoint({ POST: (actor, req) => retryProcessing(actor, String(req.query.id), req.body) })
