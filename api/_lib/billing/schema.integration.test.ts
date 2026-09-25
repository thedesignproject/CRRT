// @vitest-environment node
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

// Run only against the disposable billing test database documented below.
const connection = process.env.BILLING_TEST_DATABASE_URL
const sql = connection ? postgres(connection, { max: 4 }) : null
const integration = sql ? describe : describe.skip
const users: string[] = []
afterAll(async () => {
  if (!sql) return
  if (users.length) {
    await sql`delete from billing_accounts where user_id in ${sql(users)}`
    await sql`delete from auth.users where id in ${sql(users)}`
  }
  await sql.end()
})
async function account() {
  const user = randomUUID(); users.push(user)
  await sql!`insert into auth.users (id) values (${user})`
  await sql!`insert into billing_accounts (user_id) values (${user})`
  return user
}
integration('billing migration and account concurrency', () => {
  it('provides safe defaults, unique customer ownership, and foreign keys', async () => {
    const first = await account(); const second = await account()
    const [row] = await sql!`select * from billing_accounts where user_id = ${first}`
    expect(row).toMatchObject({ customer_id: null, subscription_status: null, cancel_at_period_end: false, lock_token: null })
    expect(row.checkout_attempt).toMatch(/^[a-f0-9-]{36}$/)
    const customer = `cus_${randomUUID()}`
    await sql!`update billing_accounts set customer_id = ${customer} where user_id = ${first}`
    await expect(sql!`update billing_accounts set customer_id = ${customer} where user_id = ${second}`).rejects.toThrow()
    await expect(sql!`insert into billing_accounts (user_id) values (${randomUUID()})`).rejects.toThrow()
    await expect(sql!`delete from auth.users where id = ${first}`).rejects.toThrow()
  })
  it('allows exactly one concurrent lease and fences an expired worker', async () => {
    const user = await account()
    const tokens = [randomUUID(), randomUUID()]
    const results = await Promise.all(tokens.map((token) => sql!`
      update billing_accounts set lock_token = ${token}, lock_expires_at = now() + interval '2 minutes'
      where user_id = ${user} and (lock_expires_at is null or lock_expires_at < now()) returning lock_token
    `))
    expect(results.map((rows) => rows.length).sort()).toEqual([0, 1])
    const old = results.flat()[0].lock_token
    await sql!`update billing_accounts set lock_expires_at = now() - interval '1 second' where user_id = ${user}`
    const fresh = randomUUID()
    await sql!`update billing_accounts set lock_token = ${fresh} where user_id = ${user} and lock_expires_at < now()`
    expect(await sql!`update billing_accounts set customer_id = 'stale' where user_id = ${user} and lock_token = ${old} returning user_id`).toHaveLength(0)
    expect(await sql!`update billing_accounts set lock_token = null where user_id = ${user} and lock_token = ${old} returning user_id`).toHaveLength(0)
  })
  it('denies authenticated and anonymous direct reads even when table access is granted', async () => {
    await account()
    for (const role of ['anon', 'authenticated']) {
      await sql!.begin(async (tx) => {
        await tx`grant select on billing_accounts, billing_webhook_events to anon, authenticated`
        await tx.unsafe(`set local role ${role}`)
        expect(await tx`select * from billing_accounts`).toHaveLength(0)
        expect(await tx`select * from billing_webhook_events`).toHaveLength(0)
      })
    }
  })
})
