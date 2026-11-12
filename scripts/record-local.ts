import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const action = process.argv[2] || 'integration'
const allowed = ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'SHARE_TOKEN_SECRET']
const local: Record<string, string> = {}
for (const line of (await Bun.file(`${root}.env.docker.local`).text()).split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (match && allowed.includes(match[1])) local[match[1]] = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2]
}
const database = new URL(local.DATABASE_URL)
if (!['127.0.0.1', 'localhost'].includes(database.hostname)) throw new Error('Record commands require a loopback Docker database')
const localApi = new URL(local.SUPABASE_URL)
localApi.hostname = '127.0.0.1'
local.SUPABASE_URL = localApi.href.replace(/\/$/, '')
const env = { ...process.env, ...local, NODE_OPTIONS: '--no-experimental-webstorage' }
function run(args: string[], environment = env) {
  const result = Bun.spawnSync(args, { cwd: root, env: environment, stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error(`${args[0]} ${args[1]} failed`)
}
await mkdir(`${root}artifacts`, { recursive: true })
const worker = { ...local, SUPABASE_URL: 'http://supabase_kong_crrt:8000', CRRT_RECORD_ENABLED: 'true', RECORD_TRANSCRIPTION_ENABLED: 'false' }
database.hostname = 'supabase_db_crrt'; database.port = '5432'; worker.DATABASE_URL = database.href
const environmentFile = `${root}artifacts/record-worker.env`
await Bun.write(environmentFile, Object.entries(worker).map(([key, value]) => `${key}=${value}`).join('\n'))
if (action === 'provision') {
  run(['bun', 'run', 'db:migrate'])
  run(['bun', 'scripts/record-storage.ts'])
} else if (action === 'integration' || action === 'r2-integration' || action === 'worker' || action === 'transcription-test') {
  if (action === 'r2-integration') {
    // Local S3 compatibility tests never use Cloudflare credentials or buckets.
    const r2 = { RECORD_STORAGE_PROVIDER: 'r2', RECORD_R2_BUCKET: 'record-test', RECORD_R2_ENDPOINT: 'http://record-r2-local:9000', RECORD_R2_ACCESS_KEY_ID: 'record-local', RECORD_R2_SECRET_ACCESS_KEY: 'record-local-password' }
    await Bun.write(environmentFile, Object.entries({ ...worker, ...r2 }).map(([key, value]) => `${key}=${value}`).join('\n'))
  }
  run(['docker', 'build', '-f', 'docker/record-worker.Dockerfile', '-t', 'crrt-record-worker:local', '.'])
  run(['docker', 'run', '--rm', '--network', 'crrt-local', '--env-file', environmentFile,
    '-v', `${root}api:/app/api:ro`, '-v', `${root}scripts:/app/scripts:ro`,
    '-v', `${root}shared:/app/shared:ro`,
    '-v', `${root}apps/extension/lib:/app/apps/extension/lib:ro`,
    'crrt-record-worker:local', 'bun', action === 'worker' ? 'scripts/record-worker.ts' : action === 'transcription-test' ? 'scripts/record-transcription-integration.ts' : 'scripts/record-integration.ts'])
} else if (action === 'test') {
  run(['docker', 'build', '-f', 'docker/record-worker.Dockerfile', '-t', 'crrt-record-worker:local', '.'])
  run(['docker', 'build', '-f', 'docker/record-tests.Dockerfile', '-t', 'crrt-record-tests:local', '.'])
  run(['docker', 'run', '--rm', '-v', `${root}artifacts:/verification`, 'crrt-record-tests:local',
    'bun', 'run', 'test:coverage', '--maxWorkers=2', '--coverage.reportsDirectory=/verification/record-coverage'])
} else throw new Error('Use provision, integration, worker, or test')
