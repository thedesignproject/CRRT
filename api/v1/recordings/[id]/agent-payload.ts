import { ownerEndpoint } from '../../../_lib/record/http.js'
import { agentPayload } from '../../../_lib/record/agent.js'
export default ownerEndpoint({ POST: (actor, req) => agentPayload(actor, String(req.query.id), req.body) })
