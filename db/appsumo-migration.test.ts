import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { appsumoSql } from './schema.js'

const migration = readFileSync('db/migrations/0053_appsumo_codes.sql', 'utf8')
it('keeps the additive AppSumo migration aligned with schema source', () => {
  expect(migration.endsWith(`--> statement-breakpoint\n${appsumoSql.trim()}\n`)).toBe(true)
  expect(migration).toContain('CREATE TABLE "appsumo_codes"')
  expect(migration).toContain('CREATE UNIQUE INDEX "appsumo_codes_one_per_user"')
  expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/)
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.redeem_appsumo_code(uuid,text,integer) FROM PUBLIC,anon,authenticated;')
  expect(migration).toContain('WHERE code=p_code AND redeemed_at IS NULL')
  const previous = JSON.parse(readFileSync('db/migrations/meta/0052_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0053_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
})
