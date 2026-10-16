import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A disposable database migrated through 0043; never share with another suite.
const url = process.env.LEGACY_BILLING_RACE_TEST_DATABASE_URL
const sql = url ? postgres(url, { max: 6, onnotice: () => {} }) : null
const integration = sql ? describe : describe.skip
afterAll(async () => { await sql?.end() })

integration('legacy billing transactional fences with quotas disabled', () => {
  beforeAll(async () => {
    await sql!`insert into cloud_plan_settings(id,enabled) values (1,false) on conflict (id) do update set enabled=false`
  })
  async function fixture(legacy = false) {
    const owner = randomUUID(), comment = randomUUID(), project = 'legacy-race-'+randomUUID()
    await sql!`insert into auth.users(id,email) values (${owner},${owner+'@example.com'})`
    await sql!`insert into billing_accounts(user_id,is_legacy,plan,price_id,subscription_status,period_start,period_end)
      values (${owner},${legacy},'pro','price_pro','active',now()-interval '1 day',now()+interval '29 days')`
    await sql!`select claim_project(${owner},${project},'Race test')`
    await sql!`insert into comments(id,project_id,url,x,y,element,comment,created_by,status)
      values (${comment},${project},'https://example.com',0,0,'body','Approved','widget','approved')`
    const key = randomUUID()
    const payload = {slug:randomUUID(),access_token_hash:randomUUID(),access_token_ciphertext:'cipher',expires_at:new Date(Date.now()+86400000).toISOString()}
    return { owner, comment, project, key, payload }
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>
  function share(connection: postgres.Sql | postgres.ReservedSql, f: Fixture, prices = ['price_pro']) {
    return connection`select * from create_approved_widget_agent_share(${f.project},${f.owner},'https://example.com',
      ${f.key},${'a'.repeat(64)},${prices},${connection.json(f.payload)},ARRAY[${f.comment}::uuid])`
  }
  async function waitForBlock(blocked: number, blocker: number) {
    for (let attempt=0;attempt<100;attempt++) {
      const [row] = await sql!`select ${blocker}::int=ANY(pg_blocking_pids(${blocked})) as waiting`
      if (row.waiting) return
      await new Promise(resolve => setTimeout(resolve,10))
    }
    throw new Error('Expected the database lock dependency to appear')
  }
  it('rechecks cancellation committed after the API eligibility read before issuing a credential', async () => {
    const f = await fixture()
    const cancel = await sql!.reserve(), agent = await sql!.reserve()
    let pending: Promise<unknown> | undefined
    try {
      await cancel.unsafe('BEGIN')
      await cancel`update billing_accounts set subscription_status='canceled' where user_id=${f.owner}`
      const [canceler] = await cancel`select pg_backend_pid() as pid`
      const [issuer] = await agent`select pg_backend_pid() as pid`
      // Start while cancellation is uncommitted: a stale unlocked read sees active.
      pending = Promise.resolve(share(agent,f)).then(
        value => ({value,error:null}), error => ({value:null,error}),
      )
      await waitForBlock(issuer.pid,canceler.pid)
      await cancel.unsafe('COMMIT')
      const result = await pending as {error: Error}
      expect(result.error.message).toContain('upgrade_required')
      expect(await sql!`select * from feedback_shares where project_id=${f.project}`).toHaveLength(0)
    } finally {
      await cancel.unsafe('ROLLBACK')
      await pending
      cancel.release(); agent.release()
    }
  })
  it('holds the billing read lock until share creation commits', async () => {
    const f = await fixture()
    const agent = await sql!.reserve(), cancel = await sql!.reserve()
    let pending: Promise<unknown> | undefined
    try {
      await agent.unsafe('BEGIN')
      await share(agent,f)
      const [issuer] = await agent`select pg_backend_pid() as pid`
      const [canceler] = await cancel`select pg_backend_pid() as pid`
      pending = Promise.resolve(cancel`update billing_accounts set subscription_status='canceled' where user_id=${f.owner}`)
      await waitForBlock(canceler.pid,issuer.pid)
      await agent.unsafe('COMMIT')
      await pending
      expect(await sql!`select * from feedback_shares where project_id=${f.project}`).toHaveLength(1)
    } finally {
      await agent.unsafe('ROLLBACK')
      await pending
      agent.release(); cancel.release()
    }
  })
  it('preserves Stripe history committed while user deletion waits on the billing row', async () => {
    const owner = randomUUID(), customer = 'cus_'+randomUUID()
    await sql!`insert into auth.users(id,email) values (${owner},${owner+'@example.com'})`
    await sql!`insert into billing_accounts(user_id,is_legacy) values (${owner},true)`
    const billing = await sql!.reserve(), deletion = await sql!.reserve()
    let pending: Promise<unknown> | undefined
    try {
      await billing.unsafe('BEGIN')
      await billing`update billing_accounts set customer_id=${customer} where user_id=${owner}`
      const [writer] = await billing`select pg_backend_pid() as pid`
      const [deleter] = await deletion`select pg_backend_pid() as pid`
      pending = Promise.resolve(deletion`delete from auth.users where id=${owner}`).then(
        value => ({value,error:null}), error => ({value:null,error}),
      )
      await waitForBlock(deleter.pid,writer.pid)
      await billing.unsafe('COMMIT')
      const result = await pending as {error: Error}
      expect(result.error.message).toContain('billing_accounts_user_id_users_id_fk')
      expect((await sql!`select customer_id from billing_accounts where user_id=${owner}`)[0].customer_id).toBe(customer)
      expect(await sql!`select id from auth.users where id=${owner}`).toHaveLength(1)
    } finally {
      await billing.unsafe('ROLLBACK')
      await pending
      billing.release(); deletion.release()
    }
  })
  it('allows legacy Pro after Studio cancellation and preserves Community bypass', async () => {
    const legacy = await fixture(true)
    await sql!`update billing_accounts set plan='studio',subscription_status='canceled' where user_id=${legacy.owner}`
    expect(await share(sql!,legacy)).toHaveLength(1)
    const community = await fixture()
    await sql!`delete from billing_accounts where user_id=${community.owner}`
    expect(await share(sql!,community,['community'])).toHaveLength(1)
  })
  it.each(['price','expired','missing','canceled'])('rejects %s Cloud entitlements even without quotas', async kind => {
    const f = await fixture()
    if (kind==='price') await sql!`update billing_accounts set price_id='price_other' where user_id=${f.owner}`
    if (kind==='expired') await sql!`update billing_accounts set period_end=now()-interval '1 second' where user_id=${f.owner}`
    if (kind==='missing') await sql!`delete from billing_accounts where user_id=${f.owner}`
    if (kind==='canceled') await sql!`update billing_accounts set subscription_status='canceled' where user_id=${f.owner}`
    await expect(share(sql!,f)).rejects.toThrow('upgrade_required')
    expect(await sql!`select * from feedback_shares where project_id=${f.project}`).toHaveLength(0)
  })
})
