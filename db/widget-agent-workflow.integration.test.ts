import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.WIDGET_AGENT_DB_TEST === 'true'
const connection = process.env.DATABASE_URL || ''
if (enabled && !/^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):/.test(connection)) throw new Error('Local database required')
const suite = enabled ? describe : describe.skip
const sql = enabled ? postgres(connection, { max: 6 }) : null

const owner = randomUUID()
const member = randomUUID()
const guest = randomUUID()
const outsider = randomUUID()
const project = `widget-workflow-${randomUUID()}`
const page = 'https://site.test/pricing'
const otherPage = 'https://site.test/about'
const ids = {
  open: randomUUID(),
  accepted: randomUUID(),
  rejected: randomUUID(),
  internal: randomUUID(),
  done: randomUUID(),
  otherPage: randomUUID(),
  atomic: randomUUID(),
}

beforeAll(async () => {
  if (!sql) return
  const users = [owner, member, guest, outsider]
  await sql`insert into auth.users(id,email,email_confirmed_at)
    select id::uuid, id || '@workflow.test', now() from unnest(${users}::text[]) ids(id)`
  await sql`insert into public.projects(public_key,slug,name) values (${project},${project},'Widget workflow')`
  await sql`insert into public.project_members(project_key,user_id,role,is_owner) values
    (${project},${owner},'admin',true), (${project},${member},'member',false), (${project},${guest},'guest',false)`
  await sql`insert into public.comments(id,project_id,url,element,comment,status,visibility,implementation_status,claimed_by_agent_id) values
    (${ids.open},${project},${page},'#open','Open work','pending','shared','unassigned',null),
    (${ids.accepted},${project},${page},'#accepted','Accepted work','approved','shared','in_progress','agent-1'),
    (${ids.rejected},${project},${page},'#rejected','Rejected work','rejected','shared','unassigned',null),
    (${ids.internal},${project},${page},'#internal','Internal work','pending','internal','unassigned',null),
    (${ids.done},${project},${page},'#done','Done work','approved','shared','done',null),
    (${ids.otherPage},${project},${otherPage},'#other','Other page','pending','shared','unassigned',null),
    (${ids.atomic},${project},${page},'#atomic','Atomic work','pending','shared','unassigned',null)`
})

afterAll(async () => {
  if (!sql) return
  await sql`delete from public.comments where project_id=${project}`
  await sql`delete from public.projects where public_key=${project}`
  await sql`delete from auth.users where id = any(${[owner, member, guest, outsider]}::uuid[])`
  await sql.end()
})

suite('widget Agent workflow database boundary', () => {
  it('returns only actionable shared feedback for the exact page to authorized operators', async () => {
    const ownerRows = await sql!`select id from public.read_widget_agent_feedback(${project},${owner},${page})`
    const memberRows = await sql!`select id from public.read_widget_agent_feedback(${project},${member},${page})`
    const expected = [ids.open, ids.accepted, ids.atomic].sort()
    expect(ownerRows.map((row) => row.id).sort()).toEqual(expected)
    expect(memberRows.map((row) => row.id).sort()).toEqual(expected)
    await expect(sql!`select id from public.read_widget_agent_feedback(${project},${guest},${page})`).rejects.toMatchObject({ message: 'forbidden' })
    await expect(sql!`select id from public.read_widget_agent_feedback(${project},${outsider},${page})`).rejects.toMatchObject({ message: 'forbidden' })
  })

  it('applies exact accept, reject, and resolve transitions', async () => {
    const accepted = await sql!`select id,status from public.mutate_widget_feedback_batch(
      ${project},${owner},${page},${[ids.open]}::uuid[],'accept')`
    expect(accepted[0]).toMatchObject({ id: ids.open, status: 'approved' })

    const resolved = await sql!`select id,implementation_status,claimed_by_agent_id from public.mutate_widget_feedback_batch(
      ${project},${owner},${page},${[ids.accepted]}::uuid[],'resolve')`
    expect(resolved[0]).toMatchObject({ id: ids.accepted, implementation_status: 'done', claimed_by_agent_id: null })

    const rejected = await sql!`select id,status from public.mutate_widget_feedback_batch(
      ${project},${member},${page},${[ids.atomic]}::uuid[],'reject')`
    expect(rejected[0]).toMatchObject({ id: ids.atomic, status: 'rejected' })
  })

  it('rejects malformed or mixed-page batches atomically', async () => {
    await expect(sql!`select id from public.mutate_widget_feedback_batch(
      ${project},${owner},${page},${[ids.open, ids.otherPage]}::uuid[],'reject')`).rejects.toMatchObject({ message: 'invalid_selection' })
    expect((await sql!`select status from public.comments where id=${ids.open}`)[0].status).toBe('approved')

    await expect(sql!`select id from public.mutate_widget_feedback_batch(
      ${project},${owner},${page},${[ids.open, ids.open]}::uuid[],'accept')`).rejects.toMatchObject({ message: 'invalid_selection' })
    await expect(sql!`select id from public.mutate_widget_feedback_batch(
      ${project},${owner},${page},${[ids.open]}::uuid[],'unknown')`).rejects.toMatchObject({ message: 'invalid_widget_feedback_request' })
  })

  it('rechecks current private-project visibility on every operation', async () => {
    await sql!`update public.projects set widget_private=true,feedback_access='admins' where public_key=${project}`
    await expect(sql!`select id from public.read_widget_agent_feedback(${project},${member},${page})`).rejects.toMatchObject({ message: 'forbidden' })
    await expect(sql!`select id from public.mutate_widget_feedback_batch(
      ${project},${member},${page},${[ids.open]}::uuid[],'accept')`).rejects.toMatchObject({ message: 'forbidden' })
    expect((await sql!`select count(*)::int as count from public.read_widget_agent_feedback(${project},${owner},${page})`)[0].count).toBeGreaterThan(0)
  })
})
