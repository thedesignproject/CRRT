import { rpc } from '../api/_lib/record/core.js'
import { runNext, type Stage } from '../api/_lib/record/processing.js'

if (process.env.CRRT_RECORD_ENABLED !== 'true') throw new Error('Record worker requires CRRT_RECORD_ENABLED=true')

const once = process.argv.includes('--once')
let stopping = false
process.on('SIGTERM', () => { stopping = true })
process.on('SIGINT', () => { stopping = true })
do {
  await rpc('record_sweep', {})
  let worked = false
  for (const stage of ['metadata', 'transcription', 'alignment', 'cleanup'] as Stage[]) worked = await runNext(stage) || worked
  if (!worked && !once) await Bun.sleep(2000)
} while (!once && !stopping)
