import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Sandbox } from '@vercel/sandbox'
import { WORKER_COMPLETION_CONTENT, WORKER_COMPLETION_FILE } from '../../../shared/record/worker-completion.js'

export type WorkerSession = { name: string; commandId: string }

// Forward only the worker's configuration, never the full deployment env or
// the Vercel OIDC token. Secrets stay inside the step and are not workflow args.
const workerKeys = [
  'CRRT_RECORD_ENABLED', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'RECORD_STORAGE_PROVIDER', 'RECORD_R2_ACCOUNT_ID', 'RECORD_R2_BUCKET',
  'RECORD_R2_ACCESS_KEY_ID', 'RECORD_R2_SECRET_ACCESS_KEY', 'RECORD_MAX_STORAGE_BYTES',
  'RECORD_TRANSCRIPTION_ENABLED', 'RECORD_TRANSCRIPTION_POLICY_VERSION',
  'RECORD_TRANSCRIPTION_CLIENT_REQUESTS_PER_HOUR', 'RECORD_TRANSCRIPTION_CLIENT_BYTES_PER_HOUR',
  'RECORD_TRANSCRIPTION_GLOBAL_REQUESTS_PER_DAY', 'RECORD_TRANSCRIPTION_GLOBAL_BYTES_PER_DAY',
  'SHARE_TOKEN_SECRET', 'DEEPGRAM_API_KEY',
]

export async function launchRecordWorker(): Promise<WorkerSession | null> {
  const project = process.env.VERCEL_PROJECT_ID
  const environment = process.env.VERCEL_ENV
  if (!project || !environment) throw new Error('record_worker_environment_missing')
  const scope = createHash('sha256').update(`${project}:${environment}`).digest('hex').slice(0, 16)
  const prefix = `crrt-record-${scope}-`
  // Include bootstrapping VMs, before they have claimed a database lease.
  // A shared minute name also prevents overlapping cron deliveries from
  // starting two sessions in the same environment at the same time.
  // Prefix filtering requires name sorting. Our minute-based names keep this
  // newest-first, so the hard-deadline cutoff below still bounds pagination.
  const sessions = await Sandbox.list({ namePrefix: prefix, sortBy: 'name', sortOrder: 'desc' })
  for await (const session of sessions) {
    // Older sessions cannot still be active under our hard 30-minute timeout.
    if (session.createdAt < Date.now() - 31 * 60_000) break
    if (['pending', 'running', 'stopping'].includes(session.status)) return null
  }
  const content = await readFile(join(process.cwd(), 'record-worker.mjs'))
  const env: Record<string, string> = {}
  for (const key of workerKeys) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.CRRT_RECORD_WORKER_COMPLETION_FILE = WORKER_COMPLETION_FILE
  const sandbox = await Sandbox.create({
    name: `${prefix}${Math.floor(Date.now() / 60_000)}`,
    image: 'vercel/sandbox/node:22', persistent: false,
    resources: { vcpus: 1 }, timeout: 30 * 60_000,
  })
  try {
    await sandbox.writeFiles([{ path: 'record-worker.mjs', content }])
    // Detached setup keeps package installation and FFmpeg work out of the
    // 60-second Function. The VM's hard deadline also bounds orphaned sessions.
    const command = await sandbox.runCommand({
      cmd: 'bash', args: ['-c', 'sudo apt-get update -qq && sudo apt-get install -y --no-install-recommends ffmpeg >/dev/null && exec node record-worker.mjs --once'],
      detached: true, env,
    })
    return { name: sandbox.name, commandId: command.cmdId }
  } catch (error) {
    await sandbox.stop()
    throw error
  }
}

// Sandbox methods resume a stopped sandbox and retry. Inspect and stop only
// the session that exists now, so status checks never start another VM, even
// if the worker VM reaches its deadline between these calls.
async function currentWorkerVm(session: WorkerSession) {
  return (await Sandbox.get({ name: session.name, resume: false })).currentSession()
}
const liveStatuses = ['pending', 'running']

export async function recordWorkerStatus(session: WorkerSession) {
  const vm = await currentWorkerVm(session)
  if (!liveStatuses.includes(vm.status)) throw new Error(`record_worker_sandbox_${vm.status}`)
  const command = await vm.getCommand(session.commandId)
  if (command.exitCode !== null) return command.exitCode
  const completion = await vm.readFileToBuffer({ path: WORKER_COMPLETION_FILE })
  if (completion === null) return null
  if (completion.toString('utf8') !== WORKER_COMPLETION_CONTENT) throw new Error('record_worker_completion_invalid')
  // The worker exits right after publishing the marker, so one observation can
  // be that brief gap. Repeated warnings point to a lingering process or stale status.
  console.warn('record_worker_completed_before_exit_status')
  return 0
}

export async function stopRecordWorker(session: WorkerSession) {
  const vm = await currentWorkerVm(session)
  if (liveStatuses.includes(vm.status)) await vm.stop()
}
