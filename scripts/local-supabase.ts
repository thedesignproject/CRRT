import { unlink } from 'node:fs/promises'

const root = new URL('../', import.meta.url).pathname
const managedStart = '# >>> CRRT LOCAL SUPABASE >>>'
const managedEnd = '# <<< CRRT LOCAL SUPABASE <<<'

function run(command: string[], env = process.env) {
  const result = Bun.spawnSync(command, { cwd: root, env, stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error(`${command.join(' ')} failed`)
}

function runQuiet(command: string[]) {
  const result = Bun.spawnSync(command, { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`${command.join(' ')} failed`)
}

function captureJson(command: string[]) {
  const result = Bun.spawnSync(command, { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`${command.join(' ')} failed`)
  return JSON.parse(result.stdout.toString()) as Record<string, string>
}

function ensureNetwork() {
  const inspect = Bun.spawnSync(['docker', 'network', 'inspect', 'crrt-local'], {
    cwd: root,
    stdout: 'ignore',
    stderr: 'ignore',
  })
  if (inspect.exitCode !== 0) {
    run([
      'docker', 'network', 'create',
      '-o', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
      'crrt-local',
    ])
  }
}

function writeLocalEnv(status: Record<string, string>) {
  const required = ['ANON_KEY', 'API_URL', 'DB_URL', 'SERVICE_ROLE_KEY']
  if (required.some((key) => !status[key])) throw new Error('Supabase status is missing local credentials')

  const values: Record<string, string> = {
    VITE_API_BASE: 'http://127.0.0.1:3001/api',
    VITE_PROJECT_ID: 'demo-project',
    SUPABASE_URL: status.API_URL,
    SUPABASE_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    DATABASE_URL: status.DB_URL,
    REVIEWER_API_TOKEN: 'local-reviewer-token-do-not-use-in-production',
    SHARE_TOKEN_SECRET: 'local-share-token-secret-do-not-use-in-production',
    WIDGET_AUTH_SECRET: 'local-widget-auth-secret-do-not-use-in-production',
    APP_URL: 'http://127.0.0.1:3001',
    LOCAL_API_PORT: '3001',
  }
  const block = [managedStart, ...Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`), managedEnd].join('\n')
  const path = `${root}.env.docker.local`
  const existing = Bun.file(path).size ? Bun.file(path).text() : Promise.resolve('')

  return removeLegacyLocalEnv().then(() => existing).then((contents) => {
    const pattern = new RegExp(`${managedStart}[\\s\\S]*?${managedEnd}\\n?`)
    const unmanaged = contents.replace(pattern, '').trimEnd()
    return Bun.write(path, `${unmanaged ? `${unmanaged}\n\n` : ''}${block}\n`)
  })
}

async function removeLegacyLocalEnv() {
  const path = `${root}.env.local`
  const file = Bun.file(path)
  if (!file.size) return

  const pattern = new RegExp(`${managedStart}[\\s\\S]*?${managedEnd}\\n?`)
  const unmanaged = (await file.text()).replace(pattern, '').trimEnd()
  if (unmanaged) await Bun.write(path, `${unmanaged}\n`)
  else await unlink(path)
}

function applyLocalGrants() {
  const sql = [
    'grant usage on schema public to anon, authenticated, service_role',
    'grant all privileges on all tables in schema public to service_role',
    'grant all privileges on all sequences in schema public to service_role',
    'grant execute on all functions in schema public to service_role',
    'grant select on table public.notifications to authenticated',
    "notify pgrst, 'reload schema'",
  ].join('; ')
  run(['docker', 'exec', 'supabase_db_crrt', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql])
}

async function smoke(status: Record<string, string>) {
  const headers = {
    apikey: status.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [auth, project, bucket] = await Promise.all([
      fetch(`${status.API_URL}/auth/v1/health`),
      fetch(`${status.API_URL}/rest/v1/projects?public_key=eq.demo-project&select=public_key`, { headers }),
      fetch(`${status.API_URL}/storage/v1/bucket/feedback-images`, { headers }),
    ])
    if (auth.ok && project.ok && bucket.ok) {
      const projects = await project.json() as Array<{ public_key?: string }>
      if (projects[0]?.public_key === 'demo-project') return
    }
    await Bun.sleep(500)
  }

  throw new Error('Local Supabase smoke check failed after waiting for the REST schema cache')
}

async function up() {
  run(['docker', 'info'])
  ensureNetwork()
  runQuiet(['bunx', 'supabase', 'start', '--network-id', 'crrt-local', '-x', 'imgproxy'])
  const status = captureJson(['bunx', 'supabase', 'status', '-o', 'json'])
  await writeLocalEnv(status)
  const env = { ...process.env, DATABASE_URL: status.DB_URL }
  run(['bun', 'run', 'db:migrate'], env)
  applyLocalGrants()
  run(['bun', 'run', 'db:seed'], env)
  await smoke(status)
  console.log('Local CRRT dependencies are ready. Run: bun run local:dev')
  console.warn('Supabase development ports may be LAN-accessible; use only on a trusted network.')
}

const action = process.argv[2] || 'up'
if (action === 'down') run(['bunx', 'supabase', 'stop'])
else if (action === 'reset') {
  run(['bunx', 'supabase', 'stop', '--no-backup'])
  await up()
} else if (action === 'status') {
  const status = captureJson(['bunx', 'supabase', 'status', '-o', 'json'])
  console.log(`API: ${status.API_URL}\nStudio: ${status.STUDIO_URL}\nMailpit: ${status.MAILPIT_URL}`)
}
else if (action === 'up') await up()
else throw new Error(`Unknown local Supabase action: ${action}`)
