import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const enabled = process.env.DOMAIN_ACCESS_DB_TEST === 'true'
const url = process.env.DATABASE_URL || ''
if (enabled && !/^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):/.test(url)) throw new Error('Local database required')
const db = enabled ? postgres(url, { max: 5 }) : null
const suite = enabled ? describe : describe.skip
const project = `access-notifications-${randomUUID()}`
const domain = `${project}.test`
const owner = randomUUID(), admin = randomUUID(), user = randomUUID(), member = randomUUID()
const submit = () => db!`select public.submit_project_access_request(${project}, ${user}::uuid) as result`.then(r => r[0].result)
const notifications = () => db!`select * from public.notifications where payload->>'projectKey' = ${project}`
beforeAll(async () => {
  if (!db) return
  for (const id of [owner, admin, user, member]) await db`insert into auth.users (id, email, email_confirmed_at) values (${id}, ${`${id}@${domain}`}, now())`
  await db`insert into public.projects (public_key, slug, name) values (${project}, ${project}, 'Notification test')`
  await db`insert into public.project_members (project_key, user_id, role, is_owner) values
    (${project}, ${owner}, 'admin', true), (${project}, ${admin}, 'admin', false), (${project}, ${member}, 'member', false)`
  await db`insert into public.project_email_domains (project_key, domain) values (${project}, ${domain})`
})
afterAll(async () => {
  if (!db) return
  await db`delete from public.notifications where payload->>'projectKey' = ${project}`
  await db`delete from public.projects where public_key = ${project}`
  await db`delete from auth.users where id in (${owner}, ${admin}, ${user}, ${member})`
  await db.end()
})
suite('transactional access-request notifications', () => {
  it('notifies each admin once for concurrent submissions and keeps notifications private', async () => {
    const results = await Promise.all([submit(), submit(), submit()])
    expect(results.map(r => r.outcome).sort()).toEqual(['created', 'existing', 'existing'])
    const rows = await notifications()
    expect(rows.map(r => r.user_id).sort()).toEqual([owner, admin].sort())
    for (const row of rows) expect(row).toMatchObject({ kind: 'project.access_requested', read_at: null,
      payload: { projectKey: project, projectName: 'Notification test', email: `${user}@${domain}`, requestId: results[0].request.id, attempt: 1 } })
    const own = await db!.begin(async tx => {
      await tx`select set_config('request.jwt.claim.sub', ${owner}, true)`
      await tx`set local role authenticated`
      return tx`select user_id from public.notifications where payload->>'projectKey' = ${project}`
    })
    expect(own.map(r => r.user_id)).toEqual([owner])
    await expect(db!`insert into public.notifications (user_id,kind,payload) values (${owner}, 'project.access_requested', ${db!.json(rows[0].payload)})`).rejects.toThrow()
    await db!`update public.notifications set read_at = now() where payload->>'projectKey' = ${project}`
    await submit()
    expect((await notifications()).every(r => r.read_at !== null)).toBe(true)
  })
  it('creates fresh notifications on retry and excludes admins who lost permission', async () => {
    const { request } = await submit()
    for (const attempt of [1, 2]) {
      await db!`select public.review_project_access_request(${project}, ${request.id}::uuid, ${owner}::uuid, 'declined', 'member', ${attempt})`
      expect((await submit()).outcome).toBe('cooldown')
      if (attempt === 2) await db!`select public.change_project_member_role(${project}, ${owner}::uuid, ${admin}::uuid, 'member')`
      await db!`update public.project_access_requests set reviewed_at = now() - interval '8 days' where id = ${request.id}`
      expect((await submit()).request.attempt).toBe(attempt + 1)
    }
    const rows = await notifications()
    expect(rows).toHaveLength(5)
    expect(rows.filter(r => r.payload.attempt === 2)).toHaveLength(2)
    expect(rows.filter(r => r.payload.attempt === 3).map(r => r.user_id)).toEqual([owner])
    expect(rows.filter(r => r.payload.attempt > 1).every(r => r.read_at === null)).toBe(true)
  })
})
