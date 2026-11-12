import { ownerEndpoint } from '../../../_lib/record/http.js'
import { readRecording, updateRecording } from '../../../_lib/record/lifecycle.js'
import { deleteRecording } from '../../../_lib/record/storage.js'
export default ownerEndpoint({
  GET: (actor, req) => readRecording(actor, String(req.query.id)),
  PATCH: (actor, req) => updateRecording(actor, String(req.query.id), req.body),
  DELETE: (actor, req) => deleteRecording(actor, String(req.query.id)),
})
