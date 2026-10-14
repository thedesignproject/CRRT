import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

// Only a disposable database bootstrapped through 0041; never a shared database.
const url = process.env.CLOUD_PLANS_TEST_DATABASE_URL
const sql = url ? postgres(url, { max: 8, onnotice: () => {} }) : null
const integration = sql ? describe : describe.skip
const owner = randomUUID()
const project = `plan-${randomUUID()}`
async function user() {
  const id = randomUUID()
  await sql!`insert into auth.users(id,email) values (${id},${id+'@example.com'})`
  return id
}
async function comment(id = randomUUID()) {
  return sql!`insert into comments(id,project_id,url,x,y,element,comment,created_by)
    values (${id},${project},'https://example.com',0,0,'body','test','widget') returning id`
}
async function usage(resource: string, count: number) {
  await sql!`insert into cloud_usage(resource_id,resource,owner_id,window_start,window_end)
    select gen_random_uuid(),${resource},user_id,period_start,period_end from billing_accounts,
    generate_series(1,${count}) where user_id=${owner}`
}
afterAll(async () => { if (sql) { await sql`update cloud_plan_settings set enabled=false`; await sql.end() } })
integration('Cloud plan database admission', () => {
  beforeEach(async () => {
    await sql!`update cloud_plan_settings set enabled=false`
    await sql!`truncate cloud_usage, billing_accounts, projects, auth.users cascade`
    await sql!`insert into auth.users(id,email) values (${owner},'owner@example.com')`
    await sql!`insert into billing_accounts(user_id,plan,subscription_status,period_start,period_end)
      values (${owner},'pro','active',now()-interval '1 day',now()+interval '29 days')`
    await sql!`select claim_project(${owner},${project},'Test')`
    await sql!`update cloud_plan_settings set enabled=true`
  })
  it('blocks unowned public project creation and rolls it back', async () => {
    await expect(sql!`insert into projects(public_key,slug,name) values ('unowned','unowned','Unowned')`).rejects.toThrow('cloud_plan_limit')
    expect(await sql!`select * from projects where public_key='unowned'`).toHaveLength(0)
  })
  it('serializes concurrent comments at the last slot; deletion never refunds', async () => {
    await usage('comments',1999)
    const results = await Promise.allSettled([comment(),comment()])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1)
    await sql!`delete from comments where project_id=${project}`
    expect((await sql!`select cloud_usage_count(${owner},'comments') as count`)[0].count).toBe(2000)
    await expect(comment()).rejects.toThrow('cloud_plan_limit')
  })
  it('does not charge edits and resets by billing window rather than deletion', async () => {
    const [created] = await comment()
    await sql!`update comments set comment='edit' where id=${created.id}`
    expect((await sql!`select cloud_usage_count(${owner},'comments') as count`)[0].count).toBe(1)
    await sql!`update billing_accounts set period_start=now(),period_end=now()+interval '1 month' where user_id=${owner}`
    expect((await sql!`select cloud_usage_count(${owner},'comments') as count`)[0].count).toBe(0)
    await comment()
    expect((await sql!`select count(*)::int as count from cloud_usage`)[0].count).toBe(2)
  })
  it('reserves unique internal identities including owner, releases expired invitations, and exempts guests', async () => {
    for (let i=0;i<9;i++) await sql!`insert into project_invites(project_key,email,invited_by) values (${project},${'invite'+i+'@example.com'},${owner})`
    await expect(sql!`insert into project_invites(project_key,email,invited_by) values (${project},'extra@example.com',${owner})`).rejects.toThrow('cloud_plan_limit')
    await sql!`insert into project_invites(project_key,email,role,invited_by) values (${project},'guest@example.com','guest',${owner})`
    await sql!`update project_invites set expires_at=now()-interval '1 day' where email='invite0@example.com'`
    await sql!`insert into project_invites(project_key,email,invited_by) values (${project},'extra@example.com',${owner})`
    expect((await sql!`select count(*)::int as count from cloud_internal_identities(${owner})`)[0].count).toBe(10)
  })
  it('counts an invited person once when they join and across projects', async () => {
    const member=await user()
    await sql!`insert into project_invites(project_key,email,invited_by) values (${project},${member+'@example.com'},${owner})`
    await sql!`insert into project_members(project_key,user_id,role) values (${project},${member},'member')`
    await sql!`select claim_project(${owner},'second','Second')`
    await sql!`insert into project_members(project_key,user_id,role) values ('second',${member},'member')`
    expect((await sql!`select count(*)::int as count from cloud_internal_identities(${owner})`)[0].count).toBe(2)
  })
  it('serializes project creation at capacity and preserves existing data on downgrade', async () => {
    for (let i=0;i<8;i++) await sql!`select claim_project(${owner},${'project'+i},'Test')`
    const results=await Promise.allSettled(['last-a','last-b'].map(key=>sql!`select claim_project(${owner},${key},'Test')`))
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    await sql!`update billing_accounts set plan='studio' where user_id=${owner}`
    await sql!`select claim_project(${owner},'eleventh','Test')`
    await sql!`update billing_accounts set plan='pro' where user_id=${owner}`
    await expect(sql!`select claim_project(${owner},'twelfth','Test')`).rejects.toThrow('cloud_plan_limit')
    await comment()
    expect(await sql!`select * from projects`).toHaveLength(11)
  })
  it.each(['canceled','unpaid','past_due','incomplete','paused'])('retains reads and blocks writes for %s', async status => {
    await comment()
    await sql!`update billing_accounts set subscription_status=${status} where user_id=${owner}`
    await expect(comment()).rejects.toThrow('cloud_plan_limit')
    expect(await sql!`select * from comments where project_id=${project}`).toHaveLength(1)
  })
  it('permits a configured grace period, rejects expired periods, and supports trialing', async () => {
    await sql!`update billing_accounts set subscription_status='past_due',grace_until=now()+interval '1 hour' where user_id=${owner}`
    await comment()
    await sql!`update billing_accounts set period_end=now()-interval '1 second' where user_id=${owner}`
    await expect(comment()).rejects.toThrow('cloud_plan_limit')
    await sql!`update billing_accounts set subscription_status='trialing',period_end=now()+interval '14 days' where user_id=${owner}`
    await comment()
  })
  it('reserves audit credits once and refunds failure in its original window', async () => {
    const input = [project,owner,randomUUID(),'https://example.com']
    async function audit() { return sql!.unsafe(`select create_audit_run('project',$1,$2,$3,null,null,null,$4,$4,'live','{}','{}','{}',null) as result`,input) }
    const [first]=await audit(); const [retry]=await audit()
    expect(first.result.status).toBe('created'); expect(retry.result.status).toBe('existing')
    expect((await sql!`select cloud_usage_count(${owner},'product_audits') as count`)[0].count).toBe(1)
    await sql!`select mark_audit_run_failed(${first.result.auditId},'internal','Failed')`
    await sql!`select mark_audit_run_failed(${first.result.auditId},'internal','Failed')`
    expect((await sql!`select cloud_usage_count(${owner},'product_audits') as count`)[0].count).toBe(0)
    await usage('product_audits',5)
    await expect(sql!.unsafe(`select create_audit_run('project',$1,$2,$3,null,null,null,$4,$4,'live','{}','{}','{}',null)`,[project,owner,randomUUID(),'https://example.com'])).rejects.toThrow('cloud_plan_limit')
  })
  it('keeps Community working without billing and without the former five-person cap', async () => {
    await sql!`update cloud_plan_settings set enabled=false`
    await sql!`delete from billing_accounts`
    for(let i=0;i<12;i++) await sql!`insert into project_invites(project_key,email,invited_by) values (${project},${'community'+i+'@example.com'},${owner})`
    await comment()
    expect(await sql!`select * from cloud_usage`).toHaveLength(0)
  })

  it('imports once, protects owner scope, and rolls back an over-quota local project',async()=>{
    const localId=randomUUID()
    const input=[{id:localId,pageUrl:'https://example.com/',pageHostname:'example.com',selector:'body',body:'Local',x:1,y:2,reviewStatus:'accepted'}]
    const [first]=await sql!`select import_cloud_feedback(${owner},${project},'Local',${sql!.json(input)}) as result`
    const [retry]=await sql!`select import_cloud_feedback(${owner},${project},'Local',${sql!.json(input)}) as result`
    expect(first.result.imported).toBe(1);expect(retry.result.imported).toBe(0)
    expect((await sql!`select status,implementation_status from comments where id=${localId}`)[0]).toMatchObject({status:'approved',implementation_status:'done'})
    expect((await sql!`select cloud_usage_count(${owner},'comments') as count`)[0].count).toBe(1)
    const outsider=await user()
    await expect(sql!`select import_cloud_feedback(${outsider},${project},'Local','[]')`).rejects.toThrow('forbidden')
    await usage('comments',1999)
    await expect(sql!`select import_cloud_feedback(${owner},'new-local','Local',${sql!.json([{...input[0],id:randomUUID()}])})`).rejects.toThrow('cloud_plan_limit')
    expect(await sql!`select * from projects where public_key='new-local'`).toHaveLength(0)
  })
  it('fences transfers against the destination plan and keeps historic usage with the original owner',async()=>{
    await comment()
    const target=await user()
    await sql!`insert into billing_accounts(user_id,plan,subscription_status,period_start,period_end)
      values (${target},'pro','active',now()-interval '1 day',now()+interval '29 days')`
    await sql!`insert into project_members(project_key,user_id,role) values (${project},${target},'admin')`
    for(let i=0;i<10;i++)await sql!`select claim_project(${target},${'target'+i},'Target')`
    await expect(sql!`select change_project_member_role(${project},${owner},${target},'owner')`).rejects.toThrow('cloud_plan_limit')
    expect((await sql!`select user_id from project_members where project_key=${project} and is_owner`)[0].user_id).toBe(owner)
    await sql!`update billing_accounts set plan='studio' where user_id=${target}`
    await sql!`select change_project_member_role(${project},${owner},${target},'owner')`
    expect((await sql!`select owner_id from cloud_usage where resource='comments'`)[0].owner_id).toBe(owner)
    await comment()
    expect((await sql!`select cloud_usage_count(${target},'comments') as count`)[0].count).toBe(1)
  })
  it('rejects expired invitation acceptance without deleting existing membership',async()=>{
    const invited=await user()
    await sql!`insert into project_invites(project_key,email,invited_by,expires_at)
      values (${project},${invited+'@example.com'},${owner},now()-interval '1 day')`
    await expect(sql!`select accept_project_invite_with_seat(${invited},${invited+'@example.com'},${project})`).rejects.toThrow('not_found')
    expect(await sql!`select * from project_members where user_id=${invited}`).toHaveLength(0)
  })
  it('refunds queued cancellation, consumes started cancellation, and keeps refunds in the original window',async()=>{
    async function audit(){const [row]=await sql!.unsafe(`select create_audit_run('project',$1,$2,$3,null,null,null,$4,$4,'live','{}','{}','{}',null) as result`,[project,owner,randomUUID(),'https://example.com']);return row.result.auditId}
    const queued=await audit()
    await sql!`select cancel_audit_run(${queued})`
    expect((await sql!`select cloud_usage_count(${owner},'product_audits') as count`)[0].count).toBe(0)
    const running=await audit()
    await sql!`update audit_runs set started_at=now(),status='running' where id=${running}`
    await sql!`select cancel_audit_run(${running})`
    expect((await sql!`select cloud_usage_count(${owner},'product_audits') as count`)[0].count).toBe(1)
    const failing=await audit()
    await sql!`update billing_accounts set period_start=now(),period_end=now()+interval '1 month' where user_id=${owner}`
    await sql!`select mark_audit_run_failed(${failing},'internal','Failed')`
    expect((await sql!`select cloud_usage_count(${owner},'product_audits') as count`)[0].count).toBe(0)
    expect((await sql!`select released from cloud_usage where resource_id=${running}`)[0].released).toBe(false)
  })
  it('fences expiry-only invitation renewal against the internal-user limit',async()=>{
    await sql!`insert into project_invites(project_key,email,invited_by,expires_at) values (${project},'expired@example.com',${owner},now()-interval '1 day')`
    for(let i=0;i<9;i++)await sql!`insert into project_invites(project_key,email,invited_by) values (${project},${'active'+i+'@example.com'},${owner})`
    await expect(sql!`update project_invites set expires_at=now()+interval '7 days' where email='expired@example.com'`).rejects.toThrow('cloud_plan_limit')
    await sql!`update project_invites set expires_at=now()-interval '1 day' where email='active0@example.com'`
    await sql!`update project_invites set expires_at=now()+interval '7 days' where email='expired@example.com'`
  })
  it('returns canonical screenshot admission, disallows extra formats and fences repair after expiry',async()=>{
    const id=randomUUID(),path=owner+'/imports/'+id+'.png'
    const input=[{id,pageUrl:'https://example.com',pageHostname:'example.com',x:0,y:0,selector:'body',body:'local',screenshotStoragePath:path}]
    const [created]=await sql!`select import_cloud_feedback(${owner},${project},'Local',${sql!.json(input)}) as result`
    expect(created.result.screenshots).toEqual([{id,path}])
    const [changed]=await sql!`select import_cloud_feedback(${owner},${project},'Local',${sql!.json([{...input[0],screenshotStoragePath:path+'.webp'}])}) as result`
    expect(changed.result.screenshots).toEqual([])
    await sql!`update billing_accounts set subscription_status='canceled' where user_id=${owner}`
    await expect(sql!`select import_cloud_feedback(${owner},${project},'Local',${sql!.json(input)})`).rejects.toThrow('cloud_plan_limit')
    expect((await sql!`select screenshot_storage_path from comments where id=${id}`)[0].screenshot_storage_path).toBe(path)
  })
  it('does not deadlock feedback mutation against a waiting Widget Agent share',async()=>{
    const [created]=await comment()
    const editor=await sql!.reserve(),agent=await sql!.reserve()
    let pending:Promise<unknown>|undefined
    try{
      await editor.unsafe('BEGIN')
      await editor.unsafe("SET LOCAL lock_timeout='500ms'")
      await editor`select pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || ${project},0))`
      const [backend]=await agent`select pg_backend_pid() as pid`
      const share={slug:randomUUID(),access_token_hash:randomUUID(),access_token_ciphertext:'ciphertext',expires_at:new Date(Date.now()+86400000).toISOString()}
      pending=Promise.resolve(agent`select * from create_widget_agent_share(${project},${owner},'https://example.com','deadlock-regression-key',${'a'.repeat(64)},ARRAY[]::text[],${sql!.json(share)},ARRAY[${created.id}::uuid])`)
      // Observe the actual blocking edge instead of assuming query timing.
      let waiting=false
      for(let attempt=0;attempt<100;attempt++){
        const [state]=await sql!`select wait_event from pg_stat_activity where pid=${backend.pid}`
        if(state.wait_event==='advisory'){waiting=true;break}
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      expect(waiting).toBe(true)
      await sql!.begin(async tx=>{
        await tx.unsafe("SET LOCAL lock_timeout='500ms'")
        await tx`update billing_accounts set updated_at=now() where user_id=${owner}`
      })
      await editor`select * from mutate_actor_feedback(${project},${owner},${created.id},${sql!.json({implementation_status:'in_progress'})})`
      await editor.unsafe('COMMIT')
      await pending
    }finally{
      await editor.unsafe('ROLLBACK')
      if(pending)await pending.catch(()=>{})
      editor.release();agent.release()
    }
  })
  it('enforces subscription state on edits without acquiring quota owner locks',async()=>{
    const [created]=await comment()
    const blocker=await sql!.reserve(),editor=await sql!.reserve()
    try{
      await blocker.unsafe('BEGIN')
      await blocker`select cloud_require_write(${owner})`
      await editor.unsafe("SET lock_timeout='500ms'")
      await editor`update comments set comment='edited' where id=${created.id}`
    }finally{
      await blocker.unsafe('ROLLBACK');blocker.release();editor.release()
    }
    await sql!`update billing_accounts set subscription_status='canceled' where user_id=${owner}`
    await expect(sql!`update comments set comment='blocked' where id=${created.id}`).rejects.toThrow('cloud_plan_limit')
  })
  it('keeps merge-time migration enforcement disabled before explicit activation',async()=>{
    await sql!`update cloud_plan_settings set enabled=false`
    await sql!`update billing_accounts set subscription_status='canceled' where user_id=${owner}`
    await comment()
    expect((await sql!`select enabled from cloud_plan_settings where id=1`)[0].enabled).toBe(false)
  })
  it('orders mixed screenshot retry/new import before billing writer contention',async()=>{
    const id=randomUUID(),path=owner+'/imports/'+id+'.png'
    const first={id,pageUrl:'https://example.com',pageHostname:'example.com',selector:'body',body:'existing',x:0,y:0,screenshotStoragePath:path}
    await sql!`select import_cloud_feedback(${owner},${project},'Local',${sql!.json([first])})`
    const blocker=await sql!.reserve(),importer=await sql!.reserve()
    let pending:Promise<unknown>|undefined
    try{
      await blocker.unsafe('BEGIN')
      await blocker`select pg_advisory_xact_lock(hashtextextended('crrt-cloud:' || ${owner}::text,0))`
      const [backend]=await importer`select pg_backend_pid() as pid`
      pending=Promise.resolve(importer`select import_cloud_feedback(${owner},${project},'Local',${sql!.json([first,{...first,id:randomUUID(),screenshotStoragePath:null}])})`)
      let waiting=false
      for(let attempt=0;attempt<100;attempt++){
        const [state]=await sql!`select wait_event from pg_stat_activity where pid=${backend.pid}`
        if(state.wait_event==='advisory'){waiting=true;break}
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      expect(waiting).toBe(true)
      await sql!.begin(async tx=>{
        await tx.unsafe("SET LOCAL lock_timeout='500ms'")
        await tx`update billing_accounts set updated_at=now() where user_id=${owner}`
      })
      await blocker.unsafe('COMMIT');await pending
    }finally{
      await blocker.unsafe('ROLLBACK');if(pending)await pending.catch(()=>{})
      blocker.release();importer.release()
    }
  })
  it('locks quota admission before bulk and single Inbox comment rows',async()=>{
    const ids=[randomUUID(),randomUUID()]
    await sql!`update cloud_plan_settings set enabled=false`
    for(const id of ids)await sql!`insert into comments(id,source,created_by_user_id,url,page_hostname,x,y,element,comment,created_by)
      values(${id},'extension',${owner},'https://example.com','example.com',0,0,'body','Inbox','extension')`
    await sql!`update cloud_plan_settings set enabled=true`
    const blocker=await sql!.reserve(),bulk=await sql!.reserve(),single=await sql!.reserve()
    const pending:Promise<unknown>[]=[]
    try{
      await blocker.unsafe('BEGIN')
      await blocker`select pg_advisory_xact_lock(hashtextextended('crrt-cloud:' || ${owner}::text,0))`
      const pids=await Promise.all([bulk`select pg_backend_pid() as pid`,single`select pg_backend_pid() as pid`])
      pending.push(Promise.resolve(bulk`select * from assign_actor_inbox_feedback(${owner},${project},${ids}::uuid[],'shared')`))
      pending.push(Promise.resolve(single`select * from assign_actor_inbox_feedback(${owner},${project},${[ids[1]]}::uuid[],'shared')`))
      let waiting=false
      for(let attempt=0;attempt<100;attempt++){
        const states=await sql!`select wait_event from pg_stat_activity where pid in (${pids[0][0].pid},${pids[1][0].pid})`
        if(states.length===2 && states.every(s=>s.wait_event==='advisory')){waiting=true;break}
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      expect(waiting).toBe(true)
      await sql!.begin(async tx=>{await tx.unsafe("SET LOCAL lock_timeout='500ms'");await tx`select id from comments where id=any(${ids}::uuid[]) for update`})
      await blocker.unsafe('COMMIT');await Promise.all(pending)
      expect(await sql!`select id from comments where id=any(${ids}::uuid[]) and project_id=${project}`).toHaveLength(2)
    }finally{
      await blocker.unsafe('ROLLBACK');await Promise.allSettled(pending);blocker.release();bulk.release();single.release()
    }
  })
  it('retains deletion receipts, rejects resurrection, and scopes cleanup recovery to its actor',async()=>{
    const id=randomUUID(),path=owner+'/imports/'+id+'.png'
    const input={id,pageUrl:'https://example.com',pageHostname:'example.com',selector:'body',body:'image',x:0,y:0,screenshotStoragePath:path}
    await sql!`select import_cloud_feedback(${owner},${project},'Local',${sql!.json([input])})`
    const [deleted]=await sql!`select delete_actor_extension_feedback(${owner},${id}) as receipt`
    expect(deleted.receipt).toEqual({path})
    expect((await sql!`select delete_actor_extension_feedback(${owner},${id}) as receipt`)[0].receipt).toEqual({path})
    expect((await sql!`select delete_actor_extension_feedback(${randomUUID()},${id}) as receipt`)[0].receipt).toBeNull()
    await expect(sql!`select import_cloud_feedback(${owner},${project},'Local',${sql!.json([input])})`).rejects.toThrow('feedback_deleted')
    await expect(comment(id)).rejects.toThrow('feedback_deleted')
    await sql!`delete from projects where public_key=${project}`
    await sql!`delete from billing_accounts where user_id=${owner}`
    await sql!`delete from cloud_usage where owner_id=${owner}`
    await sql!`delete from auth.users where id=${owner}`
    expect(await sql!`select screenshot_storage_path from deleted_extension_feedback where id=${id}`).toEqual([{screenshot_storage_path:path}])
  })
  it('captures screenshot deletion on account cascade and denies public receipt reads',async()=>{
    const id=randomUUID(),path=owner+'/imports/'+id+'.png'
    await sql!`insert into comments(id,project_id,source,created_by_user_id,url,page_hostname,x,y,element,comment,created_by,screenshot_storage_path)
      values(${id},${project},'extension',${owner},'https://example.com','example.com',0,0,'body','image','extension',${path})`
    await sql!`delete from projects where public_key=${project}`
    await sql!`delete from billing_accounts where user_id=${owner}`
    await sql!`delete from cloud_usage where owner_id=${owner}`
    await sql!`delete from auth.users where id=${owner}`
    expect(await sql!`select id from deleted_extension_feedback where id=${id}`).toHaveLength(1)
    for(const role of ['anon','authenticated'])await sql!.begin(async tx=>{
      await tx`grant select on deleted_extension_feedback to anon,authenticated`
      await tx.unsafe(`set local role ${role}`)
      expect(await tx`select * from deleted_extension_feedback`).toHaveLength(0)
      expect((await tx`select has_function_privilege(current_user,'public.delete_actor_extension_feedback(uuid,uuid)','EXECUTE') as allowed`)[0].allowed).toBe(false)
    })
  })
  it('tracks the longest signed-upload window before deleting and scopes registration to the canonical actor/path',async()=>{
    const id=randomUUID(),path=owner+'/imports/'+id+'.png'
    const input={id,pageUrl:'https://example.com',pageHostname:'example.com',selector:'body',body:'image',x:0,y:0,screenshotStoragePath:path}
    await sql!`select import_cloud_feedback(${owner},${project},'Local',${sql!.json([input])})`
    await expect(sql!`select register_extension_screenshot_upload(${randomUUID()},${id},${path},now()+interval '2 hours')`).rejects.toThrow('feedback_deleted')
    await expect(sql!`select register_extension_screenshot_upload(${owner},${id},'wrong',now()+interval '2 hours')`).rejects.toThrow('feedback_deleted')
    await expect(sql!`select register_extension_screenshot_upload(${owner},${id},${path},now()-interval '1 minute')`).rejects.toThrow('invalid_upload_expiry')
    await expect(sql!`select register_extension_screenshot_upload(${owner},${id},${path},now()+interval '4 hours')`).rejects.toThrow('invalid_upload_expiry')
    await sql!`select register_extension_screenshot_upload(${owner},${id},${path},now()+interval '2 hours')`
    await sql!`select register_extension_screenshot_upload(${owner},${id},${path},now()+interval '1 hour')`
    const [window]=await sql!`select expires_at from extension_screenshot_upload_windows where comment_id=${id}`
    await sql!`select delete_actor_extension_feedback(${owner},${id})`
    const [marker]=await sql!`select cleanup_after,cleanup_pending from deleted_extension_feedback where id=${id}`
    expect(marker.cleanup_after.getTime()).toBe(window.expires_at.getTime()+15*60_000)
    expect(marker.cleanup_pending).toBe(true)
    expect(await sql!`select * from extension_screenshot_upload_windows where comment_id=${id}`).toHaveLength(0)
    await expect(sql!`select register_extension_screenshot_upload(${owner},${id},${path},now()+interval '2 hours')`).rejects.toThrow('feedback_deleted')
    expect((await sql!`select get_deleted_extension_feedback(${owner},${id}) as receipt`)[0].receipt).toEqual({path})
    expect((await sql!`select get_deleted_extension_feedback(${randomUUID()},${id}) as receipt`)[0].receipt).toBeNull()
  })
  it('pending cleanup remains independent of 10000 successfully cleaned historical receipts',async()=>{
    await sql!`update deleted_extension_feedback set cleanup_pending=false`
    await sql!`insert into deleted_extension_feedback(id,actor_id,screenshot_storage_path,cleanup_pending)
      select gen_random_uuid(),${owner},'historical/'||n,false from generate_series(1,10000) n`
    const id=randomUUID()
    await sql!`insert into deleted_extension_feedback(id,actor_id,screenshot_storage_path,cleanup_after)
      values(${id},${owner},'pending/image.png',now()-interval '1 minute')`
    expect(await sql!`select id from deleted_extension_feedback where cleanup_pending and cleanup_after<=now() order by cleanup_after,id limit 100`).toEqual([{id}])
    await sql!`update deleted_extension_feedback set cleanup_pending=false where id=${id}`
    expect(await sql!`select id from deleted_extension_feedback where cleanup_pending and cleanup_after<=now()`).toHaveLength(0)
    expect(await sql!`select id from deleted_extension_feedback where id=${id}`).toHaveLength(1)
  })
  it('protects configuration, ledger and entitlement RPC from direct clients', async () => {
    for(const role of ['anon','authenticated']) await sql!.begin(async tx=>{
      await tx`grant select on cloud_usage,cloud_plan_settings to anon,authenticated`
      await tx.unsafe(`set local role ${role}`)
      expect(await tx`select * from cloud_plan_settings`).toHaveLength(0)
      expect(await tx`select * from cloud_usage`).toHaveLength(0)
      expect((await tx`select has_function_privilege(current_user,'public.cloud_entitlements(uuid)','EXECUTE') as allowed`)[0].allowed).toBe(false)
    })
  })
})
