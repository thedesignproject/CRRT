import { rpc } from '../api/_lib/record/core.js'
import { runNext, type Stage } from '../api/_lib/record/processing.js'
import { workerCompletionLog, workerFailureLog } from '../shared/record/worker-completion.js'

if (process.env.CRRT_RECORD_ENABLED !== 'true') throw new Error('Record worker requires CRRT_RECORD_ENABLED=true')

const once = process.argv.includes('--once')
let stopping = false
process.on('SIGTERM', () => { stopping = true })
process.on('SIGINT', () => { stopping = true })
try {
  do {
    await rpc('record_sweep', {})
    let worked = false
    for (const stage of ['metadata', 'transcription', 'alignment', 'cleanup'] as Stage[]) worked = await runNext(stage) || worked
    if (!worked && !once) await Bun.sleep(2000)
  } while (!once && !stopping)
  if (once) {
    // All writes and lease completions above are awaited. Network handles must
    // not keep a completed one-shot process (and the global worker slot) alive.
    console.log(workerCompletionLog(process.getActiveResourcesInfo()))
    process.exit(0)
  }
} catch (error) {
  if (!once) throw error
  console.error(workerFailureLog(error))
  process.exit(1)
}
