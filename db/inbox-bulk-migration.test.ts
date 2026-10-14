import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { inboxBulkAssignmentSql, extensionImageCleanupSql, approvedWidgetHandoffSql } from './schema.js'

it('keeps the local 0040 helpers in sync with schema source and restricts cleanup storage', () => {
  const migration = readFileSync('db/migrations/0040_inbox_bulk_assignment.sql', 'utf8')
  for (const source of [inboxBulkAssignmentSql, extensionImageCleanupSql, approvedWidgetHandoffSql]) expect(migration).toContain(source.trim())
  expect(migration).toContain('ALTER TABLE "extension_image_cleanup_jobs" ENABLE ROW LEVEL SECURITY')
  expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/)
  const previous = JSON.parse(readFileSync('db/migrations/meta/0039_snapshot.json', 'utf8'))
  const snapshot = JSON.parse(readFileSync('db/migrations/meta/0040_snapshot.json', 'utf8'))
  expect(snapshot.prevId).toBe(previous.id)
  expect(snapshot.tables['public.extension_image_cleanup_jobs']).toMatchObject({ isRLSEnabled: true })
  expect(Object.keys(snapshot.tables).filter(name => !previous.tables[name])).toEqual(['public.extension_image_cleanup_jobs'])
})
