// @vitest-environment node
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const connection = process.env.CLICKS_TEST_DATABASE_URL
if (connection && !/^postgres(?:ql)?:\/\/[^/]+@127\.0\.0\.1:\d+\/clicks$/.test(connection)) throw new Error('Dedicated local clicks database required')
const suite = connection ? describe : describe.skip
suite('feedback version fence', () => {
 const sql = postgres(connection!, { max: 4 })
 const owner=randomUUID(), project=`clicks-${randomUUID()}`, id=randomUUID()
 beforeAll(async () => {
  await sql`insert into auth.users(id,email) values(${owner},${`${owner}@test.local`})`
  await sql`insert into projects(public_key,slug,name) values(${project},${project},'Clicks')`
  await sql`insert into project_members(project_key,user_id,role,is_owner) values(${project},${owner},'admin',true)`
  await sql`insert into comments(id,project_id,comment) values(${id},${project},'Feedback')`
 })
 afterAll(async () => {
  await sql`delete from projects where public_key=${project}`
  await sql`delete from auth.users where id=${owner}`
  await sql.end()
 })
 it('allows one concurrent restore and rejects the other without overwriting its result', async () => {
  const [before]=await sql`select updated_at::text as version from comments where id=${id}`
  const results=await Promise.all(['approved','rejected'].map(status => sql`select * from mutate_actor_feedback(${project},${owner},${id},${sql.json({status,expected_updated_at:before.version})})`.then(rows=>rows[0].status,error=>error.message)))
  expect(results.filter(result=>result==='status_conflict')).toHaveLength(1)
  const winner=results.find(result=>result!=='status_conflict')
  expect((await sql`select status from comments where id=${id}`)[0].status).toBe(winner)
  await expect(sql`select * from mutate_actor_feedback(${project},${owner},${id},${sql.json({status:'pending',expected_updated_at:before.version})})`).rejects.toMatchObject({message:'status_conflict'})
 })
 it('preserves legacy writes and the actor permission fence', async () => {
  expect(await sql`select * from mutate_actor_feedback(${project},${owner},${id},${sql.json({status:'pending'})})`).toHaveLength(1)
  await expect(sql`select * from mutate_actor_feedback(${project},${randomUUID()},${id},${sql.json({status:'approved'})})`).rejects.toMatchObject({message:'forbidden'})
 })
})
