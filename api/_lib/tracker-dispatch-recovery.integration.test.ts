import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { expect, it, vi } from 'vitest'
import { withTrackerDispatchLock } from './tracker-dispatch-lock.js'

const connection = process.env.DATABASE_URL
it.skipIf(!connection)('keeps acknowledged GitHub recovery available when coordination setup fails', async () => {
  const sql = postgres(connection!, { max: 1 })
  const project = `recovery-setup-${randomUUID()}`, owner = randomUUID(), comment = randomUUID()
  const originalLease = randomUUID(), recoveryLease = randomUUID()
  try {
    await sql`insert into auth.users(id,email) values (${owner},${`${owner}@test.local`})`
    await sql`insert into projects(public_key,slug,name) values (${project},${project},'Recovery setup regression')`
    await sql`insert into project_members(project_key,user_id,role,is_owner) values (${project},${owner},'admin',true)`
    await sql`insert into comments(id,project_id,comment,created_by,github_issue_lease_token,github_issue_lease_expires_at) values (${comment},${project},'Recovery regression','public',${originalLease},now()+interval '2 minutes')`
    expect((await sql`select begin_actor_tracker_dispatch(${project},${owner},${comment},${originalLease},NULL) as dispatched`)[0].dispatched).toBe(true)
    await sql`select acknowledge_tracker_dispatch_stopped(${project},${comment},${originalLease},NULL)`
    expect(await sql`select * from claim_comment_github_issue(${comment},${project},${recoveryLease},120,true)`).toHaveLength(1)
    await expect(sql`select resolve_actor_tracker_dispatch(${project},${owner},${comment},'github')`).rejects.toMatchObject({message:'tracker_dispatch_unconfirmed'})
    vi.stubEnv('DATABASE_URL','')
    const work = vi.fn()
    await expect(withTrackerDispatchLock(project, work, async () => {
      await sql`select acknowledge_tracker_dispatch_stopped(${project},${comment},${recoveryLease},NULL)`
    })).rejects.toThrow('tracker_coordination_unavailable')
    expect(work).not.toHaveBeenCalled()
    expect((await sql`select resolve_actor_tracker_dispatch(${project},${owner},${comment},'github') as resolved`)[0].resolved).toBe(true)
    expect((await sql`select tracker_dispatch_pending(${project}) as pending`)[0].pending).toBe(false)
  } finally {
    vi.unstubAllEnvs()
    await sql`select reset_comment_github_issue_attempt(${comment},${project},${recoveryLease})`
    await sql`delete from projects where public_key=${project}`
    await sql`delete from auth.users where id=${owner}`
    await sql.end()
  }
})
