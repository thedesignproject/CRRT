import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
const enabled = process.env.WIDGET_AGENT_DB_TEST === 'true'
const url = process.env.DATABASE_URL || ''
if (enabled && !/^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):/.test(url)) throw Error('Local database required')
const db = enabled ? postgres(url) : null
const suite = enabled ? describe : describe.skip
afterAll(async () => { await db?.end() })
suite('widget handoff acceptance events', () => {
  it('advances existing streams atomically, preserves privacy, and does not duplicate retries', async () => {
    await db!.begin(async tx => {
      const actor = randomUUID(), project = 'widget-events-' + randomUUID(), id = randomUUID(), page = 'https://widget.test/page'
      await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor},${actor+'@test.local'},now())`
      await tx`insert into projects(public_key,slug,name) values(${project},${project},'Event regression')`
      await tx`insert into project_members(project_key,user_id,role,is_owner) values(${project},${actor},'admin',true)`
      await tx`insert into billing_accounts(user_id,subscription_status,price_id) values(${actor},'active','events-price')`
      await tx`insert into comments(id,project_id,url,comment,status,visibility) values(${id},${project},${page},'Event regression','approved','shared')`
      const create = async (key: string, connection = tx) => (await connection`select id from create_widget_agent_share(${project},${actor},${page},${key},${'a'.repeat(64)},${['events-price']}::text[],${connection.json({slug:randomUUID(),access_token_hash:'hash',access_token_ciphertext:'cipher',expires_at:new Date(Date.now()+3600000).toISOString()})},${[id]}::uuid[])`)[0].id
      const old = await create('old_'+randomUUID())
      const expired = await create('expired_'+randomUUID())
      const revoked = await create('revoked_'+randomUUID())
      await tx`update feedback_shares set expires_at=now()-interval '1 second' where id=${expired}`
      await tx`update feedback_shares set revoked_at=now() where id=${revoked}`
      await tx`delete from feedback_events where share_id in (${old},${expired},${revoked}) and event_type='comment.reviewed'`
      const before = (await tx`select max(id) as revision from feedback_events where share_id=${old}`)[0].revision
      await tx`update comments set status='pending' where id=${id}`
      const key = 'next_'+randomUUID(), next = await create(key)
      expect((await tx`select status from comments where id=${id}`)[0].status).toBe('approved')
      const events = await tx`select share_id,event_type,payload,id from feedback_events where share_id in (${old},${expired},${revoked}) and event_type='comment.reviewed'`
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({share_id:old,event_type:'comment.reviewed',payload:{reviewStatus:'accepted'}})
      expect(BigInt(events[0].id)).toBeGreaterThan(BigInt(before))
      expect(await create(key)).toBe(next)
      expect((await tx`select count(*)::int as count from feedback_events where share_id=${old} and event_type='comment.reviewed'`)[0].count).toBe(1)
      // System shares cannot receive private-project feedback.
      const system = randomUUID()
      await tx`insert into feedback_shares(id,project_id,scope_type,slug,access_token_hash,access_token_ciphertext,created_by,expires_at) values(${system},${project},'project',${randomUUID()},'hash','cipher','system',now()+interval '1 hour')`
      await tx`update projects set widget_private=true where public_key=${project}`
      // A failed transaction must roll back both acceptance and stream events.
      await expect(tx.savepoint(async nested => {
        await nested`update comments set status='pending' where id=${id}`
        await create('rollback_'+randomUUID(), nested)
        expect((await nested`select count(*)::int as count from feedback_events where share_id=${old} and event_type='comment.reviewed'`)[0].count).toBe(2)
        expect((await nested`select count(*)::int as count from feedback_events where share_id=${system} and event_type='comment.reviewed'`)[0].count).toBe(0)
        throw Error('deliberate rollback')
      })).rejects.toThrow('deliberate rollback')
      expect((await tx`select count(*)::int as count from feedback_events where share_id=${old} and event_type='comment.reviewed'`)[0].count).toBe(1)
      expect((await tx`select status from comments where id=${id}`)[0].status).toBe('approved')
      await tx`delete from projects where public_key=${project}`
      await tx`delete from billing_accounts where user_id=${actor}`
      await tx`delete from auth.users where id=${actor}`
    })
  })
})
