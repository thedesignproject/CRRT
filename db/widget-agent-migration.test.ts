import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { widgetAgentShareSql } from './schema.js'

describe('premium widget Agent migration', () => {
  const migration = readFileSync('db/migrations/0034_icy_fabian_cortez.sql', 'utf8')

  it('keeps the additive table change and transactional function together', () => {
    expect(migration).toContain('ADD COLUMN "actor_user_id" uuid')
    expect(migration).toContain('feedback_shares_widget_idempotency_unique')
    expect(migration.endsWith(`${widgetAgentShareSql.trim()}\n`)).toBe(true)
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM/)
  })

  it('records a forward-only Drizzle snapshot', () => {
    const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
    expect(journal.entries.at(-1)).toMatchObject({ idx: 34, tag: '0034_icy_fabian_cortez' })
    expect(journal.entries.at(-1).when).toBeGreaterThan(journal.entries.at(-2).when)
    const previous = JSON.parse(readFileSync('db/migrations/meta/0033_snapshot.json', 'utf8'))
    const current = JSON.parse(readFileSync('db/migrations/meta/0034_snapshot.json', 'utf8'))
    expect(current.prevId).toBe(previous.id)
  })
})
