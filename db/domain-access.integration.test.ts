import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.DOMAIN_ACCESS_DB_TEST === 'true'
const url = process.env.DATABASE_URL || ''
if (enabled && !/^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):/.test(url)) throw new Error('Local database required')
const db = enabled ? postgres(url, { max: 5 }) : null
const suite = enabled ? describe : describe.skip
const project = `domain-test-${randomUUID()}`
const admin = `f${randomUUID().slice(1)}`, user = `0${randomUUID().slice(1)}`, other = randomUUID()
const submit = () => db!`select public.submit_project_access_request(${project}, ${user}::uuid) as result`.then(r => r[0].result)
const review = (id: string, decision = 'approved', role = 'member', actor = admin, attempt = 1) => db!`
  select public.review_project_access_request(${project}, ${id}::uuid, ${actor}::uuid, ${decision}, ${role}, ${attempt}) as result
`.then(r => r[0].result)

async function waitForBlocked(pid: number) {
  for (let i = 0; i < 200; i++) {
    const [row] = await db!`select cardinality(pg_blocking_pids(${pid})) > 0 as blocked`
    if (row.blocked) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Expected the concurrent operation to wait on the held row lock')
}

beforeAll(async () => {
  if (!db) return
  await db`insert into auth.users (id, email, email_confirmed_at) values
    (${admin}, ${`${admin}@company.test`}, now()), (${user}, ${`${user}@company.test`}, now()), (${other}, ${`${other}@elsewhere.test`}, null)`
  await db`insert into public.projects (public_key, slug, name) values (${project}, ${project}, 'Domain test')`
  await db`insert into public.project_members (project_key, user_id, role, is_owner) values (${project}, ${admin}, 'admin', true)`
  await db`insert into public.project_email_domains (project_key, domain) values (${project}, 'company.test')`
})
afterAll(async () => {
  if (!db) return
  await db`delete from public.notifications where payload->>'projectKey' = ${project}`
  await db`delete from public.projects where public_key = ${project}`
  await db`delete from auth.users where id in (${admin}, ${user}, ${other})`
  await db.end()
})

suite('company domain access against local Supabase', () => {
  it('keeps tables and RPCs private and enforces domain constraints', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(db!.begin(async tx => {
        await tx.unsafe(`set local role ${role}`)
        await tx`select public.suggest_domain_projects(${user}::uuid)`
      })).rejects.toThrow()
      for (const signature of [
        'submit_project_access_request(text,uuid)', 'review_project_access_request(text,uuid,uuid,text,text,integer)',
        'mutate_project_email_domain(text,uuid,text,boolean)', 'suggest_domain_projects(uuid)',
      ]) {
        const [access] = await db!`select has_function_privilege(${role}, ${signature}, 'EXECUTE') as allowed,
          has_function_privilege('service_role', ${signature}, 'EXECUTE') as service`
        expect(access).toEqual({ allowed: false, service: true })
      }
      const rows = await db!.begin(async tx => {
        await tx.unsafe(`set local role ${role}`)
        return tx`select * from public.project_email_domains`
      }).catch(() => [])
      expect(rows).toHaveLength(0)
    }
    for (const domain of ['Company.test', '*.company.test', 'https://company.test', 'company..test', '-bad.test']) {
      await expect(db!`insert into public.project_email_domains (project_key, domain) values (${project}, ${domain})`).rejects.toThrow()
    }
    await expect(db!`insert into public.project_email_domains (project_key, domain) values (${project}, 'company.test')`).rejects.toThrow()
  })
  it('discovers exact verified domains without exposing existing members or invitees', async () => {
    const suggestions = await db!`select * from public.suggest_domain_projects(${user}::uuid)`
    expect(suggestions).toContainEqual({ project_key: project, name: 'Domain test', domain: 'company.test', status: null, retry_at: null })
    expect(await db!`select * from public.suggest_domain_projects(${admin}::uuid)`).toHaveLength(0)
    expect(await db!`select * from public.suggest_domain_projects(${other}::uuid)`).toHaveLength(0)
    await db!`update auth.users set email = ${`${user}@sub.company.test`} where id = ${user}`
    expect(await db!`select * from public.suggest_domain_projects(${user}::uuid)`).toHaveLength(0)
    expect((await submit()).outcome).toBe('ineligible')
    await db!`update auth.users set email = ${`${user}@company.test`}, email_confirmed_at = null where id = ${user}`
    expect((await submit()).outcome).toBe('unverified')
    await db!`update auth.users set email_confirmed_at = now() where id = ${user}`
    await db!`insert into public.project_invites (project_key, email, invited_by) values (${project}, ${`${user}@company.test`}, ${admin})`
    expect(await db!`select * from public.suggest_domain_projects(${user}::uuid)`).toHaveLength(0)
    expect((await submit()).outcome).toBe('already_has_access')
    await db!`delete from public.project_invites where project_key = ${project}`
  })
  it('serializes submissions, rejects unauthorized reviews, and enforces cooldown', async () => {
    const results = await Promise.all([submit(), submit()])
    expect(results.map(r => r.outcome).sort()).toEqual(['created', 'existing'])
    const id = results[0].request.id
    expect((await review(id, 'approved', 'owner')).outcome).toBe('invalid')
    expect((await review(id, 'approved', 'member', other)).outcome).toBe('forbidden')
    expect((await review(randomUUID())).outcome).toBe('not_found')
    expect((await review(id, 'declined')).outcome).toBe('reviewed')
    expect((await submit()).outcome).toBe('cooldown')
    await db!`update public.project_access_requests set reviewed_at = now() - interval '7 days' where id = ${id}`
    const retried = await submit()
    expect(retried).toMatchObject({ outcome: 'created', request: { id, attempt: 2, status: 'pending' } })
    expect((await review(id)).outcome).toBe('stale')
    expect((await review(id, 'declined')).outcome).toBe('stale')
    expect((await submit()).request.status).toBe('pending')
  })
  it('revalidates removed domains and changed email before approving', async () => {
    const { request } = await submit()
    await db!`delete from public.project_email_domains where project_key = ${project}`
    expect((await review(request.id, 'approved', 'member', admin, request.attempt)).outcome).toBe('ineligible')
    expect(await db!`select * from public.suggest_domain_projects(${user}::uuid)`).toHaveLength(0)
    await db!`insert into public.project_email_domains (project_key, domain) values (${project}, 'company.test')`
    await db!`update auth.users set email = ${`${user}@elsewhere.test`} where id = ${user}`
    expect((await review(request.id, 'approved', 'member', admin, request.attempt)).outcome).toBe('ineligible')
    await db!`update auth.users set email = ${`${user}@company.test`} where id = ${user}`
    const decisions = await Promise.all([review(request.id, 'approved', 'member', admin, request.attempt), review(request.id, 'declined', 'member', admin, request.attempt)])
    expect(decisions.map(r => r.outcome).sort()).toEqual(['resolved', 'reviewed'])
    expect(new Set(decisions.map(r => r.request.status)).size).toBe(1)
    // Regardless of the race winner, finish with a request eligible for approval.
    await db!`delete from public.project_members where project_key = ${project} and user_id = ${user}`
    await db!`update public.project_access_requests set reviewed_at = now() - interval '8 days' where id = ${request.id}`
    const next = await submit()
    await db!`insert into public.project_members (project_key, user_id, role) values (${project}, ${user}, 'guest')`
    expect((await review(next.request.id, 'approved', 'admin', admin, next.request.attempt)).request.granted_role).toBe('guest')
    expect((await submit()).outcome).toBe('already_has_access')
    expect(await db!`select * from public.suggest_domain_projects(${user}::uuid)`).toHaveLength(0)
  })
  it('orders review locks consistently with concurrent membership changes', async () => {
    await db!`delete from public.project_members where project_key = ${project} and user_id = ${user}`
    const { request } = await submit()
    await db!`insert into public.project_members (project_key, user_id, role) values (${project}, ${user}, 'guest')`
    const connection = await db!.reserve()
    const [{ pid }] = await connection`select pg_backend_pid() as pid`
    let pending: Promise<any> | undefined
    try {
      await db!.begin(async tx => {
        // Existing membership RPCs acquire the lower requester UUID first.
        await tx`select 1 from public.project_members where project_key = ${project} and user_id = ${user} for update`
        pending = connection`select public.review_project_access_request(${project}, ${request.id}::uuid,
          ${admin}::uuid, 'approved', 'admin', ${request.attempt}) as result`.then(rows => rows[0].result)
        await waitForBlocked(pid)
        const [changed] = await tx`select public.change_project_member_role(${project}, ${admin}::uuid, ${user}::uuid, 'member') as result`
        expect(changed.result.status).toBe('updated')
      })
      expect(await pending).toMatchObject({ outcome: 'reviewed', request: { granted_role: 'member' } })
    } finally {
      await pending?.catch(() => {})
      connection.release()
    }
  })
  it('rechecks domain-management permission after a concurrent revocation', async () => {
    await db!`insert into public.project_members (project_key, user_id, role) values (${project}, ${other}, 'admin')`
    const connection = await db!.reserve()
    const [{ pid }] = await connection`select pg_backend_pid() as pid`
    let pending: Promise<any> | undefined
    try {
      await db!.begin(async tx => {
        await tx`select public.change_project_member_role(${project}, ${admin}::uuid, ${other}::uuid, 'member')`
        pending = connection`select public.mutate_project_email_domain(${project}, ${other}::uuid, 'revoked.test', false) as result`
          .then(rows => rows[0].result)
        await waitForBlocked(pid)
      })
      expect(await pending).toBe('forbidden')
      expect(await db!`select 1 from public.project_email_domains where project_key = ${project} and domain = 'revoked.test'`).toHaveLength(0)
      for (const remove of [false, false, true, true]) {
        const [result] = await db!`select public.mutate_project_email_domain(${project}, ${admin}::uuid, 'allowed.test', ${remove}) as result`
        expect(result.result).toBe('updated')
      }
      const [denied] = await db!`select public.mutate_project_email_domain(${project}, ${other}::uuid, 'company.test', true) as result`
      expect(denied.result).toBe('forbidden')
      expect(await db!`select 1 from public.project_email_domains where project_key = ${project} and domain = 'company.test'`).toHaveLength(1)
    } finally {
      await pending?.catch(() => {})
      connection.release()
    }
  })

})
