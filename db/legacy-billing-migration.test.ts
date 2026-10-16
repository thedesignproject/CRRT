import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, expect, it } from 'vitest'
import { legacyBillingSql } from './schema.js'

const migration = readFileSync('db/migrations/0043_legacy_users.sql', 'utf8')
it('keeps the generated additive migration and legacy functions aligned with schema source', () => {
  expect(migration).toBe(`ALTER TABLE "billing_accounts" ADD COLUMN "is_legacy" boolean DEFAULT false NOT NULL;\n--> statement-breakpoint\n${legacyBillingSql.trim()}\n`)
  expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/)
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_approved_widget_agent_share(')
  expect(migration).toContain('PERFORM 1 FROM public.billing_accounts WHERE user_id=v_owner FOR SHARE;')
  expect(migration).toContain("p_allowed_prices IS DISTINCT FROM ARRAY['community']::text[]")
  const previous = JSON.parse(readFileSync('db/migrations/meta/0042_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0043_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
})

// Only a disposable database migrated through 0042, with no other test runner.
// This suite applies 0043 itself to test the before/after signup boundary.
const url = process.env.LEGACY_BILLING_TEST_DATABASE_URL
const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null
afterAll(async () => { await sql?.end() })
const integration = sql ? it : it.skip
integration('snapshots all existing users once, preserves paid state, and enforces legacy Pro after Studio', async () => {
  const rollback = new Error('rollback isolated migration test')
  await expect(sql!.begin(async transaction => {
    const sql = transaction
    const early = randomUUID(), paid = randomUUID(), fresh = randomUUID()
    const customer = 'cus_'+paid
    await sql!`insert into cloud_plan_settings(id,enabled) values (1,false) on conflict (id) do update set enabled=false`
    await sql!`insert into auth.users(id,email) values (${early},${early+'@example.com'}),(${paid},${paid+'@example.com'})`
    await sql!`insert into billing_accounts(user_id,customer_id,plan,subscription_status,period_start,period_end,trial_used)
      values (${paid},${customer},'studio','active',now()-interval '1 day',now()+interval '29 days',true)`
    await sql!.unsafe(migration)
    expect((await sql!`select * from billing_accounts where user_id=${paid}`)[0]).toMatchObject({
      is_legacy: true, customer_id: customer, plan: 'studio', subscription_status: 'active', trial_used: true,
    })
    await sql!`insert into auth.users(id,email) values (${fresh},${fresh+'@example.com'})`
    await sql!`insert into billing_accounts(user_id) values (${fresh})`
    expect((await sql!`select is_legacy from billing_accounts where user_id=${fresh}`)[0].is_legacy).toBe(false)
    // Removing an untouched legacy user cleans only the backfilled placeholder.
    const unbilled = randomUUID(), busy = randomUUID()
    await sql!`insert into auth.users(id,email) values (${unbilled},${unbilled+'@example.com'}),(${busy},${busy+'@example.com'})`
    await sql!`insert into billing_accounts(user_id,is_legacy) values (${unbilled},true),(${busy},true)`
    await sql!`delete from auth.users where id=${unbilled}`
    expect(await sql!`select * from billing_accounts where user_id=${unbilled}`).toHaveLength(0)
    await expect(sql.savepoint(tx => tx`delete from auth.users where id=${paid}`)).rejects.toThrow('billing_accounts_user_id_users_id_fk')
    expect(await sql!`select * from billing_accounts where user_id=${paid}`).toHaveLength(1)
    await sql!`update billing_accounts set lock_token=gen_random_uuid(),lock_expires_at=now()+interval '2 minutes' where user_id=${busy}`
    await expect(sql.savepoint(tx => tx`delete from auth.users where id=${busy}`)).rejects.toThrow('billing_accounts_user_id_users_id_fk')
    await sql!`update billing_accounts set lock_expires_at=now()-interval '1 second' where user_id=${busy}`
    await sql!`delete from auth.users where id=${busy}`
    expect(await sql!`select * from billing_accounts where user_id=${busy}`).toHaveLength(0)
    await sql!`update cloud_plan_settings set enabled=true`
    const entitlement = async (owner: string) => (await sql!`select cloud_entitlements(${owner}) as value`)[0].value
    expect(await entitlement(early)).toMatchObject({isLegacy:true,plan:'pro',status:'legacy',canWrite:true,limits:{projects:10,internal_users:10,comments:2000,product_audits:5}})
    expect(await entitlement(paid)).toMatchObject({isLegacy:true,plan:'studio',status:'active',canWrite:true,limits:{projects:50}})
    expect(await entitlement(fresh)).toMatchObject({isLegacy:false,plan:null,canWrite:false})
    await expect(sql.savepoint(tx => tx`select cloud_validate_write(${fresh})`)).rejects.toThrow('cloud_plan_limit')
    const [window] = await sql!`select period_start,period_end from cloud_effective_account(${early})`
    expect(window.period_start.toISOString()).toBe(new Date().toISOString().slice(0,7)+'-01T00:00:00.000Z')
    expect(window.period_end.getTime()).toBeGreaterThan(Date.now())
    // The ordinary comment trigger consumes included Pro quota, even without Stripe.
    const project = 'legacy-'+randomUUID()
    await sql!`select claim_project(${early},${project},'Legacy')`
    await sql!`insert into comments(project_id,url,x,y,element,comment,created_by,status)
      values (${project},'https://example.com',0,0,'body','Legacy feedback','widget','approved')`
    expect((await entitlement(early)).usage.comments).toBe(1)
    const [comment] = await sql!`select id from comments where project_id=${project}`
    // The approved widget handoff uses the same legacy entitlement as other writes.
    await sql!`select * from create_approved_widget_agent_share(${project},${early},'https://example.com',
      'legacy-handoff-test-key',${'a'.repeat(64)},ARRAY['price_pro']::text[],
      ${sql!.json({slug:randomUUID(),access_token_hash:randomUUID(),access_token_ciphertext:'cipher',expires_at:new Date(Date.now()+86400000).toISOString()})},ARRAY[${comment.id}::uuid])`
    await sql!`insert into cloud_usage(resource_id,resource,owner_id,window_start,window_end)
      select gen_random_uuid(),'comments',${early},period_start,period_end from cloud_effective_account(${early}),generate_series(1,1999)`
    await expect(sql.savepoint(tx => tx`insert into comments(project_id,url,x,y,element,comment,created_by)
      values (${project},'https://example.com',0,0,'body','Over quota','widget')`)).rejects.toThrow('cloud_plan_limit')
    await sql!`insert into cloud_usage(resource_id,resource,owner_id,window_start,window_end)
      values (gen_random_uuid(),'product_audits',${early},${window.period_start},${window.period_end})`
    expect((await entitlement(early)).usage.product_audits).toBe(1)
    await sql!`update cloud_usage set window_start=window_start-interval '1 month',window_end=window_start where owner_id=${early}`
    expect((await entitlement(early)).usage).toMatchObject({comments:0,product_audits:0})
    for (const status of ['canceled','unpaid','past_due','incomplete','paused']) {
      await sql!`update billing_accounts set subscription_status=${status} where user_id=${paid}`
      expect(await entitlement(paid)).toMatchObject({isLegacy:true,plan:'pro',status:'legacy',canWrite:true,limits:{projects:10,comments:2000}})
    }
    // Even an expired but still-active Stripe record cannot retain Studio capacity.
    await sql!`update billing_accounts set subscription_status='active',period_end=now()-interval '1 second' where user_id=${paid}`
    expect(await entitlement(paid)).toMatchObject({plan:'pro',status:'legacy',canWrite:true})
    await sql!`update billing_accounts set plan=null,subscription_status=null,period_start=null,period_end=null where user_id=${paid}`
    expect(await entitlement(paid)).toMatchObject({plan:'pro',status:'legacy',canWrite:true})
    for (const role of ['anon','authenticated']) {
      expect((await sql!`select has_function_privilege(${role},'public.delete_unbilled_legacy_account()','EXECUTE') as allowed`)[0].allowed).toBe(false)
      const [privilege] = await sql!`select has_function_privilege(${role},'public.cloud_effective_account(uuid)','EXECUTE') as allowed`
      expect(privilege.allowed).toBe(false)
    }
    throw rollback
  })).rejects.toBe(rollback)
})
