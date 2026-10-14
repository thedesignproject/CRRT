import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useFeedbackMutationError } from './useFeedbackMutationError'
afterEach(cleanup)
it('reports rejected edits and blocks only expired subscription writes',()=>{
  const {result}=renderHook(()=>useFeedbackMutationError('project-A'))
  for(const error of [new Error('offline'),Object.assign(new Error('quota'),{status:402}),Object.assign(new Error('quota'),{status:402,resource:'comments'}),Object.assign(new Error('forbidden'),{status:403})]){
    act(()=>result.current.report(error));expect(result.current.error).toBe(error.message);expect(result.current.blocked).toBe(false)
  }
  act(()=>result.current.report('unknown'));expect(result.current.error).toMatch(/could not be updated/)
  act(()=>result.current.report(Object.assign(new Error('Cloud plan expired'),{status:402,resource:'subscription'})))
  expect(result.current.blocked).toBe(true);expect(result.current.error).toBe('Cloud plan expired')
})
it('clears rejection on scope changes and ignores stale mutation responses',()=>{
  const {result,rerender}=renderHook(({scope})=>useFeedbackMutationError(scope),{initialProps:{scope:'A'}})
  const old=result.current.report
  act(()=>old(Object.assign(new Error('Expired'),{status:402,resource:'subscription'})))
  rerender({scope:'B'});expect(result.current.error).toBe('');expect(result.current.blocked).toBe(false)
  act(()=>old(new Error('late A')));expect(result.current.error).toBe('')
  rerender({scope:'A'});act(()=>old(new Error('older A')));expect(result.current.error).toBe('')
})
