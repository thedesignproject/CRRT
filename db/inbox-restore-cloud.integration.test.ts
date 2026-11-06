// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { inboxRestoreCloudSql } from './schema'

it('records a forward Cloud repair without rewriting the applied Inbox migration', () => {
  expect(readFileSync('db/migrations/0049_inbox_restore_cloud_fences.sql', 'utf8')).toBe(`${inboxRestoreCloudSql.trim()}\n`)
  expect(createHash('sha256').update(readFileSync('db/migrations/0048_inbox_restore.sql')).digest('hex'))
    .toBe('b83f90285d59cd6a3218a1616ddee0b9f10b25fa6808bad4ec7776cee1244e50')
  const previous = JSON.parse(readFileSync('db/migrations/meta/0048_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0049_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
  expect(current.tables).toEqual(previous.tables)
  const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
  const repair = journal.entries.find((entry: { idx: number }) => entry.idx === 49)
  const inbox = journal.entries.find((entry: { idx: number }) => entry.idx === 48)
  expect(repair).toMatchObject({idx: 49, tag: '0049_inbox_restore_cloud_fences'})
  expect(repair.when).toBeGreaterThan(inbox.when)
})

// Never run against the app's database or a shared environment.
const connection = process.env.INBOX_RESTORE_TEST_DATABASE_URL
if (connection && !/^postgres(?:ql)?:\/\/[^/]+@127\.0\.0\.1:\d+\/crrt_inbox_restore_[a-z0-9_]+$/.test(connection)) {
  throw new Error('Dedicated local Inbox restore database required')
}
const suite = connection ? describe.sequential : describe.skip
suite('Cloud-enabled Inbox moves and restore', () => {
  const sql = postgres(connection!, {max: 8, onnotice: () => {}})
  afterAll(async () => { await sql.end() })

  async function fixture() {
    const owner = randomUUID(), stranger = randomUUID(), id = randomUUID(), project = `cloud-inbox-${randomUUID()}`
    await sql.begin(async tx => {
      // Seed personal feedback as it existed before Cloud enforcement; setup
      // must work on 0048 too so these tests prove the upgrade fixes the bugs.
      await tx`update cloud_plan_settings set enabled=false where id=1`
      await tx`insert into auth.users(id,email) values (${owner},${`${owner}@example.test`}),(${stranger},${`${stranger}@example.test`})`
      await tx`insert into billing_accounts(user_id,plan,subscription_status,period_start,period_end)
        values (${owner},'pro','active',now()-interval '1 day',now()+interval '29 days')`
      await tx`insert into projects(public_key,slug,name) values (${project},${project},'Cloud Inbox')`
      await tx`insert into project_members(project_key,user_id,role,is_owner) values (${project},${owner},'admin',true)`
      await tx`insert into comments(id,source,created_by_user_id,page_hostname,comment) values (${id},'extension',${owner},'example.test','Personal feedback')`
      await tx`update cloud_plan_settings set enabled=true where id=1`
    })
    return {owner, stranger, id, project}
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>
  async function move(f: Fixture) {
    const [row] = await sql`select id,updated_at::text from assign_actor_inbox_feedback_with_versions(${f.owner},${f.project},ARRAY[${f.id}]::uuid[],'internal')`
    return row
  }
  function restore(f: Fixture, row: postgres.Row) {
    return sql`select * from restore_actor_inbox_feedback(${f.owner},${f.project},${sql.json([row])})`
  }

  it('restores paid feedback to Inbox without refunding or double-charging its quota', async () => {
    const f = await fixture(), row = await move(f)
    expect(await restore(f, row)).toEqual([{id: f.id}])
    expect((await sql`select project_id,visibility from comments where id=${f.id}`)[0]).toMatchObject({project_id: null, visibility: 'shared'})
    expect(await sql`select * from cloud_usage where resource_id=${f.id}`).toHaveLength(1)
    expect(await move(f)).toHaveProperty('id', f.id)
    expect(await sql`select * from cloud_usage where resource_id=${f.id}`).toHaveLength(1)
  })

  it('allows personal extension creation and edits while retaining project write checks', async () => {
    const f = await fixture(), personal = randomUUID()
    await sql`insert into comments(id,source,created_by_user_id,page_hostname,comment) values (${personal},'extension',${f.owner},'example.test','Personal')`
    await sql`update comments set comment='Edited' where id=${personal}`
    expect(await sql`select * from cloud_usage where resource_id=${personal}`).toHaveLength(0)
    await expect(sql`insert into comments(comment) values ('Missing project')`).rejects.toThrow('cloud_plan_limit')
    const row = await move(f)
    await sql`update billing_accounts set subscription_status='canceled' where user_id=${f.owner}`
    await expect(restore(f, row)).rejects.toThrow('cloud_plan_limit')
    expect((await sql`select project_id from comments where id=${f.id}`)[0].project_id).toBe(f.project)
  })

  it('preserves exact versions, actor permissions, share references and single-winner restore', async () => {
    const f = await fixture(), row = await move(f)
    await expect(sql`select * from restore_actor_inbox_feedback(${f.stranger},${f.project},${sql.json([row])})`).rejects.toThrow('forbidden')
    await sql`update comments set updated_at=clock_timestamp() where id=${f.id}`
    expect(await restore(f, row)).toHaveLength(0)
    const [current] = await sql`select id,updated_at::text from comments where id=${f.id}`
    const results = await Promise.all([restore(f, current), restore(f, current)])
    expect(results.map(rows => rows.length).sort()).toEqual([0, 1])
    const moved = await move(f), share = randomUUID()
    await sql`insert into feedback_shares(id,project_id,slug,access_token_hash,access_token_ciphertext,created_by,scope_type,expires_at)
      values (${share},${f.project},${randomUUID()},'hash','cipher','reviewer','selection',now()+interval '1 day')`
    await sql`insert into feedback_share_items(share_id,comment_id) values (${share},${f.id})`
    expect(await restore(f, moved)).toHaveLength(0)
  })

  it('rejects assignment when the paid project quota is exhausted', async () => {
    const f = await fixture()
    await sql`insert into cloud_usage(resource_id,resource,owner_id,window_start,window_end)
      select gen_random_uuid(),'comments',${f.owner},w.window_start,w.window_end
      from cloud_effective_account(${f.owner}) b cross join lateral cloud_usage_window(b.period_start,b.period_end) w,generate_series(1,2000)`
    await expect(move(f)).rejects.toThrow('cloud_plan_limit')
    expect((await sql`select project_id from comments where id=${f.id}`)[0].project_id).toBeNull()
  })

  it('retains RPC grants and refuses to restore another author or a non-extension item', async () => {
    const f = await fixture(), row = await move(f)
    await sql`insert into project_members(project_key,user_id,role,is_owner) values (${f.project},${f.stranger},'member',false)`
    expect(await sql`select * from restore_actor_inbox_feedback(${f.stranger},${f.project},${sql.json([row])})`).toHaveLength(0)
    await sql`update comments set source='widget' where id=${f.id}`
    const [current] = await sql`select id,updated_at::text from comments where id=${f.id}`
    expect(await restore(f, current)).toHaveLength(0)
    for (const signature of ['public.assign_actor_inbox_feedback_with_versions(uuid,text,uuid[],text)', 'public.restore_actor_inbox_feedback(uuid,text,jsonb)']) {
      expect((await sql`select has_function_privilege('service_role',${signature},'EXECUTE') as allowed`)[0].allowed).toBe(true)
      for (const role of ['anon', 'authenticated']) {
        expect((await sql`select has_function_privilege(${role},${signature},'EXECUTE') as allowed`)[0].allowed).toBe(false)
      }
    }
  })

  it('admits versioned assignment before row locks when racing the legacy assignment', async () => {
    const f = await fixture(), legacy = await sql.reserve(), versioned = await sql.reserve()
    let pending: Promise<{rows?: postgres.RowList<postgres.Row[]>; error?: Error}> | undefined
    try {
      await legacy.unsafe('BEGIN')
      await legacy.unsafe("SET LOCAL statement_timeout='5s'")
      await legacy`select cloud_require_write(${f.owner})`
      const [blocker] = await legacy`select pg_backend_pid() as pid`
      const [waiter] = await versioned`select pg_backend_pid() as pid`
      pending = Promise.resolve(versioned`select * from assign_actor_inbox_feedback_with_versions(${f.owner},${f.project},ARRAY[${f.id}]::uuid[],'shared')`)
        .then(rows => ({rows}), error => ({error}))
      let blocked = false
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await sql`select ${blocker.pid}::int=ANY(pg_blocking_pids(${waiter.pid})) as blocked`
        if (row.blocked) { blocked = true; break }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      expect(blocked).toBe(true)
      // With the old inversion this UPDATE and the pending call deadlock.
      expect(await legacy`select * from assign_actor_inbox_feedback(${f.owner},${f.project},ARRAY[${f.id}]::uuid[],'shared')`).toHaveLength(1)
      await legacy.unsafe('COMMIT')
      const result = await pending
      expect(result.error).toBeUndefined()
      expect(result.rows).toHaveLength(0)
    } finally {
      await legacy.unsafe('ROLLBACK')
      await pending
      legacy.release(); versioned.release()
    }
  })
})
