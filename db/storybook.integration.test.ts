import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.STORYBOOK_DB_TEST === 'true'
const url = process.env.DATABASE_URL || ''
if (enabled && !/^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\/crrt_storybook_backend_test$/.test(url)) throw new Error('Isolated Storybook test database required')
const suite = enabled ? describe : describe.skip
const sql = enabled ? postgres(url, { max: 8 }) : null
const owner = randomUUID(), member = randomUUID(), guest = randomUUID(), outsider = randomUUID()
const project = `storybook-${randomUUID()}`
const connectionId = randomUUID(), otherConnection = randomUUID()
const origin = 'http://localhost:6006'
const hash = 'a'.repeat(64), otherHash = 'b'.repeat(64)
const tokenHash = 'c'.repeat(64)
const payload = { pageUrl: `${origin}/?path=/story/button--primary`, selector: 'storybook://button--primary', x: 50, y: 50, body: 'Feedback\n\n— via Storybook · component: Button · story: Primary · id: button--primary', authorName: 'ada' }
beforeAll(async () => {
  if (!sql) return
  await sql`insert into auth.users(id,email) select id::uuid,id || '@storybook.test' from unnest(${[owner, member, guest, outsider]}::text[]) u(id)`
  await sql`insert into public.projects(public_key,slug,name,widget_private) values (${project},${project},'Storybook',true)`
  await sql`insert into public.project_members(project_key,user_id,role,is_owner) values (${project},${owner},'admin',true),(${project},${member},'member',false),(${project},${guest},'guest',false)`
  await sql`insert into public.storybook_connections(id,project_key,created_by,code_hash,expires_at) values (${connectionId},${project},${owner},${hash},now()+interval '5 minutes'),(${otherConnection},${project},${owner},${otherHash},now()+interval '5 minutes')`
  await sql`insert into public.widget_auth_sessions(code_hash,state_hash,pkce_challenge,user_id,project_key,origin,display_name,handoff_expires_at,token_hash,expires_at,storybook_connection_id)
    values (${'d'.repeat(64)},${'e'.repeat(64)},${'f'.repeat(43)},${member},${project},${origin},'ada',now()+interval '5 minutes',${tokenHash},now()+interval '1 hour',${connectionId})`
})
afterAll(async () => {
  if (!sql) return
  await sql`delete from public.comments where project_id=${project}`
  await sql`delete from public.projects where public_key=${project}`
  await sql`delete from auth.users where id=any(${[owner, member, guest, outsider]}::uuid[])`
  await sql.end()
})
async function blocked(name: string, expected: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rows = await sql!`select count(*)::int as count from pg_stat_activity where application_name=${name} and wait_event_type='Lock'`
    if (rows[0].count === expected) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Competing request did not reach the expected lock')
}
suite('Storybook transactional database boundary', () => {
  it('allows concurrent interrupted-claim retries to return exactly one connection', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => sql!`select id,client from public.claim_storybook_pairing(${hash},${sql!.json({ attempt: index })})`))
    expect(new Set(results.map(result => result[0].id))).toEqual(new Set([connectionId]))
    expect(new Set(results.map(result => JSON.stringify(result[0].client))).size).toBe(1)
    expect((await sql!`select count(*) from public.storybook_connections where code_hash=${hash}`)[0].count).toBe('1')
    expect((await sql!`select claimed_at from public.storybook_connections where id=${connectionId}`)[0].claimed_at).toBeTruthy()
  })
  it('rejects expired codes and ownership revocation even on a retry', async () => {
    await sql!`update public.storybook_connections set created_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute' where id=${otherConnection}`
    await expect(sql!`select * from public.claim_storybook_pairing(${otherHash},'{}')`).rejects.toMatchObject({ message: 'invalid_pairing' })
    await sql!`update public.project_members set is_owner=false where project_key=${project} and user_id=${owner}`
    await expect(sql!`select * from public.claim_storybook_pairing(${hash},'{}')`).rejects.toMatchObject({ message: 'access_denied' })
    await sql!`update public.project_members set is_owner=true where project_key=${project} and user_id=${owner}`
    await expect(sql!`select * from public.claim_storybook_pairing(${'0'.repeat(64)},'{}')`).rejects.toMatchObject({ message: 'invalid_pairing' })
  })
  it('consumes a connection-bound handoff once under concurrent exchanges and rejects mismatched proofs', async () => {
    const code = '9'.repeat(64), state = '8'.repeat(64), challenge = '7'.repeat(43)
    await sql!`insert into public.widget_auth_sessions(code_hash,state_hash,pkce_challenge,user_id,project_key,origin,display_name,handoff_expires_at,expires_at,storybook_connection_id)
      values (${code},${state},${challenge},${member},${project},${origin},'ada',now()+interval '5 minutes',now()+interval '1 hour',${connectionId})`
    const exchange = (index: number, target = connectionId, requestOrigin = origin, requestState = state, pkce = challenge) => sql!`update public.widget_auth_sessions set token_hash=${String(index).padStart(64,'0')}
      where code_hash=${code} and state_hash=${requestState} and pkce_challenge=${pkce} and project_key=${project} and origin=${requestOrigin}
        and storybook_connection_id=${target} and token_hash is null and handoff_expires_at>now() returning code_hash`
    expect(await exchange(10, otherConnection)).toHaveLength(0)
    expect(await exchange(11, connectionId, 'http://localhost:7007')).toHaveLength(0)
    expect(await exchange(12, connectionId, origin, 'wrong-state')).toHaveLength(0)
    expect(await exchange(13, connectionId, origin, state, 'wrong-challenge')).toHaveLength(0)
    const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => exchange(index)))
    expect(attempts.filter(rows => rows.length === 1)).toHaveLength(1)
    expect(await exchange(20)).toHaveLength(0)
  })
  it('stores story context with authenticated identity and default feedback workflow', async () => {
    const rows = await sql!`select public.create_storybook_comment(${connectionId},${member},${origin},${tokenHash},${sql!.json(payload)}) as id`
    const comment = (await sql!`select * from public.comments where id=${rows[0].id}`)[0]
    expect(comment).toMatchObject({ project_id: project, source: 'widget', created_by_user_id: member, author_name: 'ada', url: payload.pageUrl, element: payload.selector, comment: payload.body, status: 'pending', implementation_status: 'unassigned', visibility: 'shared' })
  })
  it('checks current membership, project privacy, connection, exact origin and session expiry at insertion', async () => {
    const send = (actor = member, requestOrigin = origin, id = connectionId) => sql!`select public.create_storybook_comment(${id},${actor},${requestOrigin},${tokenHash},${sql!.json(payload)})`
    await expect(send(outsider)).rejects.toMatchObject({ message: 'forbidden' })
    await expect(send(member, 'http://localhost:7007')).rejects.toMatchObject({ message: 'session_expired' })
    await expect(send(member, origin, otherConnection)).rejects.toMatchObject({ message: 'access_denied' })
    await sql!`update public.projects set feedback_access='admins' where public_key=${project}`
    await expect(send()).rejects.toMatchObject({ message: 'forbidden' })
    await sql!`update public.projects set feedback_access='team' where public_key=${project}`
    await sql!`delete from public.project_members where project_key=${project} and user_id=${member}`
    await expect(send()).rejects.toMatchObject({ message: 'forbidden' })
    await sql!`insert into public.project_members(project_key,user_id,role) values (${project},${member},'member')`
    await sql!`update public.widget_auth_sessions set expires_at=now()-interval '1 second' where token_hash=${tokenHash}`
    await expect(send()).rejects.toMatchObject({ message: 'session_expired' })
    await sql!`update public.widget_auth_sessions set expires_at=now()+interval '1 hour' where token_hash=${tokenHash}`
    await sql!`update public.storybook_connections set revoked_at=now() where id=${connectionId}`
    await expect(send()).rejects.toMatchObject({ message: 'access_denied' })
    await expect(sql!`select * from public.claim_storybook_pairing(${hash},'{}')`).rejects.toMatchObject({ message: 'invalid_pairing' })
    await sql!`update public.storybook_connections set revoked_at=null where id=${connectionId}`
  })
  it('returns an insertion snapshot that cannot acquire subsequent internal workflow metadata', async () => {
    const rows = await sql!`select * from public.create_storybook_comment_snapshot(${connectionId},${member},${origin},${tokenHash},${sql!.json(payload)})`
    const snapshot = rows[0]
    await sql!`select * from public.mutate_actor_feedback(${project},${owner},${snapshot.id},${sql!.json({ visibility: 'internal', implementation_status: 'in_progress', claimed_by_agent_id: 'private-worker' })})`
    const current = (await sql!`select visibility,implementation_status,claimed_by_agent_id from public.comments where id=${snapshot.id}`)[0]
    expect(current).toMatchObject({ visibility: 'internal', implementation_status: 'in_progress', claimed_by_agent_id: 'private-worker' })
    expect(snapshot).toMatchObject({ visibility: 'shared', implementation_status: 'unassigned', claimed_by_agent_id: null })
  })
  it('rechecks a removed origin after waiting for the settings transaction', async () => {
    const name = `storybook-origin-${randomUUID()}`
    const pending = postgres(url, { max: 1, connection: { application_name: name } })
    let request: Promise<any> | undefined
    try {
      await sql!.begin(async tx => {
        await tx`select public_key from public.projects where public_key=${project} for update`
        await tx`update public.projects set allowed_origins=ARRAY['removed.test']::text[] where public_key=${project}`
        request = pending`select * from public.create_storybook_comment_snapshot(${connectionId},${member},${origin},${tokenHash},${pending.json(payload)})`
          .then(rows => ({ rows }), error => ({ error }))
        await blocked(name, 1)
      })
      expect((await request).error).toMatchObject({ message: 'access_denied' })
    } finally {
      await sql!`update public.projects set allowed_origins='{}'::text[] where public_key=${project}`
      await pending.end()
    }
  })
  it('preserves the exact/subdomain allowlist rule and IPv6 host parsing', async () => {
    try {
      for (const [requestOrigin, domains] of [['https://sub.example.com', ['example.com']], ['http://[::1]:6006', ['[::1]']], [origin, ['localhost']]] as const) {
        await sql!`update public.projects set allowed_origins=${[...domains]}::text[] where public_key=${project}`
        await sql!`update public.widget_auth_sessions set origin=${requestOrigin} where token_hash=${tokenHash}`
        expect(await sql!`select id from public.create_storybook_comment_snapshot(${connectionId},${member},${requestOrigin},${tokenHash},${sql!.json(payload)})`).toHaveLength(1)
      }
      await sql!`update public.projects set allowed_origins=ARRAY['host']::text[] where public_key=${project}`
      await expect(sql!`select * from public.create_storybook_comment_snapshot(${connectionId},${member},${origin},${tokenHash},${sql!.json(payload)})`).rejects.toMatchObject({ message: 'access_denied' })
      await expect(sql!`select * from public.create_storybook_comment_snapshot(${connectionId},${member},'invalid-origin',${tokenHash},${sql!.json(payload)})`).rejects.toMatchObject({ message: 'access_denied' })
    } finally {
      await sql!`update public.projects set allowed_origins='{}'::text[] where public_key=${project}`
      await sql!`update public.widget_auth_sessions set origin=${origin} where token_hash=${tokenHash}`
    }
  })
  it('denies former-owner listing and revocation after a concurrent ownership transfer commits', async () => {
    const name = `storybook-owner-${randomUUID()}`
    const pending = postgres(url, { max: 2, connection: { application_name: name } })
    let listing: Promise<any> | undefined, revoking: Promise<any> | undefined
    try {
      await sql!.begin(async tx => {
        await tx`select public.change_project_member_role(${project},${owner},${member},'owner')`
        listing = pending`select public.manage_storybook_connections(${project},${owner},null)`
          .then(rows => ({ rows }), error => ({ error }))
        revoking = pending`select public.manage_storybook_connections(${project},${owner},${connectionId})`
          .then(rows => ({ rows }), error => ({ error }))
        await blocked(name, 2)
      })
      expect((await listing).error).toMatchObject({ message: 'access_denied' })
      expect((await revoking).error).toMatchObject({ message: 'access_denied' })
      expect((await sql!`select revoked_at from public.storybook_connections where id=${connectionId}`)[0].revoked_at).toBeNull()
      const result = (await sql!`select public.manage_storybook_connections(${project},${member},null) as result`)[0].result
      expect(result.connections).toHaveLength(2)
      expect(JSON.stringify(result)).not.toContain('code_hash')
      expect((await sql!`select public.manage_storybook_connections(${project},${member},${connectionId}) as result`)[0].result).toEqual({ revoked: true })
      await expect(sql!`select public.manage_storybook_connections(${project},${member},${randomUUID()})`).rejects.toMatchObject({ message: 'access_denied' })
    } finally {
      await sql!`select public.change_project_member_role(${project},${member},${owner},'owner')`
      await sql!`update public.project_members set role='member' where project_key=${project} and user_id=${member}`
      await sql!`update public.storybook_connections set revoked_at=null where id=${connectionId}`
      await pending.end()
    }
  })
  it('keeps public feedback optional and denies anonymous private feedback', async () => {
    await expect(sql!`insert into public.comments(project_id,source,created_by,url,element,comment) values (${project},'widget','public',${payload.pageUrl},${payload.selector},'private anonymous')`).rejects.toMatchObject({ message: 'private_feedback_login_required' })
    await sql!`update public.projects set widget_private=false where public_key=${project}`
    await sql!`insert into public.comments(project_id,source,created_by,url,element,comment) values (${project},'widget','public',${payload.pageUrl},${payload.selector},'public anonymous')`
    await sql!`update public.projects set widget_private=true where public_key=${project}`
  })
  it('exposes no pairing/session table data or privileged RPC to browser roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect((await sql!`select has_function_privilege(${role},'public.claim_storybook_pairing(text,jsonb)','EXECUTE') as allowed`)[0].allowed).toBe(false)
      expect((await sql!`select has_function_privilege(${role},'public.create_storybook_comment(uuid,uuid,text,text,jsonb)','EXECUTE') as allowed`)[0].allowed).toBe(false)
      expect((await sql!`select has_function_privilege(${role},'public.create_storybook_comment_snapshot(uuid,uuid,text,text,jsonb)','EXECUTE') as allowed`)[0].allowed).toBe(false)
      expect((await sql!`select has_function_privilege(${role},'public.manage_storybook_connections(text,uuid,uuid)','EXECUTE') as allowed`)[0].allowed).toBe(false)
    }
    expect((await sql!`select relrowsecurity from pg_class where oid='public.storybook_connections'::regclass`)[0].relrowsecurity).toBe(true)
  })
})
