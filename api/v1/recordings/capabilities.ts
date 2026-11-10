import { ownerEndpoint } from '../../_lib/record/http.js'
import { recordCapabilities } from '../../_lib/record/agent.js'
export default ownerEndpoint({ GET: actor => recordCapabilities(actor) }, false)
