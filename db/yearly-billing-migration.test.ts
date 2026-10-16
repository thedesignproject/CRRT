import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { yearlyBillingWindowsSql } from './schema.js'

it('keeps one annual billing migration linked directly to the parent schema', () => {
  expect(readFileSync('db/migrations/0043_yearly_billing_windows.sql', 'utf8')).toBe(yearlyBillingWindowsSql.trim()+'\n')
  const previous = JSON.parse(readFileSync('db/migrations/meta/0042_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0043_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
  expect(current.tables).toEqual(previous.tables)
  const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
  expect(journal.entries.filter((entry: { idx: number }) => entry.idx > 42).map((entry: { tag: string }) => entry.tag))
    .toEqual(['0043_yearly_billing_windows'])
})
