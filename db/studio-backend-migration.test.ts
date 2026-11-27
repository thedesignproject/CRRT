import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, expect, it } from 'vitest'
import { studioAgentDispatchSql, studioAgentRunsSql, studioBrainRulesSql, studioDeleteProjectSql, studioNextStepsSql, studioProjectActivitySql } from './schema.js'

// 0055 collects every studio backend layer, so this only checks for its parts.
const migration = readFileSync('db/migrations/0055_studio_backend.sql', 'utf8')
it('keeps the studio backend migration additive and aligned with schema source', () => {
  expect(migration).toContain(`--> statement-breakpoint\n${studioProjectActivitySql.trim()}\n`)
  expect(migration).toContain('CREATE TABLE "workspaces"')
  expect(migration).toContain('ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY')
  expect(migration).toContain(`--> statement-breakpoint\n${studioBrainRulesSql.trim()}\n`)
  expect(migration).toContain('CREATE TABLE "brain_rules"')
  expect(migration).toContain('ALTER TABLE "brain_rules" ENABLE ROW LEVEL SECURITY')
  expect(studioBrainRulesSql).toContain('SECURITY DEFINER SET search_path = \'\'')
  expect(studioBrainRulesSql).toContain('REVOKE ALL ON FUNCTION public.brain_rules_for(uuid, text) FROM PUBLIC, anon, authenticated;')
  expect(migration).toContain(`--> statement-breakpoint\n${studioNextStepsSql.trim()}\n`)
  for (const table of ['next_steps', 'next_step_comments', 'next_step_rule_citations']) expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`)
  expect(studioNextStepsSql).toContain('SECURITY DEFINER SET search_path = \'\'')
  expect(studioNextStepsSql).toContain('REVOKE ALL ON FUNCTION public.sync_next_steps(text) FROM PUBLIC, anon, authenticated;')
  expect(migration).toContain(`--> statement-breakpoint\n${studioAgentRunsSql.trim()}\n`)
  expect(studioAgentRunsSql).toContain('SECURITY DEFINER SET search_path = \'\'')
  expect(studioAgentRunsSql).toContain('REVOKE ALL ON FUNCTION public.agent_runs(text[], timestamptz, integer) FROM PUBLIC, anon, authenticated;')
  expect(migration).toContain(`--> statement-breakpoint\n${studioAgentDispatchSql.trim()}\n`)
  for (const table of ['agent_listeners', 'agent_dispatches']) expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`)
  expect(studioAgentDispatchSql).toContain('CREATE OR REPLACE FUNCTION public.mcp_work_operation(')
  expect(studioAgentDispatchSql).toContain('PERFORM public.agent_dispatch_guard(p_actor,p_connection,p_work,p_op);\n  PERFORM public.lock_agent_share(')
  expect(studioAgentDispatchSql).not.toContain('mcp_set_feedback_status')
  expect(migration).not.toMatch(/CREATE POLICY/)
  expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/)
  expect(studioProjectActivitySql).toContain('SECURITY DEFINER SET search_path = \'\'')
  expect(studioProjectActivitySql).toContain('REVOKE ALL ON FUNCTION public.project_activity(uuid, timestamptz) FROM PUBLIC, anon, authenticated;')
  const previous = JSON.parse(readFileSync('db/migrations/meta/0054_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0055_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
})

// Runs against a database already migrated through 0055 (CI's local:up), each
// test inside a transaction it rolls back.
const url = process.env.STUDIO_BACKEND_MIGRATION_TEST_DATABASE_URL ?? (process.env.MCP_TEST_LOCAL ? process.env.DATABASE_URL : undefined)
const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null
afterAll(async () => { await sql?.end() })
const integration = sql ? it : it.skip
integration('counts open feedback each member may read and flags live agents', async () => {
  const rollback = new Error('rollback isolated migration test')
  await expect(sql!.begin(async sql => {
    const [owner, guest, member] = [randomUUID(), randomUUID(), randomUUID()]
    const [open, hidden] = [`p-${randomUUID()}`, `p-${randomUUID()}`]
    await sql`insert into auth.users(id,email) select id, id || '@example.test' from unnest(${[owner, guest, member]}::uuid[]) id`
    await sql`insert into projects(public_key,slug,name) values (${open},${open},'Open')`
    await sql`insert into projects(public_key,slug,name,widget_private,feedback_access) values (${hidden},${hidden},'Hidden',true,'admins')`
    await sql`insert into project_members(project_key,user_id,role,is_owner) values
      (${open},${owner},'admin',true),(${open},${guest},'guest',false),(${hidden},${member},'member',false)`
    // A signed-in author: anonymous widget comments can't land in a private project.
    await sql`insert into comments(project_id,visibility,status,implementation_status,created_by_user_id) values
      (${open},'shared','pending','unassigned',${owner}),(${open},'internal','pending','in_progress',${owner}),
      (${open},'shared','approved','unassigned',${owner}),(${open},'shared','rejected','unassigned',${owner}),
      (${open},'shared','pending','done',${owner}),(${open},'shared','pending','ready_for_testing',${owner}),(${hidden},'shared','pending','unassigned',${member})`
    const [share] = await sql`insert into feedback_shares(project_id,scope_type,slug,access_token_hash,access_token_ciphertext,created_by,expires_at)
      values (${open},'project',${randomUUID()},'h','c','dashboard',now()+interval '1 day') returning id`
    await sql`insert into agent_presence(share_id,agent_id,status) values (${share.id},'agent','working')`
    const since = new Date(Date.now() - 90_000)
    expect([...await sql`select * from project_activity(${owner},${since})`]).toEqual([{ project_key: open, open_count: 2, agent_live: true }])
    expect([...await sql`select * from project_activity(${guest},${new Date(Date.now() + 60_000)})`]).toEqual([{ project_key: open, open_count: 1, agent_live: false }])
    expect([...await sql`select * from project_activity(${member},${since})`]).toEqual([])
    throw rollback
  })).rejects.toBe(rollback)
})

integration('lists the rules applying to each project the actor may read', async () => {
  const rollback = new Error('rollback isolated migration test')
  await expect(sql!.begin(async sql => {
    const [owner, other, member, outsider] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const [mine, theirs, hidden] = [`p-${randomUUID()}`, `p-${randomUUID()}`, `p-${randomUUID()}`]
    await sql`insert into auth.users(id,email) select id, id || '@example.test' from unnest(${[owner, other, member, outsider]}::uuid[]) id`
    await sql`insert into projects(public_key,slug,name) values (${mine},${mine},'Mine'),(${theirs},${theirs},'Theirs')`
    await sql`insert into projects(public_key,slug,name,widget_private,feedback_access) values (${hidden},${hidden},'Hidden',true,'admins')`
    await sql`insert into project_members(project_key,user_id,role,is_owner) values
      (${mine},${owner},'admin',true),(${mine},${member},'guest',false),(${theirs},${other},'admin',true),
      (${hidden},${owner},'admin',true),(${hidden},${member},'member',false)`
    await sql`insert into brain_rules(owner_user_id,project_key,title,body) values
      (${owner},null,'owner workspace','b'),(${owner},${mine},'mine','b'),(${other},null,'other workspace','b'),
      (${other},${theirs},'theirs','b'),(${owner},${hidden},'hidden','b')`
    const titles = async (actor: string, project: string | null) =>
      (await sql`select title from brain_rules_for(${actor},${project})`).map(row => row.title)
    expect(await titles(member, mine)).toEqual(['owner workspace', 'mine'])
    expect(await titles(member, null)).toEqual(['owner workspace', 'mine'])
    expect(await titles(member, hidden)).toEqual([])
    // Each rule once, though the owner's workspace rule applies to both of their projects.
    expect((await titles(owner, null)).sort()).toEqual(['hidden', 'mine', 'owner workspace'])
    expect(await titles(other, mine)).toEqual([])
    expect(await titles(outsider, null)).toEqual([])
    await expect(sql`insert into brain_rules(owner_user_id,title,body) values (${owner},'',${'b'})`).rejects.toThrow(/brain_rules_title_length/)
    throw rollback
  })).rejects.toBe(rollback)
})

integration('groups ready comments into next steps and keeps them in sync', async () => {
  const rollback = new Error('rollback isolated migration test')
  await expect(sql!.begin(async sql => {
    const owner = randomUUID(), project = `p-${randomUUID()}`
    const [a, b, c, d, pending, internal, testing] = Array.from({ length: 7 }, () => randomUUID())
    await sql`insert into auth.users(id,email) values (${owner},${owner + '@example.test'})`
    await sql`insert into projects(public_key,slug,name) values (${project},${project},'Steps')`
    const add = (id: string, url: string, element: string | null, body: string, author: string | null, minute: number, status = 'approved', visibility = 'shared', implementation = 'unassigned') =>
      sql`insert into comments(id,project_id,url,element,comment,author_name,status,visibility,implementation_status,created_by_user_id,created_at)
        values (${id},${project},${url},${element},${body},${author},${status},${visibility},${implementation},${owner},${new Date(Date.UTC(2026, 0, 1, 0, minute))})`
    await add(a, 'https://app.test/pricing?plan=pro#top', '#cta', '  Make the button bigger  ', 'Ana', 1)
    await add(b, 'https://app.test/pricing', '#cta', 'Bigger please', 'Ben', 2, 'approved', 'shared', 'claimed')
    await add(c, 'https://app.test/pricing#faq', '#cta', 'Agreed', 'Ana', 3)
    await add(d, 'https://app.test/about', null, 'x'.repeat(200), null, 4)
    await add(pending, 'https://app.test/pricing', '#cta', 'Not reviewed', 'Cy', 5, 'pending')
    await add(internal, 'https://app.test/pricing', '#cta', 'Team only', 'Cy', 6, 'approved', 'internal')
    await add(testing, 'https://app.test/pricing', '#cta', 'Shipped', 'Cy', 7, 'approved', 'shared', 'ready_for_testing')
    const sync = async () => (await sql`select sync_next_steps(${project}) as steps`)[0].steps as Array<Record<string, any>>

    const first = await sync()
    expect(first.map(step => [step.title, step.tag, step.status, step.comments.map((x: { id: string }) => x.id), step.requesters, step.citations, step.conflict]))
      .toEqual([['Make the button bigger', '/pricing', 'open', [a, b, c], ['Ana', 'Ben'], [], null], ['x'.repeat(120), '/about', 'open', [d], [], [], null]])
    expect(first[0].comments[0]).toEqual({ id: a, body: '  Make the button bigger  ', authorName: 'Ana' })
    expect(await sync()).toEqual(first)

    const [rule] = await sql`insert into brain_rules(owner_user_id,project_key,title,body) values (${owner},${project},'Brand blue','b') returning id`
    await sql`insert into next_step_rule_citations(next_step_id,rule_id,agent_id) values (${first[0].id},${rule.id},'mcp:w:a')`
    await sql`update next_steps set status='paused',conflict_rule_id=${rule.id},conflict_question='Red button?' where id=${first[0].id}`
    await sql`update comments set status='pending' where id=${b}`
    const [step] = await sync()
    expect(step).toMatchObject({ id: first[0].id, status: 'paused', requesters: ['Ana'], citations: [{ ruleId: rule.id, title: 'Brand blue' }],
      conflict: { ruleId: rule.id, ruleTitle: 'Brand blue', question: 'Red button?', decision: null } })
    expect(step.comments.map((x: { id: string }) => x.id)).toEqual([a, c])

    // A completed comment stays linked; the step is done once every comment is.
    await sql`update comments set implementation_status='ready_for_testing' where id=${a}`
    expect((await sync())[0].comments.map((x: { id: string }) => x.id)).toEqual([a, c])
    await sql`update comments set implementation_status='done' where id=${c}`
    await sql`update comments set status='rejected' where id=${d}`
    expect(await sync()).toEqual([])
    expect([...await sql`select status, completed_at is not null as completed from next_steps where project_key=${project}`]).toEqual([{ status: 'done', completed: true }])

    // A comment ready again after its step is done starts a new step for the same group.
    await sql`update comments set status='approved' where id=${b}`
    const [again] = await sync()
    expect(again).toMatchObject({ title: 'Bigger please', comments: [{ id: b }] })
    expect(again.id).not.toBe(first[0].id)
    await expect(sql`insert into next_steps(project_key,group_key,title,tag) values (${project},'https://app.test/pricing|#cta','t','/')`).rejects.toThrow(/next_steps_open_group/)
    throw rollback
  })).rejects.toBe(rollback)
})

integration('groups agent events into runs per share and agent with their outcome', async () => {
  const rollback = new Error('rollback isolated migration test')
  await expect(sql!.begin(async sql => {
    const owner = randomUUID(), [project, other] = [`p-${randomUUID()}`, `p-${randomUUID()}`]
    const [c1, c2, c3] = [randomUUID(), randomUUID(), randomUUID()]
    await sql`insert into auth.users(id,email) values (${owner},${owner + '@example.test'})`
    await sql`insert into projects(public_key,slug,name) values (${project},${project},'Runs'),(${other},${other},'Other')`
    await sql`insert into comments(id,project_id,visibility,status,created_by_user_id) values
      (${c1},${project},'shared','approved',${owner}),(${c2},${project},'shared','approved',${owner}),(${c3},${other},'shared','approved',${owner})`
    const share = async (projectKey: string) => (await sql`insert into feedback_shares(project_id,scope_type,slug,access_token_hash,access_token_ciphertext,created_by,expires_at)
      values (${projectKey},'project',${randomUUID()},'h','c','dashboard',now()+interval '1 day') returning id`)[0].id as string
    const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute))
    const event = (shareId: string, agent: string, type: string, minute: number, comment: string | null = null, actor = 'agent') =>
      sql`insert into feedback_events(share_id,comment_id,actor_type,actor_id,event_type,created_at) values (${shareId},${comment},${actor},${agent},${type},${at(minute)})`
    const seen = (shareId: string, agent: string, ago: number) =>
      sql`insert into agent_presence(share_id,agent_id,status,last_seen_at) values (${shareId},${agent},'idle',${new Date(Date.now() - ago)})`

    // A revoked share: its agent finished two comments (one twice) and is still seen, but cannot be running.
    const old = await share(project)
    for (const [type, minute, comment] of [['comment.claimed', 1, c1], ['comment.ready_for_testing', 2, c1], ['comment.ready_for_testing', 3, c2], ['comment.ready_for_testing', 4, c1]] as const) await event(old, 'mcp:w:done', type, minute, comment)
    await event(old, 'mcp:w:done', 'presence.updated', 5)
    await seen(old, 'mcp:w:done', 0)
    await sql`update feedback_shares set revoked_at=now() where id=${old}`
    const live = await share(project)
    await event(live, 'mcp:w:live', 'comment.claimed', 10, c1)
    await event(live, 'mcp:w:live', 'comment.ready_for_testing', 11, c1)
    await seen(live, 'mcp:w:live', 0)
    await event(live, 'blocker', 'comment.started', 12, c2)
    await event(live, 'blocker', 'comment.blocked', 13, c2)
    await seen(live, 'blocker', 120_000)
    await event(live, 'reopener', 'comment.ready_for_testing', 14, c2)
    await event(live, 'reopener', 'comment.reopened', 15, c2)
    await event(live, 'idler', 'presence.updated', 16)
    await event(live, 'reviewer-1', 'comment.reviewed', 17, c1, 'reviewer')
    await event(await share(other), 'elsewhere', 'comment.claimed', 18, c3)

    const runs = async (projects: string[], limit = 50) => [...await sql`select * from agent_runs(${projects},${new Date(Date.now() - 90_000)},${limit})`]
    expect((await runs([project])).map(run => [run.share_id, run.agent_id, run.started_at, run.ended_at, run.steps, run.comments_completed, run.outcome])).toEqual([
      [live, 'idler', at(16), at(16), 0, 0, 'stopped'],
      [live, 'reopener', at(14), at(15), 2, 1, 'stopped'],
      [live, 'blocker', at(12), at(13), 2, 0, 'blocked'],
      [live, 'mcp:w:live', at(10), at(11), 2, 1, 'running'],
      [old, 'mcp:w:done', at(1), at(5), 4, 2, 'completed'],
    ])
    expect((await runs([project], 2)).map(run => run.agent_id)).toEqual(['idler', 'reopener'])
    expect((await runs([other, project], 1))[0]).toMatchObject({ agent_id: 'elsewhere', project_key: other })
    expect(await runs([])).toEqual([])
    throw rollback
  })).rejects.toBe(rollback)
})

integration('direct send queues, delivers and fences comments for a listening terminal', async () => {
  const rollback = new Error('rollback isolated migration test')
  await expect(sql!.begin(async sql => {
    const [owner, member, guest, stranger] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const [client, connection, memberConnection, listener] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const project = `send-${randomUUID()}`, repo = 'https://github.com/example/send'
    await sql`insert into auth.users(id,email) select id, id || '@example.test' from unnest(${[owner, member, guest, stranger]}::uuid[]) id`
    await sql`insert into projects(public_key,slug,name) values (${project},${project},'Send')`
    await sql`insert into project_members(project_key,user_id,role,is_owner) values (${project},${owner},'admin',true),(${project},${member},'member',false),(${project},${guest},'guest',false)`
    await sql`insert into project_repo_configs(project_key,repo_url) values (${project},${repo})`
    await sql`insert into mcp_clients(id,name,redirect_uris) values (${client},'Test',ARRAY['http://localhost/callback'])`
    await sql`insert into mcp_connections(id,user_id,client_id,resource,scope) values (${connection},${owner},${client},'https://crrt.ai/api/mcp/v1','crrt:read crrt:implement'),
      (${memberConnection},${member},${client},'https://crrt.ai/api/mcp/v1','crrt:read crrt:implement')`
    const fails = (message: string, run: (sp: postgres.TransactionSql) => Promise<unknown>) => expect(sql.savepoint(run)).rejects.toThrow(message)
    const register = (senders = [owner], url = repo, id = listener) => sql`select agent_listener_register(${owner},${connection},${id},${project},'Codex',${url},${senders}::uuid[]) as r`
    const comment = async (text = 'Fix heading') => (await sql`insert into comments(project_id,url,comment,element) values (${project},'https://example.com/a',${text},'h1') returning id, updated_at::text as updated_at`)[0]
    // ::text first: postgres.js would otherwise round a reused timestamptz parameter to milliseconds.
    const send = async (c: { id: string; updated_at: string }, key: string = randomUUID(), actor = owner, db: postgres.Sql = sql) =>
      (await db`select agent_dispatch_send(${actor},${project},${listener},${c.id},${c.updated_at}::text::timestamptz,${key}) as r`)[0].r
    const share = { scope_type: 'selection', slug: randomUUID(), access_token_hash: randomUUID(), access_token_ciphertext: 'c', expires_at: new Date(Date.now() + 3600000).toISOString() }
    const poll = async (db: postgres.Sql = sql, id = listener) => (await db`select agent_listener_poll(${owner},${connection},${id},${sql.json({ ...share, slug: randomUUID() })}) as r`)[0].r
    const op = async (work: string, feedback: string | null, action: string, key = randomUUID(), db: postgres.Sql = sql) =>
      (await db`select mcp_work_operation(${connection},${owner},${work},'agent',${feedback},${action},${key},'Verified',${'f'.repeat(64)}) as r`)[0].r
    const state = async (id: string) => (await sql`select state, reason from agent_dispatches where id=${id}`)[0]

    expect((await register())[0].r).toEqual({ listenerId: listener, projectId: project, label: 'Codex', repoUrl: repo })
    // Only an admin may let other members send to their terminal, and only through their own connection.
    await fails('forbidden', sp => sp`select agent_listener_register(${member},${memberConnection},${randomUUID()},${project},'Codex',${repo},${[member, owner]}::uuid[])`)
    await fails('insufficient_scope', sp => sp`select agent_listener_register(${member},${connection},${randomUUID()},${project},'Codex',${repo},${[member]}::uuid[])`)
    await fails('repository_mismatch', () => register([owner], 'https://github.com/wrong/repo', randomUUID()))
    await fails('invalid_senders', () => register([member], repo, randomUUID()))

    // Only senders the listener allows, and never guests or strangers; a rejected send leaves the comment pending.
    const first = await comment()
    for (const actor of [guest, stranger, member]) await fails('forbidden', sp => send(first, randomUUID(), actor, sp))
    await fails('feedback_changed', sp => send({ ...first, updated_at: '2020-01-01T00:00:00Z' }, randomUUID(), owner, sp))
    await fails('feedback_changed', sp => send({ ...first, id: randomUUID() }, randomUUID(), owner, sp))
    expect((await sql`select status from comments where id=${first.id}`)[0].status).toBe('pending')

    // A retry with the same key returns the same dispatch; a new key for the same comment is already sent.
    const key = randomUUID()
    const sent = await send(first, key)
    expect(sent).toEqual({ dispatchId: expect.any(String), state: 'queued' })
    expect(await send(first, key)).toEqual(sent)
    expect((await sql`select status from comments where id=${first.id}`)[0].status).toBe('approved')
    await fails('idempotency_conflict', async sp => send(await comment(), key, owner, sp))
    const current = (await sql`select id, updated_at::text as updated_at from comments where id=${first.id}`)[0]
    await fails('already_sent', sp => send(current as typeof first, randomUUID(), owner, sp))

    // Receipt prepares one work session and replays it until the agent finishes.
    const work = await poll()
    expect(work).toMatchObject({ state: 'received', dispatchId: sent.dispatchId, projectId: project, feedbackId: first.id, repoUrl: repo })
    expect((await poll()).workId).toBe(work.workId)
    await op(work.workId, first.id, 'claim')
    await op(work.workId, first.id, 'start')
    const completeKey = randomUUID()
    await op(work.workId, first.id, 'complete', completeKey)
    expect((await op(work.workId, first.id, 'complete', completeKey)).outcome).toBe('duplicate')
    expect(await state(sent.dispatchId)).toEqual({ state: 'completed', reason: null })
    await fails('dispatch_completed', sp => op(work.workId, null, 'idle', randomUUID(), sp))
    expect(await poll()).toEqual({ state: 'waiting' })

    // Queued work survives a stale heartbeat, but new sends wait for the terminal to come back.
    const queued = await comment()
    const second = await send(queued)
    await sql`update agent_listeners set heartbeat_at=now()-interval '2 minutes' where id=${listener}`
    await fails('listener_offline', async sp => send(await comment(), randomUUID(), owner, sp))
    const delivered = await poll()
    expect(delivered).toMatchObject({ state: 'received', dispatchId: second.dispatchId })

    // Changed instructions stop the work instead of finishing stale changes.
    await op(delivered.workId, queued.id, 'claim')
    await sql`update comments set anchor='{"selectedText":"changed"}' where id=${queued.id}`
    await fails('feedback_changed', sp => op(delivered.workId, queued.id, 'start', randomUUID(), sp))
    expect(await poll()).toMatchObject({ state: 'cancelled', dispatchId: second.dispatchId, reason: 'feedback_changed' })
    const edited = await comment()
    const third = await send(edited)
    await sql`update comments set comment='Changed after send' where id=${edited.id}`
    expect(await poll()).toEqual({ state: 'cancelled', dispatchId: third.dispatchId, reason: 'feedback_changed' })

    // Moving the comment out of review cancels its dispatch.
    const reviewed = await comment()
    const fourth = await send(reviewed)
    await sql`update comments set status='pending' where id=${reviewed.id}`
    expect(await state(fourth.dispatchId)).toEqual({ state: 'cancelled', reason: 'review_changed' })

    // An admin may allow other members; losing access, or a banned account, cancels their queued work.
    await register([owner, member])
    const byMember = await comment()
    await sql`update auth.users set banned_until=now()+interval '1 day' where id=${member}`
    await fails('forbidden', sp => send(byMember, randomUUID(), member, sp))
    await sql`update auth.users set banned_until=null where id=${member}`
    const fifth = await send(byMember, randomUUID(), member)
    await sql`delete from project_members where project_key=${project} and user_id=${member}`
    expect(await poll()).toEqual({ state: 'cancelled', dispatchId: fifth.dispatchId, reason: 'forbidden' })

    // A changed repository or a stopped listener stops delivery; an unknown listener is not found.
    await sql`update project_repo_configs set repo_url='https://github.com/other/repo' where project_key=${project}`
    await fails('repository_changed', sp => poll(sp))
    await sql`update project_repo_configs set repo_url=${repo} where project_key=${project}`
    await sql`select agent_listener_stop(${owner},${connection},${listener})`
    await fails('listener_stopped', sp => poll(sp))
    await fails('listener_offline', async sp => send(await comment(), randomUUID(), owner, sp))
    await fails('listener_not_found', sp => poll(sp, randomUUID()))
    await fails('listener_not_found', sp => sp`select agent_listener_stop(${owner},${connection},${randomUUID()})`)

    for (const role of ['anon', 'authenticated']) {
      expect((await sql`select has_function_privilege(${role},'agent_dispatch_send(uuid,text,uuid,uuid,timestamptz,uuid)','execute') as allowed`)[0].allowed).toBe(false)
    }
    expect([...await sql`select relrowsecurity from pg_class where relname in ('agent_listeners','agent_dispatches')`]).toEqual([{ relrowsecurity: true }, { relrowsecurity: true }])
    throw rollback
  })).rejects.toBe(rollback)
})

it('ships the project delete function in 0055', () => {
  expect(migration).toContain(`--> statement-breakpoint\n${studioDeleteProjectSql.trim()}\n`)
  expect(studioDeleteProjectSql).toContain('REVOKE ALL ON FUNCTION public.delete_owned_project(text, uuid) FROM PUBLIC, anon, authenticated;')
})

integration('deletes an owned project with its data and keeps cleanup and retention rows', async () => {
  const rollback = new Error('rollback isolated migration test')
  await expect(sql!.begin(async sql => {
    const [owner, admin, outsider] = [randomUUID(), randomUUID(), randomUUID()]
    const [doomed, kept, busy] = [`p-${randomUUID()}`, `p-${randomUUID()}`, `p-${randomUUID()}`]
    const [widget, extension] = [randomUUID(), randomUUID()]
    await sql`insert into auth.users(id,email) select id, id || '@example.test' from unnest(${[owner, admin, outsider]}::uuid[]) id`
    await sql`insert into projects(public_key,slug,name) values (${doomed},${doomed},'Doomed'),(${kept},${kept},'Kept'),(${busy},${busy},'Busy')`
    await sql`insert into project_members(project_key,user_id,role,is_owner) values
      (${doomed},${owner},'admin',true),(${doomed},${admin},'admin',false),(${kept},${owner},'admin',true),(${busy},${owner},'admin',true)`
    await sql`insert into comments(id,project_id,source,screenshot_storage_path) values (${widget},${doomed},'widget',${`widget/${doomed}/${widget}`})`
    await sql`insert into comments(id,project_id,source,created_by_user_id,page_hostname,screenshot_storage_path)
      values (${extension},${doomed},'extension',${owner},'app.test',${`ext/${extension}`})`
    await sql`insert into comments(project_id) values (${doomed}),(${kept})`
    await sql`insert into project_invites(project_key,email,invited_by) values (${doomed},'new@example.test',${owner})`
    await sql`insert into feedback_shares(project_id,scope_type,slug,access_token_hash,access_token_ciphertext,created_by,expires_at)
      values (${doomed},'project',${randomUUID()},'h','c','dashboard',now()+interval '1 day')`
    await sql`insert into notifications(user_id,kind,payload) values (${admin},'comment.activity',${sql.json({ projectKey: doomed })}),
      (${admin},'comment.activity',${sql.json({ projectKey: kept })})`
    const remove = async (project: string, actor: string) => (await sql`select delete_owned_project(${project},${actor}) as status`)[0].status
    const count = async (table: string, column: string, project: string) =>
      Number((await sql`select count(*) from ${sql(table)} where ${sql(column)}=${project}`)[0].count)

    expect(await remove(`p-${randomUUID()}`, owner)).toBe('not_found')
    expect(await remove(doomed, admin)).toBe('forbidden')
    expect(await remove(doomed, outsider)).toBe('forbidden')
    expect(await count('projects', 'public_key', doomed)).toBe(1)
    expect(await remove(doomed, owner)).toBe('deleted')
    for (const [table, column] of [['projects', 'public_key'], ['comments', 'project_id'], ['project_members', 'project_key'], ['project_invites', 'project_key'], ['feedback_shares', 'project_id']]) {
      expect(await count(table, column, doomed)).toBe(0)
    }
    expect(Number((await sql`select count(*) from notifications where payload->>'projectKey'=${doomed}`)[0].count)).toBe(0)
    expect(await count('comments', 'project_id', kept)).toBe(1)
    expect(Number((await sql`select count(*) from notifications where payload->>'projectKey'=${kept}`)[0].count)).toBe(1)
    expect((await sql`select storage_path from extension_image_cleanup_jobs where storage_path in ${sql([`widget/${doomed}/${widget}`, `ext/${extension}`])} order by storage_path`)
      .map(row => row.storage_path)).toEqual([`ext/${extension}`, `widget/${doomed}/${widget}`])
    expect((await sql`select id from deleted_extension_feedback where id=${extension}`).length).toBe(1)

    // A tracker export whose result is unknown keeps the whole project, as it keeps a single comment.
    await sql`insert into comments(project_id,github_issue_lease_token,github_issue_lease_expires_at,github_issue_uncertain_at)
      values (${busy},${randomUUID()},now()+interval '1 minute',now())`
    await expect(sql.savepoint(sp => sp`select delete_owned_project(${busy},${owner})`)).rejects.toThrow(/tracker_dispatch_in_progress/)
    expect(await count('projects', 'public_key', busy)).toBe(1)
    throw rollback
  })).rejects.toBe(rollback)
})
