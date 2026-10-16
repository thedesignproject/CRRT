import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { legacyBillingSql, yearlyBillingWindowsSql } from './schema.js'

it('keeps one annual billing migration linked directly to the parent schema', () => {
  expect(readFileSync('db/migrations/0044_yearly_billing_windows.sql', 'utf8')).toBe(yearlyBillingWindowsSql.trim()+'\n')
  const previous = JSON.parse(readFileSync('db/migrations/meta/0043_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0044_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
  expect(current.tables).toEqual(previous.tables)
  const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
  expect(journal.entries.filter((entry: { idx: number }) => entry.idx > 43).map((entry: { tag: string }) => entry.tag))
    .toEqual(['0044_yearly_billing_windows'])
  expect(journal.entries.slice(-2).map((entry: { tag: string }) => entry.tag))
    .toEqual(['0043_legacy_users', '0044_yearly_billing_windows'])
  expect(journal.entries.at(-1).when).toBeGreaterThan(journal.entries.at(-2).when)
  expect(readFileSync('db/migrations/0043_legacy_users.sql', 'utf8'))
    .toBe('ALTER TABLE "billing_accounts" ADD COLUMN "is_legacy" boolean DEFAULT false NOT NULL;\n--> statement-breakpoint\n'+legacyBillingSql.trim()+'\n')
})
