// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { mcpProjectSetupSql } from './schema'
it('ships the schema-sourced routine and additive OAuth scope constraints', () => {
  const migration = readFileSync('db/migrations/0047_red_black_tom.sql', 'utf8')
  expect(migration).toContain(mcpProjectSetupSql.trim())
  expect(migration).toContain("'crrt:read crrt:projects'")
  expect(migration).not.toMatch(/DROP TABLE|DELETE FROM|UPDATE .*mcp_connections/)
  expect(mcpProjectSetupSql).toContain("mcp_require_connection(p_connection,p_actor,'crrt:projects')")
  expect(mcpProjectSetupSql).toContain('REVOKE ALL')
})
