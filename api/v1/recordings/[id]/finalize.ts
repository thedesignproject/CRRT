import { ownerEndpoint } from '../../../_lib/record/http.js'
import { finalizeRecording } from '../../../_lib/record/storage.js'
export default ownerEndpoint({ POST: (actor, req) => finalizeRecording(actor, String(req.query.id), req.body) })
