import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { storybookSql, storybookFencesSql } from './schema.js'
describe('Storybook migration', () => {
  const migration = readFileSync('db/migrations/0042_storybook_private_feedback.sql', 'utf8')
  it('keeps the additive schema and transaction helpers in one migration', () => {
    expect(migration).toContain('CREATE TABLE "storybook_connections"')
    expect(migration).toContain('ADD COLUMN "storybook_connection_id" uuid')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/)
    expect(migration).toContain(storybookSql.trim())
    expect(migration.endsWith(`${storybookFencesSql.trim()}\n`)).toBe(true)
  })
  it('links one generated snapshot to its predecessor', () => {
    const previous = JSON.parse(readFileSync('db/migrations/meta/0041_snapshot.json', 'utf8'))
    const current = JSON.parse(readFileSync('db/migrations/meta/0042_snapshot.json', 'utf8'))
    expect(current.prevId).toBe(previous.id)
    const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
    expect(journal.entries.filter((entry: { idx: number }) => entry.idx >= 42).map((entry: { tag: string }) => entry.tag)).toEqual(['0042_storybook_private_feedback'])
  })
})
