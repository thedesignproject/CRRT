import { start } from 'workflow/api'
import { RECORD_WORKER_WORKFLOW_ID } from '../../../workflows/record-worker-id.js'
import { allPages, checked, database, rpc } from './core.js'

type WaitingJob = {
  stage: string
  recordings: { owner_id: string | null; deleted_at: string | null; recording_jobs: { stage: string; state: string }[] }
}

// The database remains the queue. Expired leases are recoverable after a
// sandbox timeout, and an empty queue never creates a paid compute session.
export async function dispatchRecordWorker() {
  await rpc('record_sweep', {})
  const now = new Date().toISOString()
  const running = checked(await database().from('recording_jobs').select('recording_id')
    .eq('state', 'running').gt('lease_until', now).limit(1))
  if (!running) throw new Error('record_worker_queue_unavailable')
  if (running.length) return false
  const waiting = await allPages<WaitingJob>((from, to) => database().from('recording_jobs')
    .select('stage,recordings!inner(owner_id,deleted_at,recording_jobs(stage,state))')
    .in('state', ['pending', 'running']).lte('available_at', now)
    .order('recording_id').order('stage').range(from, to) as unknown as PromiseLike<{ data: WaitingJob[] | null; error: { message: string } | null }>)
  // Mirror record_claim's prerequisites. A permanently failed dependency or
  // deleted source recording must not create an idle VM every minute.
  const eligible = waiting.some(job => job.stage === 'cleanup' || (
    job.recordings.owner_id !== null && job.recordings.deleted_at === null &&
    (job.stage !== 'alignment' || job.recordings.recording_jobs
      .filter(dependency => ['metadata', 'transcription'].includes(dependency.stage))
      .every(dependency => dependency.state === 'done'))
  ))
  if (!eligible) return false
  await start({ workflowId: RECORD_WORKER_WORKFLOW_ID }, [])
  return true
}
