// @vitest-environment node
import { randomUUID, scryptSync } from 'node:crypto'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ queue: [] as unknown[], calls: [] as unknown[], member: vi.fn() }))
vi.mock('./supabase.js', () => {
  const q: Record<string, unknown> = {}
  for (const name of ['from','select','eq','order','range','limit','or']) q[name] = (...args: unknown[]) => { fake.calls.push([name,...args]); return q }
  q.then = (resolve: (v: unknown) => void) => resolve(fake.queue.shift())
  q.single = q.maybeSingle = () => Promise.resolve(fake.queue.shift())
  return { getServiceSupabase: () => ({ ...q, rpc: (...args: unknown[]) => { fake.calls.push(args); return Promise.resolve(fake.queue.shift()) } }) }
})
vi.mock('./store.js', () => ({ getProjectMember: fake.member }))
import { executeDocument } from './documents.js'
const id = randomUUID(), key = randomUUID(), actor = { userId: randomUUID(), email: 'reviewer@test.local' }
const doc = { id, created_by:actor.userId, access_mode:'link', project_id: 'p', title: 'Draft title', body: 'Draft secret', version: 2, published_revision: 1, share_key: randomUUID(), sharing: true, password_hash: null as string | null, access_version: 1, archived: false, updated_at: 'now' }
const ok = (data: unknown) => ({ data, error: null })
const run = (action: string, fields: object = {}, user: typeof actor | null = actor) => executeDocument({ action, id, ...(user === null && ['read','comment'].includes(action) ? { shareKey: doc.share_key } : {}), ...fields }, user)
beforeEach(() => { fake.queue.length = 0; fake.calls.length = 0; fake.member.mockClear(); fake.member.mockResolvedValue({ role: 'admin' }); vi.stubEnv('SHARE_TOKEN_SECRET','document-unit-test-secret') })
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
it('validates action-specific inputs before accessing storage', async () => {
  await expect(run('unknown')).rejects.toThrow()
  await expect(run('save', { expectedVersion: 1, title: 'T', body: '', key: 'bad' })).rejects.toThrow()
  await expect(run('sharing', { expectedVersion: 1, sharing: true, password: 'short', userRequested: true, key })).rejects.toThrow()
})
it('lists only authorized project documents with bounded pagination and no draft bodies', async () => {
  fake.queue.push(ok([doc]))
  const output = await executeDocument({ action: 'list', projectId: 'p' }, actor)
  expect(output.documents![0]).toMatchObject({ body: '', canManage: true, passwordProtected: false })
  expect(JSON.stringify(output)).not.toContain('password_hash')
  fake.queue.push(ok(Array(50).fill(doc)))
  expect((await executeDocument({ action: 'list', projectId: 'p' }, actor)).nextOffset).toBe(50)
  fake.member.mockResolvedValue(null)
  await expect(executeDocument({ action: 'list', projectId: 'p' }, actor)).rejects.toMatchObject({ status: 403 })
})
it('allows writers to create documents and rejects guests and anonymous creation', async () => {
  const input = { key, projectId: 'p', title: 'Title', body: '' }
  fake.queue.push(ok({ id, version: 1 })); expect(await run('create', input)).toEqual({ id, version: 1 })
  fake.member.mockResolvedValue({ role: 'member' }); fake.queue.push(ok({ id })); await run('create', input)
  fake.member.mockResolvedValue({ role: 'guest' }); await expect(run('create', input)).rejects.toMatchObject({ status: 403 })
  await expect(run('create', input, null)).rejects.toMatchObject({ status: 401 })
})
it('shows drafts to members, published content to readers, and does not expose secrets', async () => {
  fake.queue.push(ok(doc), ok([]), ok([])); expect((await run('read')).document!.body).toBe('Draft secret')
  fake.queue.push(ok(doc), ok(Array(50).fill({})), ok([])); expect((await run('read')).nextOffset).toBe(50)
  fake.queue.push(ok(doc), ok({ title: 'Published', body: 'Published content' }), ok([]))
  expect((await run('read', { shareKey: doc.share_key }, null)).document).toMatchObject({ title: 'Published', body: 'Published content', canEdit: false })
  for (const role of ['member']) {
    fake.member.mockResolvedValue({ role }); fake.queue.push(ok({...doc,created_by:'other',access_mode:'project'}), ok([]))
    expect((await run('read')).document!.canPublish).toBe(false)
  }
  fake.member.mockResolvedValue({ role: 'admin', feedbackAllowed: false })
  fake.queue.push(ok(doc), ok({ title: 'Public', body: '' }), ok([])); await run('read',{shareKey:doc.share_key})
})
it('fails closed for missing, disabled, unpublished and archived public documents', async () => {
  fake.queue.push(ok(null)); await expect(run('read')).rejects.toMatchObject({ status: 404 })
  for (const change of [{ sharing: false }, { archived: true }, { published_revision: null }]) {
    fake.queue.push(ok({ ...doc, ...change })); await expect(run('read', {}, null)).rejects.toMatchObject({ status: 404 })
  }
  fake.queue.push(ok(doc)); await expect(run('history', {}, null)).rejects.toMatchObject({ status: 403 })
  fake.queue.push(ok(doc)); await expect(executeDocument({action:'read',id},null)).rejects.toMatchObject({status:404})
})
it('unlocks password protected documents with expiring grants bound to the access version', async () => {
  const protectedDoc = { ...doc, access_mode:'password', password_hash: `salt:${scryptSync('correct password', 'salt',32).toString('hex')}` }
  const unlock = (password: string) => executeDocument({ action: 'unlock', shareKey: doc.share_key, password }, null)
  fake.queue.push(ok(protectedDoc)); await expect(run('read', {}, null)).rejects.toMatchObject({ message: 'password_required' })
  fake.queue.push(ok(protectedDoc), ok(true)); await expect(unlock('wrong')).rejects.toMatchObject({ message: 'incorrect_password' })
  fake.queue.push(ok(protectedDoc), ok(false)); await expect(unlock('correct password')).rejects.toMatchObject({ status: 429 })
  fake.queue.push(ok(protectedDoc), ok(true)); const { accessToken } = await unlock('correct password')
  fake.queue.push(ok(protectedDoc), ok({ title: 'Public', body: 'Public body' }), ok([])); await run('read', { accessToken }, null)
  for (const change of [{ access_version: 2 }, { id: randomUUID() }]) {
    fake.queue.push(ok({ ...protectedDoc, ...change })); await expect(run('read', { accessToken }, null)).rejects.toMatchObject({ status: 401 })
  }
  fake.queue.push(ok(protectedDoc)); await expect(run('read', { accessToken: 'invalid' }, null)).rejects.toMatchObject({ status: 401 })
  vi.useFakeTimers(); vi.setSystemTime(Date.now()+3600001)
  fake.queue.push(ok(protectedDoc)); await expect(run('read', { accessToken }, null)).rejects.toMatchObject({ status: 401 })
  vi.useRealTimers(); fake.queue.push(ok(doc), ok(true)); expect((await unlock('anything')).accessToken).toBeTruthy()
})
it('reads and compares revisions without exposing history to link guests', async () => {
  const revision = { number: 1, title: 'T', body: 'Old', summary: 'Initial' }
  fake.queue.push(ok(doc), ok([revision])); expect((await run('history')).nextOffset).toBeNull()
  fake.queue.push(ok(doc), ok(Array(50).fill(revision))); expect((await run('history')).nextOffset).toBe(50)
  fake.queue.push(ok(doc), ok(revision)); expect((await run('revision', { revision: 1 })).revision).toEqual(revision)
  fake.queue.push(ok(doc), ok(null)); await expect(run('revision', { revision: 9 })).rejects.toMatchObject({ status: 404 })
  fake.queue.push(ok(doc), ok(revision)); expect((await run('compare', { from: 1 })).comparison).toEqual({ before: 'Old', after: doc.body })
  fake.queue.push(ok(doc), ok(revision), ok({ ...revision, body: 'New' })); expect((await run('compare', { from: 1, to: 2 })).comparison!.after).toBe('New')
})
it('executes lifecycle commands with version guards, attribution, and hashed passwords', async () => {
  const commands = [
    ['save', { title: 'T', body: '' }], ['publish', { summary: 'Review', userRequested: true }], ['restore', { revision: 1 }],
    ['sharing', { sharing: true, password: 'secure password', userRequested: true }], ['sharing', { sharing: false, password: null, userRequested: true }],
    ['sharing', { sharing: true, userRequested: true }], ['archive', { archived: true, userRequested: true }], ['delete', { userRequested: true }],
    ['review', { feedbackId: randomUUID(), feedbackVersion: 1, reviewStatus: 'accepted', userRequested: true }],
    ['progress', { feedbackId: randomUUID(), feedbackVersion: 1, agentId: 'agent', operation: 'claim', summary: 'Starting' }],
  ] as const
  for (const [action, fields] of commands) {
    fake.queue.push(ok(doc), ok({ id })); await run(action, { ...(action === 'review' || action === 'progress' ? {} : { expectedVersion: 2 }), key, ...fields })
  }
  const calls = JSON.stringify(fake.calls)
  expect(calls).not.toContain('secure password'); expect(calls).toContain('passwordHash')
  fake.member.mockResolvedValue({ role: 'member' }); fake.queue.push(ok({...doc,created_by:'other',access_mode:'project'}), ok({ id })); await run('save', { expectedVersion: 2, key, title: 'T', body: '' })
  fake.queue.push(ok({...doc,created_by:'other',access_mode:'project'})); await expect(run('publish', { expectedVersion: 2, key, summary: 'T', userRequested: true })).rejects.toMatchObject({ status: 403 })
  fake.member.mockResolvedValue({ role: 'guest' }); fake.queue.push(ok({...doc,created_by:'other',access_mode:'project'})); await expect(run('save', { expectedVersion: 2, key, title: 'T', body: '' })).rejects.toMatchObject({ status: 403 })
})
it('accepts bounded comments and replies, with rate limits and verified member attribution', async () => {
  const input = { key, revision: 1, author: 'Display name', body: 'Feedback' }
  fake.queue.push(ok(doc), ok(true), ok({ id })); await run('comment', input)
  expect(JSON.stringify(fake.calls)).toContain(actor.email)
  fake.queue.push(ok(doc), ok(true), ok({ id })); await run('comment', { ...input, parentId: randomUUID() }, null)
  expect(JSON.stringify(fake.calls)).toContain('"p_access":1')
  fake.queue.push(ok(doc), ok(false)); await expect(run('comment', input)).rejects.toMatchObject({ status: 429 })
})
it('replays deletion receipts for the same actor and identical request', async () => {
  const input = { action: 'delete', id, key, expectedVersion: 2, userRequested: true }
  const { hashToken } = await import('./tokens.js')
  const { documentSchemas } = await import('../../shared/documents.js')
  fake.queue.push(ok(null), ok({ result: { id }, request_hash: hashToken(JSON.stringify(documentSchemas.delete.parse(input))) })); expect(await executeDocument(input, actor)).toEqual({ id })
  fake.queue.push(ok(null), ok(null)); await expect(executeDocument(input, actor)).rejects.toMatchObject({ status: 404 })
  fake.queue.push(ok(null), ok({ request_hash: 'different' })); await expect(executeDocument(input, actor)).rejects.toMatchObject({ status: 409 })
})
it('maps known storage failures and hides internal errors', async () => {
  for (const message of ['cloud_plan_limit:private','forbidden','version_conflict','idempotency_conflict','document_archived','claim_conflict','claim_required','feedback_not_eligible','document_not_found','revision_not_found','feedback_not_found','private database details']) {
    fake.queue.push({ data: null, error: { message } })
    await expect(run('read')).rejects.toMatchObject({ message: message.startsWith('cloud_plan_limit') ? 'plan_limit' : message === 'private database details' ? 'document_unavailable' : message })
  }
})
it('creates standalone documents and filters personal lists through explicit invitations',async()=>{
  fake.queue.push(ok({id}));await executeDocument({action:'create',id,key,title:'Standalone'},actor)
  expect(fake.member).not.toHaveBeenCalled()
  fake.queue.push(ok([]),ok([doc]));expect((await executeDocument({action:'list'},actor)).documents![0].canManage).toBe(true)
  fake.queue.push(ok([{document_id:id}]),ok([{...doc,created_by:'other',access_mode:'private'}]),ok({email:actor.email}),ok({title:'Published'}))
  expect((await executeDocument({action:'list'},actor)).documents![0]).toMatchObject({body:'',title:'Published',canEdit:false})
  expect(JSON.stringify(fake.calls)).toContain('created_by.eq.')
})
it('keeps project guests and invited readers on published content without draft history',async()=>{
  for(const role of ['guest','member']){
    const row={...doc,created_by:'other',access_mode:'project'};fake.member.mockResolvedValue({role})
    fake.queue.push(ok(row),...(role==='guest'?[ok({title:'Published',body:'Safe'})]:[]),ok([]))
    expect((await run('read')).document).toMatchObject({body:role==='guest'?'Safe':'Draft secret',canComment:role!=='guest',canEdit:role==='member'})
    if(role==='guest')for(const action of ['comment','history','revision','compare']){
      fake.queue.push(ok(row));await expect(run(action,{...(action==='comment'?{key,revision:1,author:'Guest',body:'No'}:action==='revision'?{revision:1}:action==='compare'?{from:1}:{})})).rejects.toMatchObject({status:403})
    }
  }
  const privateDoc={...doc,created_by:'other',access_mode:'private'}
  fake.queue.push(ok(privateDoc),ok(null));await expect(run('read')).rejects.toMatchObject({status:403})
  fake.queue.push(ok(privateDoc));await expect(run('read',{},null)).rejects.toMatchObject({status:401})
  fake.queue.push(ok(privateDoc),ok({email:actor.email}),ok({title:'Public',body:'Safe'}),ok([]));expect((await run('read')).document!.body).toBe('Safe')
  fake.queue.push(ok({...privateDoc,published_revision:null}),ok({email:actor.email}));await expect(run('read')).rejects.toMatchObject({status:403})
})
it('validates sharing prerequisites and routes project assignment and invitations with version guards',async()=>{
  for(const fields of [{accessMode:'project'},{accessMode:'password'}]){
    fake.queue.push(ok({...doc,project_id:null}));await expect(run('sharing',{key,expectedVersion:2,userRequested:true,...fields})).rejects.toMatchObject({status:400})
  }
  for(const [action,fields] of [['assign',{projectId:null}],['invite',{email:'New@Test.Local',remove:false}]] as const){
    fake.queue.push(ok(doc),ok({id}));await run(action,{key,expectedVersion:2,userRequested:true,...fields})
  }
  fake.queue.push(ok(doc),ok([{id:'specific'}]),ok([]));expect((await run('read',{feedbackId:key})).feedback).toEqual([{id:'specific'}])
  fake.queue.push(ok(doc),ok(true),ok({id}));await executeDocument({action:'comment',id,key,revision:1,author:'Name',body:'Feedback'},{...actor,email:'a'.repeat(150)+'@test.local'})
  expect((fake.calls[fake.calls.length-1] as any)[1].p_input.author).toHaveLength(100)
})
it('filters inaccessible, archived and unpublished project entries and supports legacy password removal',async()=>{
  fake.queue.push(ok([{...doc,created_by:'other',access_mode:'private'},{...doc,created_by:'other',access_mode:'project',archived:true},{...doc,created_by:'other',access_mode:'project',published_revision:null}]),ok(null));fake.member.mockResolvedValue({role:'guest'})
  expect((await executeDocument({action:'list',projectId:'p'},actor)).documents).toEqual([])
  fake.queue.push(ok({...doc,created_by:'other'}),ok({title:'Public',body:'Safe'}),ok([]));expect((await run('read',{shareKey:doc.share_key})).document!.body).toBe('Safe')
  fake.queue.push(ok({...doc,password_hash:'old'}),ok({id}));await run('sharing',{key,expectedVersion:2,sharing:true,password:null,userRequested:true})
  expect((fake.calls[fake.calls.length-1] as any)[1].p_input).toMatchObject({accessMode:'link',passwordHash:null})
})
it.each(['admin','member','guest'])('uses project membership rather than widget privacy for document access: %s',async role=>{
  const row={...doc,created_by:'other',access_mode:'project'};fake.member.mockResolvedValue({role,feedbackAllowed:false})
  fake.queue.push(ok(row),...(role==='guest'?[ok({title:'Published',body:'Safe'})]:[]),ok([]),...(role==='admin'?[ok([])]:[]))
  expect((await run('read')).document).toMatchObject({canEdit:role!=='guest',canComment:role!=='guest'})
  fake.queue.push(ok([row]),...(role==='guest'?[ok({title:'Published'})]:[]));expect((await executeDocument({action:'list',projectId:'p'},actor)).documents).toHaveLength(1)
  if(role==='guest')await expect(run('create',{key,projectId:'p',title:'No',body:''})).rejects.toMatchObject({status:403})
  else{fake.queue.push(ok({id}));expect(await run('create',{key,projectId:'p',title:'Allowed',body:''})).toEqual({id})}
})

it('returns durable progress reports with feedback reads',async()=>{
  const updates=[{operation:'block',summary:'Need the approved copy.',agentId:'writer',createdAt:'2026-11-10T00:00:00Z'}]
  fake.queue.push(ok(doc),ok([{id:'feedback',progress_updates:updates}]),ok([]));expect((await run('read')).feedback![0].progress_updates).toEqual(updates);expect(fake.calls).toContainEqual(['select','id,document_id,revision,parent_id,quote,prefix,suffix,target,body,author,review_status,implementation_status,claimed_by,progress_updates,version,created_at'])
})

it('binds MCP password grants to the issuing connection',async()=>{
  const {scryptSync}=await import('node:crypto'),protectedDoc={...doc,created_by:'another-owner',access_mode:'password',password_hash:'salt:'+scryptSync('the password','salt',32).toString('hex')},connection='connection-a',mcpActor={...actor,mcpConnectionId:connection}
  fake.queue.push(ok(protectedDoc),ok(true));const grant=await executeDocument({action:'unlock',shareKey:doc.share_key,password:'the password'},mcpActor)
  for(const reader of [null,{...actor,mcpConnectionId:'connection-b'},mcpActor]){
    fake.queue.push(ok(protectedDoc));if(reader===mcpActor)fake.queue.push(ok({title:'Published',body:'Published content'}),ok([]))
    const read=executeDocument({action:'read',id,shareKey:doc.share_key,accessToken:grant.accessToken},reader);if(reader===mcpActor)expect((await read).document!.body).toBe('Published content');else await expect(read).rejects.toMatchObject({message:'password_required'})
  }
})

it('lists my documents by creator across personal and project locations',async()=>{
  fake.queue.push(ok([doc,{...doc,id:randomUUID(),project_id:null}]))
  const output=await executeDocument({action:'list',scope:'mine'},actor)
  expect(output.documents).toHaveLength(2);expect(output.documents!.every(item=>item.canManage)).toBe(true)
  expect(fake.calls).toContainEqual(['eq','created_by',actor.userId]);expect(fake.calls).not.toContainEqual(['from','document_invites']);expect(fake.calls).not.toContainEqual(['from','project_members'])
})
it('combines owned, explicitly invited and project-accessible documents in the all view',async()=>{
  const projectKey='project,with"punctuation',sharedId=randomUUID(),guestId=randomUUID()
  fake.member.mockResolvedValue({role:'guest'})
  fake.queue.push(ok([{document_id:sharedId}]),ok([{project_key:projectKey}]),ok([
    doc,{...doc,id:guestId,created_by:'other',project_id:projectKey,access_mode:'project'},
    {...doc,id:sharedId,created_by:'other',access_mode:'private'},
    {...doc,id:randomUUID(),created_by:'other',access_mode:'link'},
    {...doc,id:randomUUID(),created_by:'other',access_mode:'private'},
  ]),ok({title:'Project publication'}),ok({email:actor.email}),ok({title:'Invited publication'}),ok(null))
  const output=await executeDocument({action:'list',scope:'all'},actor)
  expect(output.documents!.map(item=>item.title)).toEqual(['Draft title','Project publication','Invited publication'])
  expect(output.documents!.every(item=>item.body==='')).toBe(true);expect(output.documents![1]).toMatchObject({canEdit:false,canComment:false})
  expect(fake.calls).toContainEqual(['or',`created_by.eq.${actor.userId},id.in.(${sharedId}),and(access_mode.eq.project,project_id.in.(${JSON.stringify(projectKey)}))`])
})
it('limits the all view to owned documents when there are no invitations or memberships',async()=>{
  fake.queue.push(ok([]),ok([]),ok([doc]))
  expect((await executeDocument({action:'list',scope:'all'},actor)).documents).toHaveLength(1)
  expect(fake.calls).toContainEqual(['eq','created_by',actor.userId]);expect(fake.calls.some(call=>Array.isArray(call)&&call[0]==='or')).toBe(false)
})
it('keeps creator filtering and project membership checks when filters are combined',async()=>{
  fake.queue.push(ok([doc]));await executeDocument({action:'list',scope:'mine',projectId:'p'},actor)
  expect(fake.calls).toContainEqual(['eq','project_id','p']);expect(fake.calls).toContainEqual(['eq','created_by',actor.userId])
})
it('paginates the authorized all-documents query before returning the next offset',async()=>{
  fake.queue.push(ok([]),ok([{project_key:'p'}]),ok(Array(50).fill(doc)))
  expect((await executeDocument({action:'list',scope:'all',offset:50},actor)).nextOffset).toBe(100)
  expect(fake.calls).toContainEqual(['range',50,99])
})
it('requires authentication and validates the document list scope',async()=>{
  await expect(executeDocument({action:'list',scope:'all'},null)).rejects.toMatchObject({status:401})
  await expect(executeDocument({action:'list',scope:'invalid'},actor)).rejects.toThrow()
})
