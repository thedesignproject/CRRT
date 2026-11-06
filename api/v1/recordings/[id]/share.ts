import { ownerEndpoint } from '../../../_lib/record/http.js'
import { changeShare, ownerShare } from '../../../_lib/record/sharing.js'
export default ownerEndpoint({
  GET: (actor, req) => ownerShare(actor, String(req.query.id)),
  POST: (actor, req) => changeShare(actor, String(req.query.id), false),
  DELETE: (actor, req) => changeShare(actor, String(req.query.id), true),
})
