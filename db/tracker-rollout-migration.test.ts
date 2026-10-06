import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { projectPrivacyLegacyRecoverySql, projectPrivacyDispatchSql, projectPrivacyRecoverySql } from './schema.js'

describe('tracker recovery rollout migration', () => {
  it('preserves the applied 0032 migration byte for byte', () => {
    expect(createHash('sha256').update(readFileSync('db/migrations/0032_serious_victor_mancha.sql')).digest('hex')).toBe('4680f520131705a902ebcf6144cfbf322ad887ba162ad75f4251af3cae2d10e3')
  })
  it('renders the forward migration from the schema function sources', () => {
    const expected = [projectPrivacyLegacyRecoverySql, projectPrivacyDispatchSql, projectPrivacyRecoverySql]
      .map(sql => sql.trim().replaceAll('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'))
      .join('\n--> statement-breakpoint\n') + '\n'
    expect(readFileSync('db/migrations/0033_tracker_recovery_rollout.sql','utf8')).toBe(expected)
  })
  it('adds a forward-only journal entry without changing table shapes', () => {
    const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json','utf8'))
    const entryIndex = journal.entries.findIndex((entry: { idx: number }) => entry.idx === 33)
    expect(journal.entries[entryIndex]).toMatchObject({ idx: 33, tag: '0033_tracker_recovery_rollout' })
    expect(journal.entries[entryIndex].when).toBeGreaterThan(journal.entries[entryIndex - 1].when)
    const previous = JSON.parse(readFileSync('db/migrations/meta/0032_snapshot.json','utf8'))
    const current = JSON.parse(readFileSync('db/migrations/meta/0033_snapshot.json','utf8'))
    expect(current.prevId).toBe(previous.id)
    expect(current.tables).toEqual(previous.tables)
    expect(readFileSync('db/migrations/0033_tracker_recovery_rollout.sql','utf8')).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM public\.comments|ALTER TABLE/)
  })
})
