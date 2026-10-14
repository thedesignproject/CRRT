import { expect, it } from 'vitest'
import { responseError } from './response-error'
it('extracts readable API errors and retains subscription metadata', () => {
  expect(responseError('{"error":"Start a Cloud plan","resource":"subscription"}',402)).toMatchObject({message:'Start a Cloud plan',status:402,resource:'subscription'})
})
it.each(['{}','null','{"error":0}','{"error":" "}'])('uses a readable fallback for malformed JSON errors: %s',body=>{
  expect(responseError(body,500).message).toBe('Request failed with 500')
})
it('handles proxy text and empty responses',()=>{
  expect(responseError('Service unavailable',503).message).toBe('Service unavailable')
  expect(responseError('',503).message).toBe('Request failed with 503')
})

it('preserves Agent handoff error codes alongside readable errors',()=>{
 expect(responseError('{"error":"Upgrade required","code":"agent_upgrade_required"}',402)).toMatchObject({message:'Upgrade required',status:402,code:'agent_upgrade_required'})
 expect(responseError('{"error":"Failure","code":123}',500).code).toBeUndefined()
})
