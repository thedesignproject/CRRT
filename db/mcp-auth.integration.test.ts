// @vitest-environment node
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createProof, hashProof, pkceChallenge } from '../api/_lib/extension-auth-contracts.js'
const local = process.env.MCP_TEST_LOCAL === '1'
const suite = local ? describe : describe.skip
suite('MCP authorization transactions on local Docker Postgres', () => {
  const url = process.env.DATABASE_URL!
  if (local && !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('MCP tests require a loopback database')
  const sql = postgres(url || 'postgres://localhost/unused', { max: 5 })
  const user = randomUUID(), client = randomUUID()
  const resource = 'http://127.0.0.1:3001/api/mcp/v1', redirect = 'http://localhost:8765/callback'
  const challenge = pkceChallenge(createProof())
  async function grant() {
    const hash = hashProof(createProof()), access = hashProof(createProof()), refresh = hashProof(createProof())
    await sql`insert into mcp_codes(hash,user_id,client_id,redirect_uri,challenge,state_hash,resource,expires_at)
      values(${hash},${user},${client},${redirect},${challenge},${hash},${resource},now()+interval '5 minutes')`
    return { hash, access, refresh }
  }
  const exchange = async (g: Awaited<ReturnType<typeof grant>>, overrides: { client?: string; redirect?: string; challenge?: string; resource?: string } = {}) =>
    (await sql`select mcp_exchange(${g.hash},${overrides.client ?? client},${overrides.redirect ?? redirect},${overrides.challenge ?? challenge},${overrides.resource ?? resource},${g.access},${g.refresh}) as id`)[0].id
  beforeAll(async () => {
    await sql`insert into auth.users(id,email) values(${user},${`${user}@mcp.test`})`
    await sql`insert into mcp_clients(id,name,redirect_uris) values(${client},'MCP transaction test',${[redirect]})`
  })
  afterAll(async () => {
    await sql`delete from auth.users where id=${user}`
    await sql`delete from mcp_clients where id=${client}`
    await sql`delete from mcp_limits where key=${client}`
    await sql.end()
  })
  it('binds codes to the client, exact callback, PKCE, resource, expiry, and enabled client', async () => {
    const g = await grant()
    for (const overrides of [{ client: randomUUID() }, { redirect: `${redirect}?wrong` }, { challenge: pkceChallenge(createProof()) }, { resource: 'https://wrong.test' }]) expect(await exchange(g, overrides)).toBeNull()
    await sql`update mcp_clients set revoked_at=now() where id=${client}`
    expect(await exchange(g)).toBeNull()
    await sql`update mcp_clients set revoked_at=null where id=${client}`
    await sql`update mcp_codes set created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' where hash=${g.hash}`
    expect(await exchange(g)).toBeNull()
  })
  it('consumes a code only once across concurrent exchanges and rejects replay', async () => {
    const g = await grant()
    const results = await Promise.all([exchange(g), exchange({ ...g, access: hashProof(createProof()), refresh: hashProof(createProof()) })])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await exchange(g)).toBeNull()
  })
  it('rotates refresh tokens and revokes the family on replay', async () => {
    const g = await grant(); const connection = await exchange(g)
    const access = hashProof(createProof()), refresh = hashProof(createProof())
    expect((await sql`select mcp_refresh(${g.refresh},${client},${resource},${access},${refresh}) as id`)[0].id).toBe(connection)
    expect(await sql`select * from mcp_identity(${access},${resource})`).toHaveLength(1)
    expect((await sql`select mcp_refresh(${g.refresh},${client},${resource},${hashProof(createProof())},${hashProof(createProof())}) as id`)[0].id).toBeNull()
    expect(await sql`select * from mcp_identity(${access},${resource})`).toHaveLength(0)
  })
  it('serializes concurrent refresh and invalidates the family when the consumed token is retried', async () => {
    const g = await grant(); await exchange(g)
    const rotate = () => sql`select mcp_refresh(${g.refresh},${client},${resource},${hashProof(createProof())},${hashProof(createProof())}) as id`
    const results = await Promise.all([rotate(), rotate()])
    expect(results.filter(rows => rows[0].id)).toHaveLength(1)
    expect(await sql`select * from mcp_identity(${g.access},${resource})`).toHaveLength(0)
  })
  it('checks access credential type, expiry, user status, and immediate revocation', async () => {
    const g = await grant(); await exchange(g)
    expect(await sql`select * from mcp_identity(${g.refresh},${resource})`).toHaveLength(0)
    expect(await sql`select * from mcp_identity(${g.access},'https://wrong.test')`).toHaveLength(0)
    await sql`update auth.users set banned_until=now()+interval '1 hour' where id=${user}`
    expect(await sql`select * from mcp_identity(${g.access},${resource})`).toHaveLength(0)
    await sql`update auth.users set banned_until=null where id=${user}`
    expect(await sql`select * from mcp_identity(${g.access},${resource})`).toHaveLength(1)
    await sql`select mcp_revoke(${g.access},${client})`
    expect(await sql`select * from mcp_identity(${g.access},${resource})`).toHaveLength(0)
    const expired = await grant(); await exchange(expired)
    await sql`update mcp_credentials set created_at=now()-interval '1 hour',expires_at=now()-interval '50 minutes' where hash=${expired.access}`
    expect(await sql`select * from mcp_identity(${expired.access},${resource})`).toHaveLength(0)
  })
  it('bounds code lifetimes and prevents browser-role access to records and RPCs', async () => {
    const g = await grant()
    await expect(sql`update mcp_codes set expires_at=now()+interval '1 hour' where hash=${g.hash}`).rejects.toMatchObject({ code: '23514' })
    for (const role of ['anon', 'authenticated']) {
      await sql.begin(async tx => {
        await tx.unsafe(`set local role ${role}`)
        // Depending on default grants, RLS returns no rows or the table grant denies access.
        const [{ allowed }] = await tx`select has_function_privilege(current_user,'public.mcp_exchange(text,uuid,text,text,text,text,text)','execute') as allowed`
        expect(allowed).toBe(false)
      })
    }
    const [{ secure }] = await sql`select bool_and(relrowsecurity) as secure from pg_class where relname in ('mcp_clients','mcp_codes','mcp_connections','mcp_credentials','mcp_limits')`
    expect(secure).toBe(true)
  })
  it('reserves durable limits atomically and resets at the next window', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => sql`select mcp_reserve(${client},3) as allowed`))
    expect(results.filter(rows => rows[0].allowed)).toHaveLength(3)
    await sql`update mcp_limits set window_start=now()-interval '2 minutes' where key=${client}`
    expect((await sql`select mcp_reserve(${client},3) as allowed`)[0].allowed).toBe(true)
    await sql`select mcp_cleanup()`
  })
})
