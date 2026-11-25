import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { appsumoSql } from './schema.js'

const migration = readFileSync('db/migrations/0053_appsumo_codes.sql', 'utf8')
it('keeps the additive AppSumo migration aligned with schema source', () => {
  expect(migration.endsWith(`--> statement-breakpoint\n${appsumoSql.trim()}\n`)).toBe(true)
  expect(migration).toContain('CREATE TABLE "appsumo_codes"')
  expect(migration).toContain('CREATE UNIQUE INDEX "appsumo_codes_one_per_user"')
  expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/)
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.redeem_appsumo_code(uuid,text), public.revoke_appsumo_code(text) FROM PUBLIC,anon,authenticated;')
  expect(migration).toContain('WHERE code=p_code AND redeemed_at IS NULL')
  const previous = JSON.parse(readFileSync('db/migrations/meta/0052_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0053_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
})

it('moves early users to included_pro before the checks that require it', () => {
  const column = migration.indexOf('ADD COLUMN "included_pro" text')
  const backfill = migration.indexOf(`UPDATE "billing_accounts" SET "included_pro"='early_access' WHERE "is_legacy"`)
  const check = migration.indexOf('ADD CONSTRAINT "billing_accounts_legacy_included_pro"')
  expect(column).toBeGreaterThan(-1)
  expect(backfill).toBeGreaterThan(column)
  expect(check).toBeGreaterThan(backfill)
})

it('grants included Pro from included_pro in every function that used is_legacy', () => {
  for (const grant of [
    'IF b.included_pro IS NOT NULL AND NOT coalesce(',
    'WHERE user_id=OLD.id AND (is_legacy OR included_pro IS NOT NULL)',
    'IF v_billing.included_pro IS NULL AND NOT coalesce(',
    'IF NOT FOUND OR NOT (billing.included_pro IS NOT NULL OR coalesce(',
  ]) expect(appsumoSql).toContain(grant)
  // is_legacy is still reported by cloud_entitlements, but never grants Pro.
  expect(appsumoSql).not.toMatch(/NOT coalesce\(v_billing\.is_legacy|\(coalesce\(billing\.is_legacy|IF b\.is_legacy/)
})
