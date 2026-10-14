import {expect,it,vi} from 'vitest'
import {jsonError} from './http.js'

it('returns stable resource metadata without exposing database errors', () => {
  const payload={code:'plan_limit',resource:'comments',usage:2000,limit:2000,resetAt:'2026-11-01',action:'upgrade_or_wait'}
  const response={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()}
  jsonError({headers:{}} as never,response as never,500,'Internal server error',new Error('cloud_plan_limit:'+JSON.stringify(payload)))
  expect(response.status).toHaveBeenCalledWith(409)
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining(payload))
  jsonError({headers:{}} as never,response as never,500,'Internal server error','cloud_plan_limit:'+JSON.stringify({...payload,resource:'subscription',limit:null}))
  expect(response.status).toHaveBeenLastCalledWith(402)
})

it('shows resource counts for clients that only display the error text',()=>{
 const response={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()}
 jsonError({headers:{}}as never,response as never,500,'Internal server error','cloud_plan_limit:'+JSON.stringify({code:'plan_limit',resource:'projects',usage:10,limit:10,resetAt:null,action:'upgrade_or_wait'}))
 expect(response.json).toHaveBeenCalledWith(expect.objectContaining({error:expect.stringContaining('Usage: 10/10. Reset: not applicable.')}))
})
