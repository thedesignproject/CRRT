import {expect,it} from 'vitest'
import {parsePlanFailure} from './plan-errors.js'
it('accepts only a complete server plan error and rejects malformed or unrelated messages',()=>{
  const payload={code:'plan_limit',resource:'comments',usage:2000,limit:2000,resetAt:'2026-11-01',action:'upgrade_or_wait'}
  const message='cloud_plan_limit:'+JSON.stringify(payload)
  expect(parsePlanFailure(new Error(message))).toEqual(payload);expect(parsePlanFailure(message)).toEqual(payload)
  for(const value of [null,{},new Error('database unavailable'),'cloud_plan_limit:{','cloud_plan_limit:{}','cloud_plan_limit:'+JSON.stringify({...payload,resource:'unknown'})])expect(parsePlanFailure(value)).toBe(null)
})
