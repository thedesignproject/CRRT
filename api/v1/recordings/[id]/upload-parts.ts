import { ownerEndpoint } from '../../../_lib/record/http.js'
import { authorizePart } from '../../../_lib/record/multipart.js'
export default ownerEndpoint({ POST: (actor, req) => authorizePart(actor, String(req.query.id), req.body) })
