/** Run with `bun scripts/check-local-supabase-auth.ts` against a running local stack. */
import assert from 'node:assert/strict'
import { getServiceSupabase } from '../api/_lib/supabase.js'
import { findUserIdByEmail, getUserEmailsByIds } from '../api/_lib/store.js'

// Capture CLI output so credentials never appear in logs or a checked-in fixture.
const result = Bun.spawnSync(['bunx', 'supabase', 'status', '-o', 'json'], {
  stdout: 'pipe', stderr: 'pipe',
})
assert.equal(result.exitCode, 0, 'Local Supabase must be running')
const status = JSON.parse(result.stdout.toString()) as Record<string, string>
assert.ok(status.SECRET_KEY?.startsWith('sb_secret_'), 'Local Supabase must expose a real secret key')
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname), 'Only run against local Supabase')
process.env.SUPABASE_URL = status.API_URL
process.env.SUPABASE_SECRET_KEY = status.SECRET_KEY
// Prove no legacy credential can silently rescue the secret-key check.
delete process.env.SUPABASE_SERVICE_ROLE_KEY

const client = getServiceSupabase()
const suffix = crypto.randomUUID()
const email = `pr283-${suffix}@example.test`
const bucket = `pr283-${suffix}`
let userId: string | undefined
let bucketCreated = false
let projectCreated = false
try {
  assert.ifError((await client.from('projects').insert({
    public_key: bucket, slug: bucket, name: 'Local secret-key probe',
  })).error)
  projectCreated = true
  const project = await client.from('projects').select('name').eq('public_key', bucket).single()
  assert.ifError(project.error)
  assert.equal(project.data!.name, 'Local secret-key probe')
  assert.ifError((await client.from('projects').update({ name: 'Updated probe' }).eq('public_key', bucket)).error)

  const user = await client.auth.admin.createUser({ email, email_confirm: true })
  assert.ifError(user.error)
  userId = user.data.user!.id
  assert.equal(await findUserIdByEmail(email), userId)
  assert.deepEqual(await getUserEmailsByIds([userId]), { [userId]: email })

  const created = await client.storage.createBucket(bucket, { public: false })
  assert.ifError(created.error)
  bucketCreated = true
  const storage = client.storage.from(bucket)
  assert.ifError((await storage.upload('probe.txt', 'local secret-key probe', { contentType: 'text/plain' })).error)
  const download = await storage.download('probe.txt')
  assert.ifError(download.error)
  assert.equal(await download.data!.text(), 'local secret-key probe')
  console.log('PASS: local sb_secret key — database insert/read/update, Auth Admin create/lookup, storage create/upload/download')

  // Verify older deployments remain compatible with a JWT in the legacy variable.
  delete process.env.SUPABASE_SECRET_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY
  assert.ifError((await getServiceSupabase().from('projects').select('public_key').limit(1)).error)
  assert.equal(await findUserIdByEmail(email), userId)
  console.log('PASS: local legacy service-role fallback — database and Auth Admin')
} finally {
  // The original client keeps using the secret key, including cleanup requests.
  try {
    if (bucketCreated) {
      assert.ifError((await client.storage.emptyBucket(bucket)).error)
      assert.ifError((await client.storage.deleteBucket(bucket)).error)
    }
  } finally {
    try {
      if (userId) assert.ifError((await client.auth.admin.deleteUser(userId)).error)
    } finally {
      if (projectCreated) assert.ifError((await client.from('projects').delete().eq('public_key', bucket)).error)
    }
  }
  console.log('Removed temporary local test resources')
}
