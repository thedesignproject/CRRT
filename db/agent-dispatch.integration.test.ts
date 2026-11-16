// @vitest-environment node
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { assertLocalMcpTargets } from '../server/mcp/local-test-targets'

const local = process.env.MCP_TEST_LOCAL === '1'
const suite = local ? describe : describe.skip
suite('explicit widget SEND transactions', () => {
  if (local) assertLocalMcpTargets(process.env)
  const sql = postgres(process.env.DATABASE_URL || 'postgres://localhost/unused', { max: 5 })
  const owner = randomUUID(), member = randomUUID(), guest = randomUUID(), stranger = randomUUID()
  const client = randomUUID(), connection = randomUUID(), listener = randomUUID(), project = `send-${randomUUID()}`
  const repo = 'https://github.com/example/send', page = 'https://example.com/test'
  const register = (id = listener, senders = [owner], url = repo) => sql`select agent_listener_register(${owner},${connection},${id},${project},'Codex',${url},${senders}::uuid[]) as result`
  const comment = async () => (await sql`insert into comments(project_id,url,comment,element) values(${project},${page},'Fix heading','h1') returning *,updated_at::text as updated_at`)[0]
  const send = async (c: postgres.Row, key = randomUUID(), actor = owner, target = listener) =>
    (await sql`select agent_dispatch_send(${actor},${project},${page},${target},${c.id},${c.updated_at}::text::timestamptz,${key}) as result`)[0].result
  const share = () => ({ scope_type: 'selection', slug: randomUUID(), access_token_hash: randomUUID(), access_token_ciphertext: 'test-cipher', expires_at: new Date(Date.now()+3600000).toISOString() })
  const poll = async (id = listener) => (await sql`select agent_listener_poll(${owner},${connection},${id},${sql.json(share())}) as result`)[0].result
  const op = async (work: string, feedback: string, action: string, key = randomUUID()) => (await sql`select mcp_work_operation(${connection},${owner},${work},'agent',${feedback},${action},${key},'Verified test work',${'f'.repeat(64)}) as result`)[0].result
  beforeAll(async () => {
    for (const user of [owner, member, guest, stranger]) await sql`insert into auth.users(id,email) values(${user},${`${user}@send.test`})`
    await sql`insert into projects(public_key,slug,name) values(${project},${project},'SEND test')`
    await sql`insert into project_members(project_key,user_id,role,is_owner) values(${project},${owner},'admin',true),(${project},${member},'member',false),(${project},${guest},'guest',false)`
    await sql`insert into project_repo_configs(project_key,repo_url) values(${project},${repo})`
    await sql`insert into mcp_clients(id,name,redirect_uris) values(${client},'Test',ARRAY['http://localhost/callback'])`
    await sql`insert into mcp_connections(id,user_id,client_id,resource,scope) values(${connection},${owner},${client},'https://crrt.ai/api/mcp/v1','crrt:read crrt:implement')`
    await register()
  })
  afterAll(async () => {
    await sql`delete from feedback_shares where project_id=${project}`
    await sql`delete from comments where project_id=${project}`
    await sql`delete from projects where public_key=${project}`
    await sql`delete from mcp_clients where id=${client}`
    await sql`delete from auth.users where id=any(${[owner,member,guest,stranger]})`
    await sql.end()
  })
  it('rejects public/guest senders and unapproved members without accepting feedback', async () => {
    const c = await comment()
    for (const actor of [null, guest, stranger, member]) await expect(send(c, randomUUID(), actor as string)).rejects.toThrow('forbidden')
    expect((await sql`select status from comments where id=${c.id}`)[0].status).toBe('pending')
    await expect(register(randomUUID(), [owner,guest])).rejects.toThrow('forbidden')
  })
  it('checks the repository and exact content revision', async () => {
    await expect(register(randomUUID(), [owner], 'https://github.com/wrong/repo')).rejects.toThrow('repository_mismatch')
    const c=await comment()
    await sql`update comments set comment='Changed',updated_at=clock_timestamp() where id=${c.id}`
    await expect(send(c)).rejects.toThrow('feedback_changed')
    await expect(send({...c,id:randomUUID()})).rejects.toThrow('feedback_changed')
  })
  it('recovers simultaneous identical sends without duplicating work', async () => {
    const c=await comment(), key=randomUUID()
    const [a,b]=await Promise.all([send(c,key),send(c,key)])
    expect(a).toEqual(b)
    expect(a.state).toBe('queued')
    await expect(send({...c,updated_at:new Date()}, key)).rejects.toThrow('idempotency_conflict')
    const fresh=(await sql`select *,updated_at::text as updated_at from comments where id=${c.id}`)[0]
    await expect(send(fresh)).rejects.toThrow('already_sent')
    const [received,replay]=await Promise.all([poll(),poll()])
    expect(received).toEqual(replay)
    expect(received.state).toBe('received')
    await op(received.workId,c.id,'claim'); await op(received.workId,c.id,'start')
    const completeKey=randomUUID()
    await op(received.workId,c.id,'complete',completeKey)
    expect((await op(received.workId,c.id,'complete',completeKey)).outcome).toBe('duplicate')
    expect((await sql`select state from agent_dispatches where id=${a.dispatchId}`)[0].state).toBe('completed')
    expect(await poll()).toEqual({state:'waiting'})
  })
  it('processes a second SEND without creating a new listener', async () => {
    const c=await comment(); await send(c)
    const work=await poll(); expect(work.feedbackId).toBe(c.id)
    await op(work.workId,c.id,'claim'); await op(work.workId,c.id,'start'); await op(work.workId,c.id,'complete')
    expect(await poll()).toEqual({state:'waiting'})
  })
  it('authorizes a member explicitly and recovers queued work after temporary offline state', async () => {
    await register(listener,[owner,member])
    const c=await comment(); await send(c,randomUUID(),member)
    await sql`update agent_listeners set heartbeat_at=now()-interval '2 minutes' where id=${listener}`
    await expect(send(await comment())).rejects.toThrow('listener_offline')
    const work=await poll(); expect(work.feedbackId).toBe(c.id)
    await op(work.workId,c.id,'claim'); await op(work.workId,c.id,'complete')
  })
  it('cancels changed queued content before preparing work', async () => {
    const c=await comment(); await send(c)
    await sql`update comments set comment='Changed after send' where id=${c.id}`
    expect(await poll()).toMatchObject({state:'cancelled',reason:'feedback_changed'})
    expect(await poll()).toEqual({state:'waiting'})
  })
  it('blocks progress on edited content instead of completing stale work', async () => {
    const c=await comment(); await send(c); const work=await poll()
    await op(work.workId,c.id,'claim')
    await sql`update comments set anchor='{"selectedText":"changed"}' where id=${c.id}`
    await expect(op(work.workId,c.id,'start')).rejects.toThrow('feedback_changed')
    expect(await poll()).toMatchObject({state:'cancelled',reason:'feedback_changed'})
  })
  it('cancels queued work when its sender loses access', async () => {
    const c=await comment(); await send(c,randomUUID(),member)
    await sql`delete from project_members where project_key=${project} and user_id=${member}`
    expect(await poll()).toMatchObject({state:'cancelled',reason:'forbidden'})
    await register()
  })
  it('rechecks banned senders at enqueue and receipt', async () => {
    await sql`insert into project_members(project_key,user_id,role) values(${project},${member},'member')`
    await register(listener,[owner,member])
    const c=await comment()
    await sql`update auth.users set banned_until=now()+interval '1 day' where id=${member}`
    await expect(send(c,randomUUID(),member)).rejects.toThrow('forbidden')
    await sql`update auth.users set banned_until=null where id=${member}`
    await send(c,randomUUID(),member)
    await sql`update auth.users set banned_until=now()+interval '1 day' where id=${member}`
    expect(await poll()).toMatchObject({state:'cancelled',reason:'forbidden'})
    await sql`update auth.users set banned_until=null where id=${member}`
    await register()
  })
  it('blocks revoked connections, changed repositories and stopped listeners', async () => {
    await sql`update mcp_connections set revoked_at=now() where id=${connection}`
    await expect(poll()).rejects.toThrow('insufficient_scope')
    await sql`update mcp_connections set revoked_at=null where id=${connection}`
    await sql`update project_repo_configs set repo_url='https://github.com/other/repo' where project_key=${project}`
    await expect(poll()).rejects.toThrow('repository_changed')
    await sql`update project_repo_configs set repo_url=${repo} where project_key=${project}`
    await sql`select agent_listener_stop(${owner},${connection},${listener})`
    await expect(poll()).rejects.toThrow('listener_stopped')
    await expect(send(await comment())).rejects.toThrow('listener_offline')
    await register()
  })
  it('keeps queue tables and RPCs inaccessible to browser roles', async () => {
    for (const role of ['anon','authenticated']) {
      expect((await sql`select has_function_privilege(${role},'agent_dispatch_send(uuid,text,text,uuid,uuid,timestamptz,uuid)','execute') as allowed`)[0].allowed).toBe(false)
    }
    expect((await sql`select relrowsecurity from pg_class where relname in ('agent_listeners','agent_dispatches')`).every(r=>r.relrowsecurity)).toBe(true)
  })
})
