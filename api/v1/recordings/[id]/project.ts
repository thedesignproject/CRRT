import { ownerEndpoint } from '../../../_lib/record/http.js'
import { attachRecording } from '../../../_lib/record/lifecycle.js'
export default ownerEndpoint({ POST: (actor, req) => attachRecording(actor, String(req.query.id), req.body) })
