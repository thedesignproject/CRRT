import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { widgetAgentWorkflowSql, widgetAgentWorkflowUpgradeSql } from './schema.js'

describe('widget Agent workflow migration', () => {
  const migration = readFileSync('db/migrations/0036_widget_agent_workflow.sql', 'utf8')

  it('matches the schema source and keeps exact actor-bound operations', () => {
    expect(migration).toBe(`${widgetAgentWorkflowSql.trim()}\n`)
    expect(migration).toContain("lock_feedback_actor(p_project,p_actor,'agent:operate')")
    expect(migration).toContain("lock_feedback_actor(p_project,p_actor,'feedback:manage')")
    expect(migration).toContain("p_action NOT IN ('accept','reject','resolve')")
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/)
  })

  it('records a forward-only linked snapshot', () => {
    const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
    expect(journal.entries.find((entry: { idx: number }) => entry.idx === 36)).toMatchObject({ idx: 36, tag: '0036_widget_agent_workflow' })
    const previous = JSON.parse(readFileSync('db/migrations/meta/0035_snapshot.json', 'utf8'))
    const current = JSON.parse(readFileSync('db/migrations/meta/0036_snapshot.json', 'utf8'))
    expect(current.prevId).toBe(previous.id)
    expect(current.tables).toEqual(previous.tables)
  })
})

it('reasserts workflow functions after a deployed seat repair without rewriting 0036', () => {
  const migration = readFileSync('db/migrations/0039_widget_agent_workflow_upgrade.sql', 'utf8')
  expect(migration).toBe(`${widgetAgentWorkflowUpgradeSql.trim()}\n`)
  expect(migration).not.toMatch(/DROP |CREATE FUNCTION /)
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.read_widget_agent_feedback')
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.mutate_widget_feedback_batch')
  const previous = JSON.parse(readFileSync('db/migrations/meta/0038_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0039_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
  expect(current.tables).toEqual(previous.tables)
})

