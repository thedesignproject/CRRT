import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../../_lib/auth.js',()=>({requireUser:vi.fn()}))
vi.mock('../../../_lib/store.js',()=>({getComment:vi.fn(),resolveTrackerDispatch:vi.fn()}))
import {requireUser} from '../../../_lib/auth.js'
import {getComment,resolveTrackerDispatch} from '../../../_lib/store.js'
import handler from './external-work-recovery.js'
const response=()=>({statusCode:200,body:null as any,status(n:number){this.statusCode=n;return this},json(b:any){this.body=b;return this},end(){return this},setHeader:vi.fn()})
const req=(extra:object={})=>({method:'POST',query:{commentId:'c'},headers:{},body:{provider:'linear',confirmCheckedTracker:true},...extra})
beforeEach(()=>{
 vi.mocked(requireUser).mockReset().mockResolvedValue({userId:'u',email:'u@test'})
 vi.mocked(getComment).mockReset().mockResolvedValue({projectId:'p'} as never)
 vi.mocked(resolveTrackerDispatch).mockReset().mockResolvedValue(true)
})
it('validates method, authentication, comment, provider and explicit confirmation',async()=>{
 for(const [input,status] of [[req({method:'OPTIONS'}),204],[req({method:'GET'}),405],[req({query:{}}),400],[req({body:{provider:'invalid',confirmCheckedTracker:true}}),400],[req({body:{provider:'jira',confirmCheckedTracker:false}}),400]] as const){
  const res=response();await handler(input as never,res as never);expect(res.statusCode).toBe(status)
 }
 vi.mocked(requireUser).mockResolvedValueOnce(null);const res=response();await handler(req() as never,res as never);expect(resolveTrackerDispatch).not.toHaveBeenCalled()
})
it('resolves an admin request and handles missing comments or pending exports',async()=>{
 const res=response();await handler(req() as never,res as never);expect(res.body).toEqual({resolved:true})
 expect(resolveTrackerDispatch).toHaveBeenCalledWith('p','u','c','linear')
 vi.mocked(getComment).mockResolvedValueOnce(null);const missing=response();await handler(req() as never,missing as never);expect(missing.statusCode).toBe(404)
 vi.mocked(resolveTrackerDispatch).mockResolvedValueOnce(false);const none=response();await handler(req() as never,none as never);expect(none.statusCode).toBe(404)
})
it.each([[new Error('forbidden'),403],[new Error('tracker_dispatch_active'),409],[new Error('tracker_dispatch_unconfirmed'),409],[new Error('database down'),500],['opaque',500]])('fails closed on recovery error %j',async(error,status)=>{
 vi.mocked(resolveTrackerDispatch).mockRejectedValueOnce(error)
 const res=response();await handler(req() as never,res as never);expect(res.statusCode).toBe(status);expect(res.body).not.toHaveProperty('resolved')
})
