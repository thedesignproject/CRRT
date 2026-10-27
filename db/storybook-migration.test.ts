import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { storybookSql, storybookFencesSql, storybookScreenshotSql } from './schema.js'
describe('Storybook migration', () => {
  const migration = readFileSync('db/migrations/0042_storybook_private_feedback.sql', 'utf8')
  const screenshotMigration = readFileSync('db/migrations/0045_storybook_screenshots.sql', 'utf8')
  it('keeps the additive schema and transaction helpers in one migration', () => {
    expect(migration).toContain('CREATE TABLE "storybook_connections"')
    expect(migration).toContain('ADD COLUMN "storybook_connection_id" uuid')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/)
    expect(migration).toContain(storybookSql.trim())
    expect(migration.endsWith(`${storybookFencesSql.trim()}\n`)).toBe(true)
  })
  it('adds screenshots by replacing the insertion function without mutating 0042', () => {
    expect(screenshotMigration).toBe(`${storybookScreenshotSql.trim()}\n`)
    expect(screenshotMigration).toContain('screenshot_storage_path')
    expect(screenshotMigration).not.toMatch(/DROP TABLE|DROP COLUMN/)
  })
  it('links generated snapshots to their predecessors', () => {
    const cloudPlans = JSON.parse(readFileSync('db/migrations/meta/0041_snapshot.json', 'utf8'))
    const privateFeedback = JSON.parse(readFileSync('db/migrations/meta/0042_snapshot.json', 'utf8'))
    const legacyUsers = JSON.parse(readFileSync('db/migrations/meta/0043_snapshot.json', 'utf8'))
    const yearlyBilling = JSON.parse(readFileSync('db/migrations/meta/0044_snapshot.json', 'utf8'))
    const screenshots = JSON.parse(readFileSync('db/migrations/meta/0045_snapshot.json', 'utf8'))
    expect(privateFeedback.prevId).toBe(cloudPlans.id)
    expect(legacyUsers.prevId).toBe(privateFeedback.id)
    expect(yearlyBilling.prevId).toBe(legacyUsers.id)
    expect(screenshots.prevId).toBe(yearlyBilling.id)
    const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
    expect(journal.entries.filter((entry: { idx: number }) => entry.idx >= 42 && entry.idx <= 45).map((entry: { tag: string }) => entry.tag)).toEqual([
      '0042_storybook_private_feedback',
      '0043_legacy_users',
      '0044_yearly_billing_windows',
      '0045_storybook_screenshots',
    ])
  })
})
