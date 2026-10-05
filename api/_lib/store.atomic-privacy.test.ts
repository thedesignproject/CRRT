import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from './supabase.js'
import { createSystemShare, createShare, getShareById, rotateShareToken, getCommentForGithubIssue, mutateProjectFeedback } from './store.js'
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
