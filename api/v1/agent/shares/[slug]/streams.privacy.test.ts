import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../../../_lib/shares.js',()=>({requireAgentShare:vi.fn()}))
vi.mock('../../../../_lib/store.js',()=>({listFeedbackEvents:vi.fn(),writeAgentPresence:vi.fn()}))
import {requireAgentShare} from '../../../../_lib/shares.js'
import {listFeedbackEvents,writeAgentPresence} from '../../../../_lib/store.js'
import {hashToken} from '../../../../_lib/tokens.js'
import events from './events.js'
import presence from './presence.js'
const response=()=>({statusCode:200,body:null as any,status(n:number){this.statusCode=n;return this},json(b:any){this.body=b;return this},end(){return this},setHeader:vi.fn()})
const req=(method:string,extra:object={})=>({method,query:{slug:'s'},headers:{'x-agent-id':'agent'},body:{status:'active',summary:'summary'},...extra})
beforeEach(()=>{
 vi.mocked(requireAgentShare).mockReset().mockResolvedValue({share:{id:'s'},token:'token'} as never)
 vi.mocked(listFeedbackEvents).mockReset().mockResolvedValue([{id:5}] as never)
 vi.mocked(writeAgentPresence).mockReset().mockResolvedValue(undefined)
})
it.each([events,presence])('validates stream methods, slug and initial authorization',async handler=>{
 for(const [input,status] of [[req('OPTIONS'),204],[req('DELETE'),405],[req(handler===events?'GET':'POST',{query:{}}),400]] as const){
  const res=response();await handler(input as never,res as never);expect(res.statusCode).toBe(status)
 }
 vi.mocked(requireAgentShare).mockResolvedValueOnce(null)
 const res=response();await handler(req(handler===events?'GET':'POST') as never,res as never)
 expect(listFeedbackEvents).not.toHaveBeenCalled();expect(writeAgentPresence).not.toHaveBeenCalled()
})
it('returns current events, clamps query values and passes the presented token hash',async()=>{
 const res=response();await events(req('GET') as never,res as never)
 expect(res.body).toEqual({events:[{id:5}],nextCursor:5})
 expect(listFeedbackEvents).toHaveBeenCalledWith('s',0,100,hashToken('token'))
 for(const [query,after,limit] of [[{slug:'s',after:'bad',limit:'bad'},0,100],[{slug:'s',after:'4',limit:'500'},4,100],[{slug:'s',after:'4',limit:'0'},4,1]] as const){
  vi.mocked(listFeedbackEvents).mockResolvedValueOnce([])
  const result=response();await events(req('GET',{query}) as never,result as never)
  expect(listFeedbackEvents).toHaveBeenLastCalledWith('s',after,limit,hashToken('token'))
  expect(result.body.events).toEqual([])
 }
})
it('validates presence fields and writes presence/events atomically with the current token',async()=>{
 for(const body of [{status:''},{},{status:1}]){
  const res=response();await presence(req('POST',{body}) as never,res as never);expect(res.statusCode).toBe(400)
 }
 const missing=response();await presence(req('POST',{headers:{}}) as never,missing as never);expect(missing.statusCode).toBe(400)
 for(const summary of ['summary',undefined,5]){
  const res=response();await presence(req('POST',{body:{status:'active',summary}}) as never,res as never)
  expect(res.body).toEqual({success:true})
  expect(writeAgentPresence).toHaveBeenLastCalledWith('s',hashToken('token'),'agent','active',typeof summary==='string'?summary:null)
 }
})
it.each([events,presence])('fails closed when the atomic operation sees revoked credentials',async handler=>{
 const operation=handler===events?listFeedbackEvents:writeAgentPresence
 for(const [error,status] of [[new Error('share_unavailable'),410],[new Error('database down'),500],['opaque',500]] as const){
  vi.mocked(operation).mockRejectedValueOnce(error)
  const res=response();await handler(req(handler===events?'GET':'POST') as never,res as never)
  expect(res.statusCode).toBe(status);expect(res.body).not.toHaveProperty('events');expect(res.body).not.toHaveProperty('success')
 }
})
