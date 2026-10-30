import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../../_lib/auth.js',()=>({requireUser:vi.fn(),requireProjectCapability:vi.fn()}))
vi.mock('../../../_lib/supabase.js',()=>({getServiceSupabase:vi.fn()}))
import {requireUser,requireProjectCapability} from '../../../_lib/auth.js'
import {getServiceSupabase} from '../../../_lib/supabase.js'
import handler from './restore'
const rpc=vi.fn(),id='00000000-0000-4000-8000-000000000001', items=[{id,updatedAt:'2026-10-30T12:00:00.123456Z'}]
const response=()=>({statusCode:200,body:null as unknown,status(n:number){this.statusCode=n;return this},json(body:unknown){this.body=body;return this},setHeader(){},end(){return this}})
async function call(body:unknown={projectId:'p',items},method='POST'){const res=response();await handler({method,headers:{},body} as never,res as never);return res}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@x.test'});vi.mocked(requireProjectCapability).mockResolvedValue({role:'admin'});vi.mocked(getServiceSupabase).mockReturnValue({rpc} as never);rpc.mockResolvedValue({data:[{id}],error:null})})
it('preserves precise versions and reports only restored IDs',async()=>{
 expect((await call()).body).toEqual({processedIds:[id],skipped:[]})
 expect(rpc).toHaveBeenCalledWith('restore_actor_inbox_feedback',{p_actor:'u',p_project:'p',p_items:[{id,updated_at:items[0].updatedAt}]})
 rpc.mockResolvedValue({data:null,error:null});expect((await call()).body).toEqual({processedIds:[],skipped:[{id,reason:'concurrent_change'}]})
})
it.each([{}, {projectId:'p',items:[]},{projectId:'p',items:[...items,...items]}, {projectId:'p',items:[{id,updatedAt:'invalid'}]}])('rejects malformed requests',async body=>{expect((await call(body)).statusCode).toBe(400);expect(rpc).not.toHaveBeenCalled()})
it('enforces method, login and project permissions',async()=>{
 expect((await call({},'OPTIONS')).statusCode).toBe(204);expect((await call({},'GET')).statusCode).toBe(405)
 vi.mocked(requireUser).mockResolvedValueOnce(null);await call();expect(rpc).not.toHaveBeenCalled()
 vi.mocked(requireProjectCapability).mockResolvedValueOnce(null);await call();expect(rpc).not.toHaveBeenCalled()
})
it.each([['forbidden',403],['offline',500]])('reports %s',async(message,status)=>{rpc.mockResolvedValue({error:{message}});expect((await call()).statusCode).toBe(status)})
it('handles non-Error failures',async()=>{rpc.mockRejectedValue('offline');expect((await call()).statusCode).toBe(500)})
