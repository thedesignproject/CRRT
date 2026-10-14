import {beforeEach,expect,it,vi}from'vitest'
vi.mock('../../../_lib/auth.js',()=>({requireUser:vi.fn(),requireProjectCapability:vi.fn()}))
vi.mock('../../../_lib/supabase.js',()=>({getServiceSupabase:vi.fn()}))
import {requireUser,requireProjectCapability}from'../../../_lib/auth.js'
import {getServiceSupabase}from'../../../_lib/supabase.js'
import handler from'./export.js'
const read=vi.fn(),gt=vi.fn(),limit=vi.fn(),rpc=vi.fn()
function query(){const q={order:()=>q,limit:(n:number)=>{limit(n);return q},gt:(field:string,cursor:string)=>{gt(field,cursor);return q},then:(resolve:(value:unknown)=>unknown,reject:(value:unknown)=>unknown)=>read().then(resolve,reject)};return q}
function res(){return{setHeader:vi.fn(),statusCode:200,body:null as any,status(n:number){this.statusCode=n;return this},json(body:unknown){this.body=body;return this},end(){return this}}}
async function call(method='GET',projectId:unknown='project'){const response=res();await handler({method,headers:{},query:{projectId}}as never,response as never);return response}
beforeEach(()=>{
 vi.resetAllMocks();vi.mocked(requireUser).mockResolvedValue({userId:'actor',email:'member@example.com'});vi.mocked(requireProjectCapability).mockResolvedValue({role:'guest'}as never)
 vi.mocked(getServiceSupabase).mockReturnValue({rpc}as never);rpc.mockImplementation(query);read.mockResolvedValue({data:[],error:null})
})
it('requires a valid session and project read permission, not a subscription',async()=>{
 expect((await call('OPTIONS')).statusCode).toBe(204);expect((await call('POST')).statusCode).toBe(405)
 expect((await call('GET',null)).statusCode).toBe(400)
 vi.mocked(requireUser).mockResolvedValue(null);await call();expect(rpc).not.toHaveBeenCalled()
 vi.mocked(requireUser).mockResolvedValue({userId:'actor',email:''});vi.mocked(requireProjectCapability).mockResolvedValue(null);await call();expect(rpc).not.toHaveBeenCalled()
})
it('paginates the permission-aware read RPC and produces an uncached download',async()=>{
 read.mockResolvedValueOnce({data:Array.from({length:1000},(_,id)=>({id})),error:null}).mockResolvedValueOnce({data:[{id:1000}],error:null})
 const response=await call();expect(response.body.comments).toHaveLength(1001)
 expect(rpc).toHaveBeenCalledWith('read_project_feedback',{p_project:'project',p_actor:'actor'})
 expect(gt).toHaveBeenCalledWith('id',999);expect(limit).toHaveBeenCalledWith(1000);expect(response.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
 expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition',expect.stringContaining('attachment'))
})
it('returns a retryable error instead of a partial export on database failure',async()=>{
 read.mockResolvedValue({data:null,error:{message:'unavailable'}});expect((await call()).statusCode).toBe(503)
})

it.each(['delete','insert'])('uses a stable UUID cursor during concurrent %s',async mutation=>{
 let rows=Array.from({length:1001},(_,n)=>({id:String(n).padStart(5,'0')}))
 let cursor:string|undefined
 gt.mockImplementation((_field,next)=>{cursor=next})
 read.mockImplementation(async()=>{
   const page=rows.filter(row=>!cursor || row.id>cursor).slice(0,1000)
   if(!cursor){if(mutation==='delete')rows=rows.slice(1);else rows=[{id:'00000a'},...rows]}
   return {data:page,error:null}
 })
 const response=await call();expect(response.statusCode).toBe(200)
 expect(response.body.comments).toHaveLength(1001)
 expect(new Set(response.body.comments.map((row:{id:string})=>row.id)).size).toBe(1001)
 expect(response.body.comments.at(-1).id).toBe('01000')
})
