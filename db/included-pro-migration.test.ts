import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, expect, it } from 'vitest'
import { includedProSql } from './schema.js'

const migration = readFileSync('db/migrations/0054_included_pro.sql', 'utf8')
it('keeps the included_pro migration aligned with schema source', () => {
  expect(migration.endsWith(`--> statement-breakpoint\n${includedProSql.trim()}\n`)).toBe(true)
  expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/)
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.redeem_appsumo_code(uuid,text), public.revoke_appsumo_code(text) FROM PUBLIC,anon,authenticated;')
  const previous = JSON.parse(readFileSync('db/migrations/meta/0053_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0054_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
})

it('moves every grant to included_pro before the checks that require it', () => {
  const column = migration.indexOf('ADD COLUMN "included_pro" text')
  const backfill = migration.indexOf(`UPDATE "billing_accounts" b SET "included_pro"=`)
  const check = migration.indexOf('ADD CONSTRAINT "billing_accounts_legacy_included_pro"')
  expect(column).toBeGreaterThan(-1)
  expect(backfill).toBeGreaterThan(column)
  expect(check).toBeGreaterThan(backfill)
})

it('grants included Pro from included_pro in every function that used is_legacy', () => {
  for (const grant of [
    'IF b.included_pro IS NOT NULL AND NOT coalesce(',
    'WHERE user_id=OLD.id\n    AND customer_id IS NULL',
    'IF v_billing.included_pro IS NULL AND NOT coalesce(',
    'IF NOT FOUND OR NOT (billing.included_pro IS NOT NULL OR coalesce(',
  ]) expect(includedProSql).toContain(grant)
  expect(includedProSql).toContain('CREATE TRIGGER delete_unbilled_account BEFORE DELETE ON auth.users')
  expect(includedProSql).not.toContain('FUNCTION public.delete_unbilled_legacy_account')
  // is_legacy is still reported by cloud_entitlements, but never grants Pro.
  expect(includedProSql).not.toMatch(/NOT coalesce\(v_billing\.is_legacy|\(coalesce\(billing\.is_legacy|IF b\.is_legacy/)
})

// Only a disposable database migrated through 0053, with no other test runner.
// This suite applies 0054 itself, inside a transaction it rolls back.
const url = process.env.INCLUDED_PRO_MIGRATION_TEST_DATABASE_URL
const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null
afterAll(async () => { await sql?.end() })
const integration = sql ? it : it.skip
integration('upgrades early users and buyers who redeemed under 0053 without losing Pro', async () => {
  const rollback = new Error('rollback isolated migration test')
  await expect(sql!.begin(async sql => {
    const early = randomUUID(), buyer = randomUUID(), earlyBuyer = randomUUID(), paid = randomUUID(), [code1, code2] = [randomUUID(), randomUUID()]
    await sql`insert into auth.users(id,email) select id, id || '@example.test' from unnest(${[early, buyer, earlyBuyer, paid]}::uuid[]) id`
    await sql`insert into billing_accounts(user_id,is_legacy) values (${early},true),(${earlyBuyer},true)`
    await sql`insert into billing_accounts(user_id,plan,subscription_status) values (${paid},'pro','active')`
    await sql`insert into appsumo_codes(code) values (${code1}),(${code2})`
    expect((await sql`select redeem_appsumo_code(${buyer}::uuid,${code1}) as r`)[0].r).toBe('redeemed')
    expect((await sql`select redeem_appsumo_code(${earlyBuyer}::uuid,${code2}) as r`)[0].r).toBe('redeemed')
    await sql.unsafe(migration)
    const rows = await sql`select user_id,is_legacy,included_pro from billing_accounts where user_id in ${sql([early, buyer, earlyBuyer, paid])}`
    const byUser = Object.fromEntries(rows.map(row => [row.user_id, [row.is_legacy, row.included_pro]]))
    expect(byUser).toEqual({ [early]: [true, 'early_access'], [buyer]: [true, 'appsumo'], [earlyBuyer]: [true, 'appsumo'], [paid]: [false, null] })
    await sql`update cloud_plan_settings set enabled=true`
    for (const owner of [early, buyer, earlyBuyer]) {
      expect((await sql`select cloud_entitlements(${owner}) as v`)[0].v).toMatchObject({ plan: 'pro', status: 'legacy', canWrite: true })
    }
    expect((await sql`select redeem_appsumo_code(${paid}::uuid,${randomUUID()}) as r`)[0].r).toBe('invalid_code')
    throw rollback
  })).rejects.toBe(rollback)
})
