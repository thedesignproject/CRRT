import { ownerEndpoint } from '../../../_lib/record/http.js'
import { parse } from '../../../_lib/record/core.js'
import { uuid } from '../../../_lib/record/contracts.js'
import { completeArtifact } from '../../../_lib/record/storage.js'
export default ownerEndpoint({ POST: (actor, req) => completeArtifact(actor, String(req.query.id), parse(uuid, req.body?.artifactId)) })
