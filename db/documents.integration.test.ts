// @vitest-environment node
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { assertLocalMcpTargets } from '../server/mcp/local-test-targets'

const local = process.env.MCP_TEST_LOCAL === '1'
const suite = local ? describe : describe.skip
suite('hosted document transactions on local Supabase', () => {
  if (local) assertLocalMcpTargets(process.env)
  const sql = postgres(process.env.DATABASE_URL || 'postgres://localhost/unused', { max: 5 })
  const actor = randomUUID(), outsider = randomUUID(), member = randomUUID(), guest = randomUUID(), project = `docs-${randomUUID()}`
  const id = randomUUID()
  const command = async (action: string, input: Record<string, unknown>, options: { actor?: string | null; key?: string; hash?: string; access?: number; id?: string } = {}) =>
    (await sql`select public.document_command(${options.actor === undefined ? actor : options.actor}::uuid,${options.id ?? id}::uuid,${action},${sql.json({...(action === 'progress' ? {summary: 'Integration progress'} : {}), ...input})},${options.key ?? randomUUID()},${options.hash ?? 'hash'},${options.access ?? null}) as result`)[0].result
  beforeAll(async () => {
    for (const user of [actor, outsider, member, guest]) await sql`insert into auth.users(id,email) values(${user},${`${user}@documents.test`})`
    await sql`insert into projects(public_key,slug,name) values(${project},${project},'Document test')`
    await sql`insert into project_members(project_key,user_id,role,is_owner) values(${project},${actor},'admin',true),(${project},${member},'member',false),(${project},${guest},'guest',false)`
  })
  afterAll(async () => {
    await sql`delete from documents where created_by=any(${[actor,member,guest]})`
    await sql`delete from projects where public_key=${project}`
    await sql`delete from document_operations where actor_id=any(${[actor, member, guest]}) or document_id=${id}`
    await sql`delete from auth.users where id=any(${[actor, outsider, member, guest]})`
    await sql.end()
  })
  it('creates once, rejects changed retries, and gates project membership', async () => {
    const input = { projectId: project, title: 'Review me', body: '# Original' }, key = randomUUID()
    await expect(command('create', input, { actor: outsider })).rejects.toThrow('forbidden')
    await expect(command('create', input, { actor: guest })).rejects.toThrow('forbidden')
    const first = await command('create', input, { key })
    expect(first.version).toBe(1)
    expect(await command('create', input, { key })).toEqual(first)
    await expect(command('create', input, { key, hash: 'changed' })).rejects.toThrow('idempotency_conflict')
  })
  it('serializes draft saves and rejects stale updates', async () => {
    const save = (body: string) => command('save', { expectedVersion: 1, title: 'Review me', body })
    const results = await Promise.allSettled([save('First'), save('Second')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')[0]).toMatchObject({ reason: { message: 'version_conflict' } })
  })
  it('restricts publication to admins and makes history immutable', async () => {
    await expect(command('publish', { expectedVersion: 2, summary: 'Initial' }, { actor: member })).rejects.toThrow('forbidden')
    expect(await command('publish', { expectedVersion: 2, summary: 'Initial' })).toMatchObject({ version: 3, publishedRevision: 1 })
    await expect(sql`update document_revisions set body='tampered' where document_id=${id}`).rejects.toThrow('published_revision_immutable')
    await expect(sql`delete from document_revisions where document_id=${id}`).rejects.toThrow('published_revision_immutable')
  })
  it('requires live sharing and the current grant version for anonymous feedback', async () => {
    const target = { selector: '.document-prose p', x: 32, y: 48, elementX: .3, elementY: .4 }
    const input = { revision: 1, author: 'Reviewer', body: 'Improve the intro', quote: 'First', target }
    await expect(command('comment', input, { actor: null, access: 1 })).rejects.toThrow('forbidden')
    await command('sharing', { expectedVersion: 3, sharing: true, passwordHash: 'private' })
    await expect(command('comment', input, { actor: null, access: 1 })).rejects.toThrow('forbidden')
    const result = await command('comment', input, { actor: null, access: 2 })
    expect(result.feedbackId).toBeTruthy()
    expect((await sql`select target from document_feedback where id=${result.feedbackId}`)[0].target).toEqual(target)
    const root = result.feedbackId
    await expect(command('progress', { feedbackId: root, feedbackVersion: 1, agentId: 'test-agent', operation: 'claim' })).rejects.toThrow('feedback_not_eligible')
    await command('review', { feedbackId: root, feedbackVersion: 1, reviewStatus: 'accepted' })
    await expect(command('progress', { feedbackId: root, feedbackVersion: 2, agentId: 'test-agent', operation: 'complete' })).rejects.toThrow('claim_required')
    await command('progress', { feedbackId: root, feedbackVersion: 2, agentId: 'test-agent', operation: 'claim' })
    await expect(command('progress', { feedbackId: root, feedbackVersion: 3, agentId: 'other', operation: 'claim' })).rejects.toThrow('claim_conflict')
    const block = { feedbackId: root, feedbackVersion: 3, agentId: 'test-agent', operation: 'block', summary: 'Need a product decision.' }, reportKey = randomUUID()
    const blocked = await command('progress', block, { key: reportKey })
    expect(await command('progress', block, { key: reportKey })).toEqual(blocked)
    await command('progress', { feedbackId: root, feedbackVersion: 4, agentId: 'test-agent', operation: 'start', summary: 'Decision supplied; continuing.' })
    await command('progress', { feedbackId: root, feedbackVersion: 5, agentId: 'test-agent', operation: 'complete', summary: 'Introduction clarified.' })
    const updates = (await sql`select progress_updates from document_feedback where id=${root}`)[0].progress_updates
    expect(updates.map((u: {summary: string}) => u.summary)).toEqual(['Integration progress', 'Need a product decision.', 'Decision supplied; continuing.', 'Introduction clarified.'])
    expect(updates.map((u: {operation: string}) => u.operation)).toEqual(['claim', 'block', 'start', 'complete'])
    for (const update of updates) { expect(update.agentId).toBe('test-agent'); expect(Number.isNaN(Date.parse(update.createdAt))).toBe(false) }
    expect((await sql`select implementation_status from document_feedback where id=${root}`)[0].implementation_status).toBe('ready_for_testing')
    await command('comment', { ...input, parentId: root, body: 'Agreed' }, { actor: null, access: 2 })
    await expect(command('comment', { ...input, parentId: randomUUID() })).rejects.toThrow('feedback_not_found')
  })
  it('restores into a draft, preserves history, rotates links and disables archived shares', async () => {
    await command('save', { expectedVersion: 4, title: 'Changed', body: 'New content' })
    await command('publish', { expectedVersion: 5, summary: 'Second revision' })
    const [thread] = await sql`select id from document_feedback where document_id=${id} and parent_id is null`
    const reply = { revision: 1, parentId: thread.id, author: 'Reviewer', body: 'Reply after publication' }
    expect((await command('comment', reply, { actor: null, access: 2 })).feedbackId).toBeTruthy()
    await expect(command('comment', reply, { actor: null, access: 1 })).rejects.toThrow('forbidden')
    await expect(command('comment', { ...reply, parentId: null }, { actor: null, access: 2 })).rejects.toThrow('revision_not_found')
    await expect(command('comment', { ...reply, parentId: randomUUID() }, { actor: null, access: 2 })).rejects.toThrow('feedback_not_found')
    await expect(command('comment', { ...reply, revision: 2 }, { actor: null, access: 2 })).rejects.toThrow('feedback_not_found')
    await command('restore', { expectedVersion: 6, revision: 1 })
    expect(await sql`select number from document_revisions where document_id=${id}`).toHaveLength(2)
    const before = (await sql`select share_key from documents where id=${id}`)[0].share_key
    await command('sharing', { expectedVersion: 7, sharing: true, rotateLink: true })
    expect((await sql`select share_key from documents where id=${id}`)[0].share_key).not.toBe(before)
    await command('archive', { expectedVersion: 8, archived: true })
    await expect(command('comment', { revision: 2, author: 'A', body: 'B' }, { actor: null, access: 4 })).rejects.toThrow('forbidden')
    await command('delete', { expectedVersion: 9 })
    expect(await sql`select * from document_revisions where document_id=${id}`).toHaveLength(0)
  })
  it('supports optional assignment, project access, guests, invitations and safe detachment',async()=>{
    const standalone=randomUUID(),opt={id:standalone}
    await command('create',{title:'Personal',body:'Private'},opt)
    expect((await sql`select project_id,access_mode from documents where id=${standalone}`)[0]).toMatchObject({project_id:null,access_mode:'private'})
    await command('assign',{expectedVersion:1,projectId:project},opt)
    expect((await sql`select access_mode from documents where id=${standalone}`)[0].access_mode).toBe('private')
    await expect(command('save',{expectedVersion:2,title:'No',body:''},{...opt,actor:member})).rejects.toThrow('forbidden')
    await command('publish',{expectedVersion:2,summary:'Review'},opt)
    await command('sharing',{expectedVersion:3,accessMode:'project'},opt)
    await command('save',{expectedVersion:4,title:'Team',body:'Team draft'},{...opt,actor:member})
    await expect(command('comment',{revision:1,author:'Guest',body:'No'},{...opt,actor:guest})).rejects.toThrow('forbidden')
    await expect(command('comment',{revision:1,author:'Public',body:'No'},{...opt,actor:null,access:2})).rejects.toThrow('forbidden')
    await command('assign',{expectedVersion:5,projectId:null},opt)
    expect((await sql`select project_id,access_mode,sharing from documents where id=${standalone}`)[0]).toMatchObject({project_id:null,access_mode:'private',sharing:false})
    await command('invite',{expectedVersion:6,email:outsider+'@documents.test',remove:false},opt)
    await command('comment',{revision:1,author:'Invited',body:'Thanks'},{...opt,actor:outsider})
    await expect(command('save',{expectedVersion:7,title:'No',body:''},{...opt,actor:outsider})).rejects.toThrow('forbidden')
    await command('invite',{expectedVersion:7,email:outsider+'@documents.test',remove:true},opt)
    await expect(command('comment',{revision:1,author:'Removed',body:'No'},{...opt,actor:outsider})).rejects.toThrow('forbidden')
    await command('sharing',{expectedVersion:8,accessMode:'link'},opt)
    await expect(command('comment',{revision:1,author:'Null',body:'No'},{...opt,actor:null})).rejects.toThrow('forbidden')
    const feedback=await command('comment',{revision:1,author:'Public',body:'Yes'},{...opt,actor:null,access:7})
    await command('review',{feedbackId:feedback.feedbackId,feedbackVersion:1,reviewStatus:'accepted'},opt)
    await expect(command('progress',{feedbackId:feedback.feedbackId,feedbackVersion:2,operation:'complete'},opt)).rejects.toThrow('claim_required')
    const key=randomUUID(),deletion={expectedVersion:9}
    const result=await command('delete',deletion,{...opt,key});expect(await command('delete',deletion,{...opt,key})).toEqual(result)
  })
  it.each(['create','save','assign'])('locks projects before documents and memberships during %s',async action=>{
    const document=randomUUID(),target=action==='assign'?'lock-'+randomUUID():project
    if(action==='assign'){await sql`insert into projects(public_key,slug,name) values(${target},${target},'Lock target')`;await sql`insert into project_members(project_key,user_id,role,is_owner) values(${target},${actor},'admin',true)`}
    if(action!=='create')await command('create',{projectId:project,title:'Lock order',body:''},{id:document})
    const holder=await sql.reserve(),writer=await sql.reserve();let work:Promise<{value?:unknown;error?:unknown}>|undefined
    try{
      const [{pid:holderPid}]=await holder`select pg_backend_pid() as pid`,[{pid:writerPid}]=await writer`select pg_backend_pid() as pid`
      await holder`begin`;await holder`select public_key from projects where public_key=${target} for update`
      const input=action==='create'?{projectId:project,title:'Created',body:''}:action==='save'?{expectedVersion:1,title:'Saved',body:''}:{expectedVersion:1,projectId:target}
      work=writer`select document_command(${actor}::uuid,${document}::uuid,${action},${writer.json(input)},${randomUUID()},'lock-order') as result`.then(value=>({value}),error=>({error}))
      let blocked=false
      for(let attempt=0;attempt<100;attempt++){const [{pids}]=await sql`select pg_blocking_pids(${writerPid}) as pids`;if(pids.includes(holderPid)){blocked=true;break}await new Promise(resolve=>setTimeout(resolve,10))}
      expect(blocked).toBe(true)
      // These NOWAIT locks fail under the previous document/member-first order.
      await holder`select user_id from project_members where project_key=${project} and user_id=${actor} for update nowait`
      await holder`select id from documents where id=${document} for update nowait`
    }finally{
      await holder`rollback`;const outcome=await work;holder.release();writer.release()
      await sql`delete from documents where id=${document}`;if(target!==project)await sql`delete from projects where public_key=${target}`
      expect(outcome?.error).toBeUndefined();expect(outcome?.value).toBeDefined()
    }
  })
  it('denies direct browser access to tables and mutation RPC', async () => {
    const [{ secure }] = await sql`select bool_and(relrowsecurity) as secure from pg_class where relname in ('documents','document_revisions','document_feedback','document_operations')`
    expect(secure).toBe(true)
    for (const role of ['anon', 'authenticated']) await sql.begin(async tx => {
      await tx.unsafe(`set local role ${role}`)
      const [{ allowed }] = await tx`select has_function_privilege(current_user,'public.document_command(uuid,uuid,text,jsonb,text,text,integer)','execute') as allowed`
      expect(allowed).toBe(false)
    })
  })
})
