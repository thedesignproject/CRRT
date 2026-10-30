// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inboxRestoreSql } from './schema'
it('generates the additive Inbox restore migration from schema',()=>{
 expect(readFileSync('db/migrations/0048_inbox_restore.sql','utf8').trim()).toBe(inboxRestoreSql.trim())
})
const connection=process.env.CLICKS_TEST_DATABASE_URL
if(connection&&!/^postgres(?:ql)?:\/\/[^/]+@127\.0\.0\.1:\d+\/clicks$/.test(connection))throw new Error('Dedicated local clicks database required')
const suite=connection?describe:describe.skip
suite('versioned Inbox restore',()=>{
 const sql=postgres(connection!,{max:4}), owner=randomUUID(), stranger=randomUUID(), project=`clicks-${randomUUID()}`
 beforeAll(async()=>{
  await sql`insert into auth.users(id,email) values(${owner},${`${owner}@test.local`}),(${stranger},${`${stranger}@test.local`})`
  await sql`insert into projects(public_key,slug,name) values(${project},${project},'Clicks')`
  await sql`insert into project_members(project_key,user_id,role,is_owner) values(${project},${owner},'admin',true)`
 })
 afterAll(async()=>{
  await sql`delete from comments where created_by_user_id in (${owner},${stranger})`
  await sql`delete from projects where public_key=${project}`
  await sql`delete from auth.users where id in (${owner},${stranger})`;await sql.end()
 })
 async function move(actor=owner){
  const id=randomUUID()
  await sql`insert into comments(id,source,created_by_user_id,page_hostname,comment) values(${id},'extension',${actor},'example.test','Feedback')`
  const [row]=await sql`select id,updated_at::text from assign_actor_inbox_feedback_with_versions(${owner},${project},ARRAY[${id}]::uuid[],'shared')`
  return row??{id,updated_at:new Date().toISOString()}
 }
 it('restores only the original owner and exact version, with one winner on concurrent undo',async()=>{
  const row=await move()
  const results=await Promise.all([1,2].map(()=>sql`select * from restore_actor_inbox_feedback(${owner},${project},${sql.json([row])})`))
  expect(results.map(r=>r.length).sort()).toEqual([0,1])
  expect((await sql`select project_id from comments where id=${row.id}`)[0].project_id).toBeNull()
 })
 it('keeps newer edits in the project',async()=>{
  const row=await move();await sql`update comments set comment='newer',updated_at=clock_timestamp() where id=${row.id}`
  expect(await sql`select * from restore_actor_inbox_feedback(${owner},${project},${sql.json([row])})`).toHaveLength(0)
  expect((await sql`select project_id from comments where id=${row.id}`)[0].project_id).toBe(project)
 })
 it('rejects revoked permissions and invalid batches',async()=>{
  const row=await move()
  await expect(sql`select * from restore_actor_inbox_feedback(${stranger},${project},${sql.json([row])})`).rejects.toMatchObject({message:'forbidden'})
  await expect(sql`select * from restore_actor_inbox_feedback(${owner},${project},${sql.json([])})`).rejects.toMatchObject({message:'invalid_selection'})
 })
 it('does not detach another author or feedback already shared with an agent',async()=>{
  const row=await move(), share=randomUUID()
  await sql`insert into feedback_shares(id,project_id,slug,access_token_hash,access_token_ciphertext,created_by,scope_type,expires_at) values(${share},${project},${randomUUID()},'hash','cipher','reviewer','selection',now()+interval '1 day')`
  await sql`insert into feedback_share_items(share_id,comment_id) values(${share},${row.id})`
  expect(await sql`select * from restore_actor_inbox_feedback(${owner},${project},${sql.json([row])})`).toHaveLength(0)
  const foreign=randomUUID()
  await sql`insert into comments(id,project_id,source,created_by_user_id,page_hostname,comment) values(${foreign},${project},'extension',${stranger},'example.test','Other')`
  const [other]=await sql`select id,updated_at::text from comments where id=${foreign}`
  expect(await sql`select * from restore_actor_inbox_feedback(${owner},${project},${sql.json([other])})`).toHaveLength(0)
 })
})
