import { ownerEndpoint } from '../../_lib/record/http.js'
import { createRecording, listRecordings } from '../../_lib/record/lifecycle.js'
export default ownerEndpoint({
  POST: (actor, req) => createRecording(actor, req.body),
  GET: (actor, req) => listRecordings(actor, req.query),
}, false)
