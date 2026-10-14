import {beforeEach,expect,it,vi}from'vitest'
vi.mock('../../_lib/auth.js',()=>({requireUser:vi.fn()}))
vi.mock('../../_lib/billing/import-feedback.js',async importOriginal=>({...await importOriginal<typeof import('../../_lib/billing/import-feedback.js')>(),importLocalFeedback:vi.fn()}))
import {requireUser}from'../../_lib/auth.js'
import {importLocalFeedback}from'../../_lib/billing/import-feedback.js'
import handler from'./import.js'
const input={projectId:'local',name:'Local',comments:[]}
function res(){return{setHeader:vi.fn(),statusCode:200,body:null as unknown,status(n:number){this.statusCode=n;return this},json(body:unknown){this.body=body;return this},end(){return this}}}
async function call(method='POST',body:unknown=input){const response=res();await handler({method,body,headers:{},query:{}}as never,response as never);return response}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(requireUser).mockResolvedValue({userId:'actor',email:'owner@example.com'});vi.mocked(importLocalFeedback).mockResolvedValue({projectId:'local',imported:0})})
it('requires supported methods, a session and a valid bounded import',async()=>{
 expect((await call('OPTIONS')).statusCode).toBe(204);expect((await call('GET')).statusCode).toBe(405)
 expect((await call('POST',{})).statusCode).toBe(400)
 vi.mocked(requireUser).mockResolvedValue(null);await call();expect(importLocalFeedback).not.toHaveBeenCalled()
})
it('uses the authenticated actor and returns a retry-safe receipt',async()=>{
 expect((await call()).body).toEqual({projectId:'local',imported:0});expect(importLocalFeedback).toHaveBeenCalledWith('actor',input)
 vi.mocked(importLocalFeedback).mockRejectedValue(new Error('unavailable'));expect((await call()).statusCode).toBe(409)
})
