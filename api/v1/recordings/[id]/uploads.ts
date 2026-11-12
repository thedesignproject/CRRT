import { ownerEndpoint } from '../../../_lib/record/http.js'
import { authorizeUpload } from '../../../_lib/record/storage.js'
export default ownerEndpoint({ POST: (actor, req) => authorizeUpload(actor, String(req.query.id), req.body) })
