import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { agentCollaboratorSeatsSql, agentCollaboratorSeatsUpgradeSql } from './schema.js'

describe('Agent collaborator seat migration', () => {
  const migration = readFileSync('db/migrations/0035_agent_collaborator_seats.sql', 'utf8')

  it('matches the reviewed schema source and remains forward-only', () => {
    expect(migration).toBe(`${agentCollaboratorSeatsSql.trim()}\n`)
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM public\.project_members/)
  })

  it('enforces one fixed five-person allowance at every membership boundary', () => {
    expect(migration).toContain('public.agent_collaborator_usage(p_owner) <= 5')
    expect(migration).toContain('public.agent_collaborator_usage(v_owner) >= 5')
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF project_key, email, role ON public.project_invites')
    expect(migration).toContain('BEFORE INSERT OR DELETE OR UPDATE OF role ON public.project_members')
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('crrt-agent-seats:'")
    expect(migration).toContain('CREATE FUNCTION public.accept_project_invite_with_seat')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_widget_agent_share')
  })

  it('records a linked custom migration snapshot', () => {
    const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
    expect(journal.entries.find((entry: { idx: number }) => entry.idx === 35)).toMatchObject({ idx: 35, tag: '0035_agent_collaborator_seats' })
    const previous = JSON.parse(readFileSync('db/migrations/meta/0034_snapshot.json', 'utf8'))
    const current = JSON.parse(readFileSync('db/migrations/meta/0035_snapshot.json', 'utf8'))
    expect(current.prevId).toBe(previous.id)
    expect(current.tables).toEqual(previous.tables)
  })
})

it('consolidates the ownership and seat fences in one forward repair', () => {
  const migration = readFileSync('db/migrations/0038_agent_collaborator_seats_upgrade.sql', 'utf8')
  expect(migration).toBe(`${agentCollaboratorSeatsUpgradeSql.trim()}\n`)
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.agent_collaborator_usage')
  expect(migration).toContain('DROP TRIGGER IF EXISTS zz_enforce_agent_invite_seat ON public.project_invites')
  expect(migration).toContain('DROP TRIGGER IF EXISTS zz_enforce_agent_member_seat ON public.project_members')
  expect(migration).toContain('WHERE p.public_key = NEW.project_key FOR SHARE;')
  expect(migration).toContain("IF TG_OP = 'INSERT' THEN")
  expect(migration).toContain("IF TG_OP = 'UPDATE' AND NEW.is_owner AND NOT OLD.is_owner")
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.change_project_member_role(')
  expect(migration).toContain('WHERE sponsor IS NOT NULL ORDER BY sponsor')
  expect(migration).toContain("v_result->>'status' = 'updated'")
  expect(migration).toContain('public.agent_collaborator_usage(p_target_user_id) > 5')
  expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM public\.project_members/)
  const journal = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8'))
  const repairs = journal.entries.filter((entry: { idx: number }) => entry.idx >= 37)
  expect(repairs.map((entry: { idx: number }) => entry.idx)).toContain(38)
  const previous = JSON.parse(readFileSync('db/migrations/meta/0037_snapshot.json', 'utf8'))
  const current = JSON.parse(readFileSync('db/migrations/meta/0038_snapshot.json', 'utf8'))
  expect(current.prevId).toBe(previous.id)
  expect(current.tables).toEqual(previous.tables)
})
