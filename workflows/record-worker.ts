import { sleep } from 'workflow'
import {
  launchRecordWorker,
  recordWorkerStatus,
  stopRecordWorker,
  type WorkerSession,
} from '../api/_lib/record/worker-sandbox.js'

async function launchStep() {
  'use step'
  return launchRecordWorker()
}
// A retried launch could create an additional VM. Cron and database leases
// recover failures instead; each VM also has a hard 30-minute deadline.
launchStep.maxRetries = 0

async function statusStep(session: WorkerSession) {
  'use step'
  return recordWorkerStatus(session)
}

async function stopStep(session: WorkerSession) {
  'use step'
  await stopRecordWorker(session)
}

export async function recordWorkerWorkflow() {
  'use workflow'
  const session = await launchStep()
  if (!session) return
  try {
    for (let poll = 0; poll < 180; poll++) {
      const exitCode = await statusStep(session)
      if (exitCode !== null) {
        if (exitCode !== 0) throw new Error(`record_worker_failed exit_code=${exitCode}`)
        return
      }
      await sleep(10_000)
    }
    throw new Error('record_worker_timeout')
  } finally {
    await stopStep(session)
  }
}
