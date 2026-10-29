// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { mcpSql, mcpWorkflowSql } from './schema'
it('ships the schema-sourced MCP routines and deny-all workflow storage in one migration', () => {
  const migration = readFileSync('db/migrations/0046_mcp_scoped.sql', 'utf8')
  expect(migration).toContain(mcpSql.trim())
  expect(migration).toContain(mcpWorkflowSql.trim())
  expect(migration).toContain('ALTER TABLE "mcp_workflows" ENABLE ROW LEVEL SECURITY')
  expect(migration).not.toMatch(/CREATE POLICY.*mcp_/)
  const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
  expect(journal.entries.filter((row: { idx: number }) => row.idx === 46).map((row: { tag: string }) => row.tag)).toEqual(['0046_mcp_scoped'])
})

it('serializes conflicting retries before reading the request hash or comment', () => {
  const routine = mcpWorkflowSql.slice(mcpWorkflowSql.indexOf('CREATE FUNCTION public.mcp_work_operation'))
  expect(routine.indexOf("crrt-mcp-op:")).toBeLessThan(routine.indexOf('SELECT * INTO feedback'))
  expect(routine.indexOf("crrt-mcp-op:")).toBeLessThan(routine.indexOf("mcpRequestHash"))
})
