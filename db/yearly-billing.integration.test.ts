// @vitest-environment node
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

// Disposable database only: this suite temporarily enables enforcement.
const url = process.env.YEARLY_BILLING_TEST_DATABASE_URL
const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null
const integration = sql ? describe : describe.skip
afterAll(async () => { if (sql) await sql.end() })

integration('annual subscriptions with monthly usage windows', () => {
  it.each([
    ['2025-02-28T10:00:00Z', '2025-03-31T10:00:00Z', '2025-03-30T12:00:00Z', '2025-02-28T10:00:00Z', '2025-03-31T10:00:00Z'],
    ['2024-02-29T10:00:00Z', '2024-03-31T10:00:00Z', '2024-03-30T12:00:00Z', '2024-02-29T10:00:00Z', '2024-03-31T10:00:00Z'],
    ['2025-04-30T10:00:00Z', '2025-05-31T10:00:00Z', '2025-05-30T12:00:00Z', '2025-04-30T10:00:00Z', '2025-05-31T10:00:00Z'],
    ['2024-01-31T10:00:00Z', '2025-01-31T10:00:00Z', '2024-02-29T09:59:59Z', '2024-01-31T10:00:00Z', '2024-02-29T10:00:00Z'],
    ['2024-01-31T10:00:00Z', '2025-01-31T10:00:00Z', '2024-02-29T10:00:00Z', '2024-02-29T10:00:00Z', '2024-03-31T10:00:00Z'],
    ['2024-01-31T10:00:00Z', '2025-01-31T10:00:00Z', '2024-03-30T12:00:00Z', '2024-02-29T10:00:00Z', '2024-03-31T10:00:00Z'],
    ['2025-01-31T10:00:00Z', '2026-01-31T10:00:00Z', '2025-02-28T10:00:00Z', '2025-02-28T10:00:00Z', '2025-03-31T10:00:00Z'],
    ['2026-10-01T10:00:00Z', '2026-10-15T10:00:00Z', '2026-10-02T10:00:00Z', '2026-10-01T10:00:00Z', '2026-10-15T10:00:00Z'],
  ])('anchors %s to calendar months without drift', async (start, end, now, expectedStart, expectedEnd) => {
    const [window] = await sql!`select * from cloud_usage_window(${start}::timestamptz,${end}::timestamptz,${now}::timestamptz)`
    expect(window.window_start.toISOString()).toBe(new Date(expectedStart).toISOString())
    expect(window.window_end.toISOString()).toBe(new Date(expectedEnd).toISOString())
  })

  it.each([['2026-01-01', '2027-01-01', '2025-12-31'], ['2026-01-01', '2027-01-01', '2027-01-01'], [null, '2027-01-01', '2026-06-01'], ['2026-01-01', null, '2026-06-01']])('has no usage window outside a valid subscription', async (start, end, now) => {
    expect(await sql!`select * from cloud_usage_window(${start}::timestamptz,${end}::timestamptz,${now}::timestamptz)`).toHaveLength(0)
  })

  it('resets annual comment and audit usage monthly while preserving consumed credits and access', async () => {
    const owner = randomUUID()
    try {
      await sql!.begin(async tx => {
        await tx`update cloud_plan_settings set enabled=false`
        await tx`insert into auth.users(id,email) values(${owner},${owner+'@test.local'})`
        await tx`insert into billing_accounts(user_id,plan,subscription_status,period_start,period_end)
          values(${owner},'pro','active',date_trunc('second',now())-interval '6 months',date_trunc('second',now())+interval '6 months')`
        await tx`update cloud_plan_settings set enabled=true`
        const [window] = await tx`select w.* from billing_accounts b cross join lateral cloud_usage_window(b.period_start,b.period_end) w where b.user_id=${owner}`
        for (const resource of ['comments', 'product_audits']) {
          await tx`insert into cloud_usage(resource_id,resource,owner_id,window_start,window_end)
            values(${randomUUID()},${resource},${owner},${window.window_start}::timestamptz-interval '1 month',${window.window_start})`
          expect((await tx`select cloud_usage_count(${owner},${resource}) as used`)[0].used).toBe(0)
          const id = randomUUID()
          await tx`select cloud_charge(${owner},${resource},${id})`
          await tx`select cloud_charge(${owner},${resource},${id})`
          expect((await tx`select cloud_usage_count(${owner},${resource}) as used`)[0].used).toBe(1)
        }
        const [entitlement] = await tx`select cloud_entitlements(${owner}) as value`
        expect(entitlement.value).toMatchObject({ canWrite: true, usage: { comments: 1, product_audits: 1 } })
        expect(new Date(entitlement.value.resetAt).toISOString()).toBe(window.window_end.toISOString())
        await tx`insert into cloud_usage(resource_id,resource,owner_id,window_start,window_end)
          select gen_random_uuid(),'comments',${owner},${window.window_start},${window.window_end} from generate_series(1,1999)`
        expect((await tx`select cloud_usage_count(${owner},'comments') as used`)[0].used).toBe(2000)
        await expect(tx.savepoint(sp => sp`select cloud_charge(${owner},'comments',${randomUUID()})`)).rejects.toThrow('cloud_plan_limit')
        // Roll back every fixture and the temporary enforcement setting.
        throw new Error('rollback yearly fixtures')
      })
    } catch (error) {
      if ((error as Error).message !== 'rollback yearly fixtures') throw error
    }
  })

  it('keeps consumed quota until the end of a full monthly period', async () => {
    const owner = randomUUID()
    try {
      await sql!.begin(async tx => {
        await tx`update cloud_plan_settings set enabled=false`
        await tx`insert into auth.users(id,email) values(${owner},${owner+'@test.local'})`
        await tx`insert into billing_accounts(user_id,plan,subscription_status,period_start,period_end)
          values(${owner},'pro','active',date_trunc('second',now())-interval '1 month',date_trunc('second',now())+interval '1 day')`
        await tx`update cloud_plan_settings set enabled=true`
        await tx`insert into cloud_usage(resource_id,resource,owner_id,window_start,window_end)
          select gen_random_uuid(),'comments',user_id,period_start,period_end from billing_accounts,
          generate_series(1,2000) where user_id=${owner}`
        expect((await tx`select cloud_usage_count(${owner},'comments') as used`)[0].used).toBe(2000)
        const [row] = await tx`select cloud_entitlements(${owner}) as value,period_end from billing_accounts where user_id=${owner}`
        expect(new Date(row.value.resetAt).toISOString()).toBe(row.period_end.toISOString())
        await expect(tx.savepoint(sp => sp`select cloud_charge(${owner},'comments',${randomUUID()})`)).rejects.toThrow('cloud_plan_limit')
        throw new Error('rollback monthly fixtures')
      })
    } catch (error) {
      if ((error as Error).message !== 'rollback monthly fixtures') throw error
    }
  })

  it('denies public execution of the window helper', async () => {
    for (const role of ['anon', 'authenticated']) {
      const [row] = await sql!`select has_function_privilege(${role},'public.cloud_usage_window(timestamptz,timestamptz,timestamptz)','execute') as allowed`
      expect(row.allowed).toBe(false)
    }
  })

  it('preserves legacy Pro access and paid annual Studio windows after migration 0043', async () => {
    const owner = randomUUID()
    try {
      await sql!.begin(async tx => {
        await tx`update cloud_plan_settings set enabled=false`
        await tx`insert into auth.users(id,email) values(${owner},${owner+'@test.local'})`
        await tx`insert into billing_accounts(user_id,is_legacy) values(${owner},true)`
        await tx`update cloud_plan_settings set enabled=true`
        const summary = async () => (await tx`select cloud_entitlements(${owner}) as value`)[0].value
        expect(await summary()).toMatchObject({ isLegacy: true, plan: 'pro', status: 'legacy', canWrite: true })
        const comment = randomUUID()
        await tx`select cloud_charge(${owner},'comments',${comment})`
        await tx`select cloud_charge(${owner},'comments',${comment})`
        await tx`select cloud_charge(${owner},'product_audits',${randomUUID()})`
        expect(await summary()).toMatchObject({ usage: { comments: 1, product_audits: 1 }, limits: { comments: 2000, product_audits: 5 } })

        await tx`update billing_accounts set plan='studio',subscription_status='active',
          period_start=date_trunc('second',now())-interval '6 months',
          period_end=date_trunc('second',now())+interval '6 months' where user_id=${owner}`
        const [window] = await tx`select w.* from cloud_effective_account(${owner}) b cross join lateral cloud_usage_window(b.period_start,b.period_end) w`
        await tx`select cloud_charge(${owner},'comments',${randomUUID()})`
        const paid = await summary()
        expect(paid).toMatchObject({ isLegacy: true, plan: 'studio', status: 'active', canWrite: true, usage: { comments: 1, product_audits: 0 }, limits: { comments: 10000, product_audits: 30 } })
        expect(new Date(paid.resetAt).toISOString()).toBe(window.window_end.toISOString())

        await tx`update billing_accounts set subscription_status='canceled',period_end=now()-interval '1 day' where user_id=${owner}`
        expect(await summary()).toMatchObject({ isLegacy: true, plan: 'pro', status: 'legacy', canWrite: true, usage: { comments: 1, product_audits: 1 } })
        await tx`insert into cloud_usage(resource_id,resource,owner_id,window_start,window_end)
          select gen_random_uuid(),'comments',${owner},period_start,period_end
          from cloud_effective_account(${owner}),generate_series(1,1999)`
        await expect(tx.savepoint(sp => sp`select cloud_charge(${owner},'comments',${randomUUID()})`)).rejects.toThrow('cloud_plan_limit')
        throw new Error('rollback legacy annual fixtures')
      })
    } catch (error) {
      if ((error as Error).message !== 'rollback legacy annual fixtures') throw error
    }
  })
})
