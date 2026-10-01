import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const connection = process.env.DATABASE_URL
const describeDatabase = connection ? describe : describe.skip

describeDatabase('project privacy database guards', () => {
  const sql = postgres(connection as string, { max: 6 })
  const project = `privacy-${randomUUID()}`
  const owner = randomUUID(), member = randomUUID(), comment = randomUUID()
  const workerName = `privacy-worker-${randomUUID()}`
  const worker = postgres(connection as string, { max: 1, connection: { application_name: workerName } })

  beforeAll(async () => {
    await sql`insert into auth.users(id, email) values (${owner}, ${`${owner}@test.local`}), (${member}, ${`${member}@test.local`})`
    await sql`insert into projects(public_key, slug, name) values (${project}, ${project}, 'Privacy test')`
    await sql`insert into project_members(project_key, user_id, role, is_owner) values (${project}, ${owner}, 'admin', true), (${project}, ${member}, 'member', false)`
    await sql`insert into comments(id, project_id, comment, created_by) values (${comment}, ${project}, 'Activity', 'public')`
  })
  afterAll(async () => {
    await sql`delete from comment_email_batches where delivery_id = ${comment}`
    await sql`delete from notifications where payload->>'projectKey' = ${project}`
    await sql`delete from projects where public_key = ${project}`
    await sql`delete from auth.users where id in (${owner}, ${member})`
    await worker.end(); await sql.end()
  })
  async function waitForWorkerLock() {
    await vi.waitFor(async () => {
      const [state] = await sql`select wait_event_type from pg_stat_activity where application_name = ${workerName}`
      expect(state?.wait_event_type).toBe('Lock')
    }, { timeout: 3000, interval: 10 })
  }
  it('blocks and then rejects a guest insertion that overlaps privacy activation', async () => {
    let insertion!: Promise<unknown>
    await sql.begin(async (tx) => {
      await tx`update projects set widget_private=true where public_key=${project}`
      insertion = worker`insert into comments(project_id, comment, created_by) values (${project}, 'Guest race', 'public')`.then(() => null, (error) => error)
      await waitForWorkerLock()
    })
    expect(await insertion).toMatchObject({ message: 'private_feedback_login_required' })
    await sql`insert into comments(project_id, comment, created_by, created_by_user_id) values (${project}, 'Authenticated', 'public', ${member})`
  })
  it('serializes delayed notifications with cleanup and cancels pending email snapshots', async () => {
    await sql`update projects set feedback_access='team' where public_key=${project}`
    await sql`select * from create_or_increment_comment_activity_notification(${member}, ${project}, 'Privacy test', ${comment}, 'Author', 'https://test.local/private')`
    await sql`insert into comment_email_batches(delivery_id, batch_index, body, expires_at) values (${comment}, 0, '[]', now() + interval '1 hour')`
    let notification!: Promise<unknown>
    await sql.begin(async (tx) => {
      await tx`update projects set feedback_access='admins' where public_key=${project}`
      notification = worker`select * from create_or_increment_comment_activity_notification(${member}, ${project}, 'Privacy test', ${comment}, 'Author', 'https://test.local/private')`.then((rows) => rows)
      await waitForWorkerLock()
    })
    expect(await notification).toHaveLength(0)
    expect(await sql`select id from notifications where user_id=${member} and payload->>'projectKey'=${project}`).toHaveLength(0)
    expect((await sql`select status from comment_email_batches where delivery_id=${comment}`)[0].status).toBe('failed')
    expect(await sql`select * from create_or_increment_comment_activity_notification(${owner}, ${project}, 'Privacy test', ${comment}, 'Author', 'https://test.local/private')`).toHaveLength(1)
  })
  it.each(['read', 'update', 'delete'])('serializes public %s with privacy activation', async (operation) => {
    await sql`update projects set widget_private=false, feedback_access='team' where public_key=${project}`
    let result!: Promise<unknown>
    await sql.begin(async tx => {
      await tx`update projects set widget_private=true where public_key=${project}`
      result = (operation === 'read'
        ? worker`select * from read_public_comments(${project})`
        : worker`select * from mutate_public_comment(${project}, ${comment}, 'approved', ${operation === 'delete'})`
      ).then(rows => rows, error => error)
      await waitForWorkerLock()
    })
    expect(await result).toMatchObject({ message: 'private_feedback_login_required' })
    expect(await sql`select id from comments where id=${comment}`).toHaveLength(1)
  })
  it('allows public guest operations but protects authenticated and internal feedback', async () => {
    await sql`update projects set widget_private=false where public_key=${project}`
    expect(await sql`select * from read_public_comments(${project}, 'https://absent.test')`).toHaveLength(0)
    expect((await sql`select * from read_public_comments(${project})`).length).toBeGreaterThan(0)
    expect(await sql`select * from mutate_public_comment(${project}, ${comment}, 'approved')`).toHaveLength(1)
    await expect(sql`select * from mutate_public_comment(${project}, ${comment})`).rejects.toMatchObject({ message: 'invalid_review_status' })
    const [owned] = await sql`select id from comments where project_id=${project} and created_by_user_id=${member}`
    expect(await sql`select * from mutate_public_comment(${project}, ${owned.id}, 'approved', true)`).toHaveLength(0)
    const guest=randomUUID()
    await sql`insert into comments(id, project_id, comment, created_by) values (${guest}, ${project}, 'Disposable', 'public')`
    expect(await sql`select * from mutate_public_comment(${project}, ${guest}, null, true)`).toHaveLength(1)
  })
  it('fences privacy and deletion while a claimed email is in flight, then releases on checkpoint', async () => {
    await sql`update projects set widget_private=true, feedback_access='team' where public_key=${project}`
    await sql`update comment_email_batches set status='pending', attempts=0, next_attempt_at=date_trunc('milliseconds', now()), lease_token=null where delivery_id=${comment}`
    const [batch]=await sql`select id, attempts, next_attempt_at::text as next from comment_email_batches where delivery_id=${comment}`
    const token=randomUUID()
    expect((await sql`select claim_comment_email_batch(${batch.id}, ${batch.attempts}, ${batch.next}, ${token}, now()+interval '2 minutes') as claimed`)[0].claimed).toBe(true)
    await expect(sql`update projects set feedback_access='admins' where public_key=${project}`).rejects.toMatchObject({message:'feedback_delivery_in_progress'})
    await expect(sql`delete from comments where id=${comment}`).rejects.toMatchObject({message:'feedback_delivery_in_progress'})
    await sql`update comment_email_batches set status='sent', lease_token=null where id=${batch.id} and lease_token=${token}`
    await sql`update projects set feedback_access='admins' where public_key=${project}`
  })
  it('cannot claim an email snapshot after a concurrent privacy change cancels it', async () => {
    await sql`update projects set feedback_access='team' where public_key=${project}`
    await sql`update comment_email_batches set status='pending', attempts=0, next_attempt_at=date_trunc('milliseconds', now()) where delivery_id=${comment}`
    const [batch]=await sql`select id, attempts, next_attempt_at::text as next from comment_email_batches where delivery_id=${comment}`
    let result!: Promise<any>
    await sql.begin(async tx=> {
      await tx`update projects set feedback_access='admins' where public_key=${project}`
      result=worker`select claim_comment_email_batch(${batch.id}, ${batch.attempts}, ${batch.next}, ${randomUUID()}, now()+interval '2 minutes') as claimed`.then(rows=>rows)
      await waitForWorkerLock()
    })
    expect((await result)[0].claimed).toBe(false)
  })
  it('binds the RLS helper to the authenticated caller and restricts service RPCs', async () => {
    await sql`update projects set widget_private=true, feedback_access='admins' where public_key=${project}`
    expect((await sql`select to_regprocedure('public.project_feedback_allowed(text,uuid)') as old`)[0].old).toBeNull()
    for(const [user, allowed] of [[owner,true],[member,false]] as const) {
      await sql.begin(async tx=> {
        await tx`set local role authenticated`
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({sub:user,role:'authenticated'})}, true)`
        expect((await tx`select project_feedback_allowed(${project}) as allowed`)[0].allowed).toBe(allowed)
      })
    }
    await expect(sql.begin(async tx=> {await tx`set local role authenticated`; await tx`select * from read_public_comments(${project})`})).rejects.toMatchObject({code:'42501'})
  })
  it('enforces current access in direct authenticated notification reads', async () => {
    await sql`update projects set feedback_access='team' where public_key=${project}`
    await sql`select * from create_or_increment_comment_activity_notification(${member}, ${project}, 'Privacy test', ${comment}, 'Author', 'https://test.local/private')`
    // Simulate a historical row surviving cleanup: the RLS read gate must still
    // deny it after the user is removed, independent of API filtering.
    await sql`delete from project_members where project_key=${project} and user_id=${member}`
    await sql.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: member, role: 'authenticated' })}, true)`
      expect(await tx`select id from notifications where payload->>'projectKey'=${project}`).toHaveLength(0)
    })
  })
})
