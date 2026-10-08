import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from './supabase.js'
import { createSystemShare, createShare, createWidgetAgentShare, getShareById, rotateShareToken, getCommentForGithubIssue, mutateProjectFeedback } from './store.js'
const row={ id:'c',project_id:'p',comment:'Private body',status:'approved',visibility:'shared',implementation_status:'unassigned',url:'https://test.local',x:1,y:1,element:'body',created_at:'now',updated_at:'now',scope_type:'selection',slug:'s',access_token_hash:'h',access_token_ciphertext:'cipher' }
let result:any, rpc:ReturnType<typeof vi.fn>
beforeEach(()=>{
 result={data:row,error:null}
 const q:any={then:(yes:any)=>Promise.resolve(result).then(yes),single:async()=>result,maybeSingle:async()=>result}
 for(const name of ['select','eq','insert','update'])q[name]=()=>q
 rpc=vi.fn(()=>q)
 vi.mocked(getServiceSupabase).mockReturnValue({rpc,from:()=>q} as never)
})
it('binds every human mutation field to its current actor and handles denial/missing comments', async()=>{
 expect((await mutateProjectFeedback('p','u','c',{reviewStatus:'accepted',implementationStatus:'unassigned',claimedByAgentId:null,visibility:'internal'}))?.body).toBe('Private body')
 expect(rpc).toHaveBeenCalledWith('mutate_actor_feedback',{p_project:'p',p_actor:'u',p_comment:'c',p_patch:{status:'approved',implementation_status:'unassigned',claimed_by_agent_id:null,visibility:'internal'}})
 result={data:null,error:null};expect(await mutateProjectFeedback('p','u','c',{})).toBeNull()
 result={data:null,error:{message:'forbidden'}};await expect(mutateProjectFeedback('p','u','c',{})).rejects.toThrow('forbidden')
})
it('reads provider feedback with an actor-bound database gate', async()=>{
 expect((await getCommentForGithubIssue('p','c','u'))?.body).toBe('Private body')
 expect(rpc).toHaveBeenCalledWith('read_actor_comment',{p_project:'p',p_actor:'u',p_comment:'c',p_capability:'integrations:send'})
 result={data:null,error:{message:'forbidden'}};await expect(getCommentForGithubIssue('p','c','u')).rejects.toThrow('forbidden')
})
it('creates a reviewer share and its items in one authorized RPC', async()=>{
 const input={projectKey:'p',scopeType:'selection' as const,scopePageUrl:null,slug:'s',accessTokenHash:'h',accessTokenCiphertext:'cipher',createdBy:'reviewer',expiresAt:'2099-01-01'}
 await createShare(input,{actorUserId:'u',commentIds:['c']})
 expect(rpc).toHaveBeenCalledWith('create_actor_share',expect.objectContaining({p_actor:'u',p_project:'p',p_comments:['c']}))
 result={data:null,error:{message:'forbidden'}}
 await expect(createShare(input,{actorUserId:'u',commentIds:['c']})).rejects.toThrow('forbidden')
})
it('creates a premium widget share through the transactional RPC', async()=>{
 const input={projectKey:'p',actorUserId:'u',pageUrl:'https://test.local',idempotencyKey:'abcdefghijklmnop',requestHash:'a'.repeat(64),allowedPriceIds:['price'],commentIds:['c'],slug:'s',accessTokenHash:'h',accessTokenCiphertext:'cipher',expiresAt:'2099-01-01'}
 expect((await createWidgetAgentShare(input)).slug).toBe('s')
 expect(rpc).toHaveBeenCalledWith('create_widget_agent_share',{p_project:'p',p_actor:'u',p_page_url:'https://test.local',p_idempotency_key:'abcdefghijklmnop',p_request_hash:'a'.repeat(64),p_allowed_prices:['price'],p_share:{slug:'s',access_token_hash:'h',access_token_ciphertext:'cipher',expires_at:'2099-01-01'},p_comments:['c']})
 result={data:null,error:{message:'upgrade_required'}}
 await expect(createWidgetAgentShare(input)).rejects.toThrow('upgrade_required')
})
it('gates prompt token retrieval and rotation against the current actor', async()=>{
 await getShareById('s','u');expect(rpc).toHaveBeenCalledWith('read_actor_share',{p_share:'s',p_actor:'u'})
 await rotateShareToken('s',{accessTokenHash:'h',accessTokenCiphertext:'cipher'},{accessTokenHash:'new',accessTokenCiphertext:'new'},'u')
 expect(rpc).toHaveBeenCalledWith('rotate_actor_share',{p_share:'s',p_actor:'u',p_expected_hash:'h',p_expected_cipher:'cipher',p_hash:'new',p_cipher:'new'})
})

it('creates only automatic system credentials and propagates database privacy fences', async()=>{
 const input={projectKey:'p',slug:'s',accessTokenHash:'h',accessTokenCiphertext:'cipher',expiresAt:'2099-01-01'}
 expect((await createSystemShare(input)).slug).toBe('s')
 result={data:null,error:{message:'private_project'}}
 await expect(createSystemShare(input)).rejects.toThrow('private_project')
})

it('binds tracker acceptance to the current actor',async()=>{
 const {acceptCommentIfOpen}=await import('./store.js')
 expect((await acceptCommentIfOpen('p','c','u'))?.body).toBe('Private body')
 expect(rpc).toHaveBeenCalledWith('accept_actor_comment_if_open',{p_project:'p',p_actor:'u',p_comment:'c'})
 result={data:null,error:null};expect(await acceptCommentIfOpen('p','c','u')).toBeNull()
 result={data:null,error:{message:'forbidden'}};await expect(acceptCommentIfOpen('p','c','u')).rejects.toThrow('forbidden')
})
it('binds event reads and atomic presence writes to the presented token hash',async()=>{
 const {listFeedbackEvents,writeAgentPresence}=await import('./store.js')
 result={data:[{id:1,share_id:'s',payload:{body:'secret'}}],error:null}
 expect(await listFeedbackEvents('s',0,100,'hash')).toHaveLength(1)
 expect(rpc).toHaveBeenCalledWith('read_agent_events',{p_share:'s',p_token_hash:'hash',p_after:0,p_limit:100})
 await writeAgentPresence('s','hash','agent','active',null)
 expect(rpc).toHaveBeenCalledWith('write_agent_presence',{p_share:'s',p_token_hash:'hash',p_agent:'agent',p_status:'active',p_summary:null})
 result={data:null,error:null};expect(await listFeedbackEvents('s',0,100,'hash')).toEqual([])
 result={data:null,error:{message:'share_unavailable'}}
 await expect(listFeedbackEvents('s',0,100,'hash')).rejects.toThrow('share_unavailable')
 await expect(writeAgentPresence('s','hash','agent','active','summary')).rejects.toThrow('share_unavailable')
})

it('atomically checks the actor and records a durable tracker dispatch fence',async()=>{
 const {beginTrackerDispatch}=await import('./store.js')
 result={data:true,error:null};expect(await beginTrackerDispatch('p','c','u','lease','work')).toBe(true)
 expect(rpc).toHaveBeenCalledWith('begin_actor_tracker_dispatch',{p_project:'p',p_actor:'u',p_comment:'c',p_lease:'lease',p_work:'work'})
 result={data:false,error:null};expect(await beginTrackerDispatch('p','c','u','lease',null)).toBe(false)
 result={data:null,error:{message:'forbidden'}};await expect(beginTrackerDispatch('p','c','u','lease',null)).rejects.toThrow('forbidden')
})
it('fences duplicate lookups with the presented token hash',async()=>{
 const {getOperationKey}=await import('./store.js')
 result={data:{feedback_event_id:5},error:null};expect(await getOperationKey('s','agent','key','hash')).toMatchObject({feedback_event_id:5})
 expect(rpc).toHaveBeenCalledWith('read_agent_operation_key',{p_share:'s',p_token_hash:'hash',p_agent:'agent',p_key:'key'})
 result={data:null,error:null};expect(await getOperationKey('s','agent','key','hash')).toBeNull()
 result={data:null,error:{message:'share_unavailable'}};await expect(getOperationKey('s','agent','key','hash')).rejects.toThrow('share_unavailable')
})
it('handles comment events suppressed by the eligibility trigger',async()=>{
 const {createFeedbackEvent}=await import('./store.js')
 const input={shareId:'s',actorType:'reviewer',actorId:'u',eventType:'comment.implementation_changed'}
 expect(await createFeedbackEvent(input)).toHaveProperty('id')
 result={data:null,error:null};expect(await createFeedbackEvent({...input,commentId:'c',payload:{implementationStatus:'blocked'}})).toBeNull()
 result={data:null,error:{message:'database down'}};await expect(createFeedbackEvent(input)).rejects.toThrow('database down')
})

it('routes tracker recovery through the current-admin database gate',async()=>{
 const {resolveTrackerDispatch}=await import('./store.js')
 result={data:true,error:null};expect(await resolveTrackerDispatch('p','u','c','linear')).toBe(true)
 expect(rpc).toHaveBeenCalledWith('resolve_actor_tracker_dispatch',{p_project:'p',p_actor:'u',p_comment:'c',p_provider:'linear'})
 result={data:false,error:null};expect(await resolveTrackerDispatch('p','u','c','github')).toBe(false)
 result={data:null,error:{message:'tracker_dispatch_active'}};await expect(resolveTrackerDispatch('p','u','c','jira')).rejects.toThrow('tracker_dispatch_active')
})

it('acknowledges only the exact sender lease after callback completion',async()=>{
 const {acknowledgeTrackerDispatchStopped}=await import('./store.js')
 result={data:null,error:null};await acknowledgeTrackerDispatchStopped('p','c','lease','work')
 expect(rpc).toHaveBeenCalledWith('acknowledge_tracker_dispatch_stopped',{p_project:'p',p_comment:'c',p_lease:'lease',p_work:'work'})
 result={data:null,error:{message:'database down'}};await expect(acknowledgeTrackerDispatchStopped('p','c','lease',null)).rejects.toThrow('database down')
})
