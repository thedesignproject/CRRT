import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A disposable database migrated through 0053.
const url = process.env.APPSUMO_TEST_DATABASE_URL
const sql = url ? postgres(url, { max: 4, onnotice: () => {} }) : null
const integration = sql ? describe : describe.skip
afterAll(async () => { await sql?.end() })

integration('AppSumo redemption on Postgres', () => {
  const prefix = `it-${randomUUID()}-`
  beforeAll(async () => { await sql!`insert into cloud_plan_settings(id,enabled) values (1,true) on conflict (id) do update set enabled=true` })
  async function user() {
    const id = randomUUID()
    await sql!`insert into auth.users(id,email) values (${id},${id + '@appsumo.test'})`
    return id
  }
  async function code() {
    const value = prefix + randomUUID()
    await sql!`insert into appsumo_codes(code) values (${value})`
    return value
  }
  const redeem = (owner: string, value: string, connection = sql!) =>
    connection`select redeem_appsumo_code(${owner}::uuid,${value}) as outcome`.then(rows => rows[0].outcome as string)

  it('grants Pro limits and labels the plan as AppSumo', async () => {
    const owner = await user(), value = await code()
    expect(await redeem(owner, value)).toBe('redeemed')
    const [entitlements] = await sql!`select cloud_entitlements(${owner}) as value`
    expect(entitlements.value).toMatchObject({ includedPro: 'appsumo', isLegacy: false, plan: 'pro', status: 'legacy', canWrite: true,
      limits: { projects: 10, internal_users: 10, comments: 2000, product_audits: 5 } })
  })
  it('keeps an existing Stripe subscription in effect after redemption', async () => {
    const owner = await user(), value = await code()
    await sql!`insert into billing_accounts(user_id,plan,price_id,subscription_status,customer_id,period_start,period_end)
      values (${owner},'studio','price_studio','active',${'cus_' + owner},now()-interval '1 day',now()+interval '29 days')`
    expect(await redeem(owner, value)).toBe('redeemed')
    const [row] = await sql!`select * from billing_accounts where user_id=${owner}`
    expect(row).toMatchObject({ included_pro: 'appsumo', is_legacy: false, plan: 'studio', subscription_status: 'active', customer_id: 'cus_' + owner })
  })
  it('rejects invalid, case-changed, used and second codes', async () => {
    const first = await user(), second = await user(), value = await code(), other = await code()
    expect(await redeem(first, 'missing-' + randomUUID())).toBe('invalid_code')
    expect(await redeem(first, value.toUpperCase())).toBe('invalid_code')
    expect(await redeem(first, value)).toBe('redeemed')
    expect(await redeem(second, value)).toBe('already_redeemed')
    expect(await redeem(first, other)).toBe('already_has_plan')
    expect((await sql!`select redeemed_by_user_id from appsumo_codes where code=${other}`)[0].redeemed_by_user_id).toBeNull()
  })
  it('lets exactly one concurrent buyer claim a code', async () => {
    const buyers = await Promise.all([user(), user(), user()]), value = await code()
    const outcomes = await Promise.all(buyers.map(buyer => redeem(buyer, value)))
    expect(outcomes.filter(outcome => outcome === 'redeemed')).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome === 'already_redeemed')).toHaveLength(2)
  })
  it('lets one user claim only one of two codes submitted at once', async () => {
    const owner = await user(), codes = await Promise.all([code(), code()])
    const outcomes = await Promise.all(codes.map(value => redeem(owner, value)))
    expect(outcomes.sort()).toEqual(['already_has_plan', 'redeemed'])
  })
  it('rate-limits failed guesses per user without blocking other users', async () => {
    const owner = await user(), other = await user(), value = await code()
    for (let attempt = 0; attempt < 10; attempt++) expect(await redeem(owner, 'guess-' + attempt)).toBe('invalid_code')
    expect(await redeem(owner, value)).toBe('rate_limited')
    expect(await redeem(other, value)).toBe('redeemed')
  })
  it('locks Pro in for an early user and returns them to early access after a refund', async () => {
    const owner = await user(), value = await code(), next = await code()
    await sql!`insert into billing_accounts(user_id,is_legacy,included_pro) values (${owner},true,'early_access')`
    expect(await redeem(owner, value)).toBe('redeemed')
    expect((await sql!`select is_legacy,included_pro from billing_accounts where user_id=${owner}`)[0]).toEqual({ is_legacy: true, included_pro: 'appsumo' })
    expect((await sql!`select revoke_appsumo_code(${value}) as revoked`)[0].revoked).toBe(true)
    expect((await sql!`select is_legacy,included_pro from billing_accounts where user_id=${owner}`)[0]).toEqual({ is_legacy: true, included_pro: 'early_access' })
    // The refunded code stays used; the buyer may redeem a different one.
    expect(await redeem(await user(), value)).toBe('already_redeemed')
    expect(await redeem(owner, next)).toBe('redeemed')
  })
  it('removes included Pro from a refunded buyer who was not an early user', async () => {
    const owner = await user(), value = await code()
    expect(await redeem(owner, value)).toBe('redeemed')
    expect((await sql!`select revoke_appsumo_code(${value}) as revoked`)[0].revoked).toBe(true)
    expect((await sql!`select revoke_appsumo_code(${value}) as revoked`)[0].revoked).toBe(false)
    expect((await sql!`select included_pro from billing_accounts where user_id=${owner}`)[0].included_pro).toBeNull()
    const [entitlements] = await sql!`select cloud_entitlements(${owner}) as value`
    expect(entitlements.value).toMatchObject({ includedPro: null, canWrite: false })
  })
  it('never lets an early user lose included Pro, and accepts only known reasons', async () => {
    const owner = await user()
    await sql!`insert into billing_accounts(user_id,is_legacy,included_pro) values (${owner},true,'early_access')`
    await expect(sql!`update billing_accounts set included_pro=null where user_id=${owner}`).rejects.toThrow('billing_accounts_legacy_included_pro')
    await expect(sql!`update billing_accounts set included_pro='gift' where user_id=${owner}`).rejects.toThrow('billing_accounts_included_pro')
    await expect(sql!`insert into billing_accounts(user_id,is_legacy) values (${await user()},true)`).rejects.toThrow('billing_accounts_legacy_included_pro')
  })
  it('is callable only by the service role', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const fn of ['public.redeem_appsumo_code(uuid,text)', 'public.revoke_appsumo_code(text)']) {
        const [row] = await sql!`select has_function_privilege(${role},${fn},'EXECUTE') as allowed`
        expect(row.allowed).toBe(false)
      }
    }
  })
})
