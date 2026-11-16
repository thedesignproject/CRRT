import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
vi.mock('./billing/agent-entitlement.js', () => ({ resolveWidgetAgentAccess: vi.fn() }))
import { getServiceSupabase } from './supabase.js'
import { resolveWidgetAgentAccess } from './billing/agent-entitlement.js'
import { dispatchRpc, listListeners, widgetDispatchState, sendDispatch, requireDispatchAccess } from './agent-dispatch'
const rpc=vi.fn(), from=vi.fn()
function query(result: unknown) {
  const q: any={}; for(const name of ['select','eq','contains','order']) q[name]=vi.fn(()=>q)
  q.limit=vi.fn(async()=>result); return q
}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getServiceSupabase).mockReturnValue({rpc,from} as never);rpc.mockResolvedValue({data:{},error:null});vi.mocked(resolveWidgetAgentAccess).mockResolvedValue({state:'ready'})})
it('passes immutable sender identity and retry inputs to the transaction',async()=>{
  const input={projectKey:'p',pageUrl:'https://example.com',listenerId:'listener',commentId:'comment',expectedUpdatedAt:'now',idempotencyKey:'key'}
  rpc.mockResolvedValueOnce({data:'admin'}).mockResolvedValueOnce({data:{dispatchId:'d',state:'queued'}})
  expect(await sendDispatch('actor',input)).toEqual({dispatchId:'d',state:'queued'})
  expect(rpc).toHaveBeenLastCalledWith('agent_dispatch_send',{p_actor:'actor',p_project:'p',p_page:input.pageUrl,p_listener:'listener',p_comment:'comment',p_expected:'now',p_key:'key'})
})
it('requires plan and live project access before reading or writing',async()=>{
  vi.mocked(resolveWidgetAgentAccess).mockResolvedValueOnce({state:'forbidden'})
  await expect(requireDispatchAccess('p','u')).rejects.toMatchObject({status:403,code:'forbidden'})
  expect(rpc).not.toHaveBeenCalled()
  rpc.mockResolvedValueOnce({error:{message:'forbidden'}})
  await expect(requireDispatchAccess('p','u')).rejects.toMatchObject({status:403})
})
it.each([['forbidden',403],['insufficient_scope',403],['cloud_plan_limit:subscription',403],['feedback_changed',409],['unknown database detail',503]])('maps %s without leaking database details',async(message,status)=>{
  rpc.mockResolvedValue({error:{message}})
  await expect(dispatchRpc('x',{})).rejects.toMatchObject({status})
})
it('handles void RPC results',async()=>{rpc.mockResolvedValue({data:null});expect(await dispatchRpc('x',{})).toEqual({})})
it('lists only permitted destinations and distinguishes offline/stopped/revoked',async()=>{
  const recent=new Date().toISOString(), old=new Date(0).toISOString()
  const rows=[{id:'live',heartbeat_at:recent,stopped:false},{id:'old',heartbeat_at:old,stopped:false},{id:'stopped',heartbeat_at:recent,stopped:true},{id:'revoked',heartbeat_at:recent,stopped:false}].map(r=>({...r,label:'Codex',repo_url:'https://github.com/a/b'}))
  const q=query({data:rows});from.mockReturnValue(q)
  rpc.mockImplementation(async(name,args)=>({data:{},error:args?.l?.id==='revoked'?{message:'forbidden'}:null}))
  const result=await listListeners('p','u')
  expect(q.contains).toHaveBeenCalledWith('sender_ids',['u'])
  expect(result.map(r=>r.online)).toEqual([true,false,false,false])
  expect(result[0]).not.toHaveProperty('connection_id')
})
it('recovers this connection’s listeners without returning others',async()=>{
  const q=query({data:null});from.mockReturnValue(q)
  expect(await listListeners('p','u','connection')).toEqual([])
  expect(q.eq).toHaveBeenCalledWith('connection_id','connection');expect(q.eq).toHaveBeenCalledWith('user_id','u')
  expect(q.contains).not.toHaveBeenCalled()
})
it('fails closed on listener storage errors',async()=>{from.mockReturnValue(query({error:{message:'offline'}}));await expect(listListeners('p','u')).rejects.toMatchObject({status:503})})
it('returns page-scoped delivery and implementation states',async()=>{
  const q=query({data:['queued','received','received','received','completed','cancelled'].map((state,i)=>({id:String(i),comment_id:'c',listener_id:'l',state,reason:null,comments:{implementation_status:['unassigned','claimed','in_progress','blocked','ready_for_testing','unassigned'][i]}}))})
  from.mockReturnValueOnce(query({data:[]})).mockReturnValueOnce(q)
  const result=await widgetDispatchState('p','https://example.com','u')
  expect(result.dispatches.map(d=>d.state)).toEqual(['queued','received','working','blocked','completed','cancelled'])
  expect(q.eq).toHaveBeenCalledWith('comments.url','https://example.com')
})
it('handles empty history and history failures',async()=>{
  from.mockReturnValue(query({data:null}));expect((await widgetDispatchState('p','url','u')).dispatches).toEqual([])
  from.mockReturnValueOnce(query({data:[]})).mockReturnValueOnce(query({error:{message:'fail'}}))
  await expect(widgetDispatchState('p','url','u')).rejects.toMatchObject({status:503})
})
