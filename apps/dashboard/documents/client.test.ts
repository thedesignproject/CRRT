// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {documentRequest,documentMessage,DocumentRequestError,mergeFeedback} from './client'
const id='11111111-1111-4111-8111-111111111111',fetcher=vi.fn()
const response=(data:object,ok=true)=>Promise.resolve({ok,json:async()=>data})
beforeEach(()=>{vi.stubGlobal('fetch',fetcher);fetcher.mockReset()})
afterEach(()=>vi.unstubAllGlobals())
it('handles client authorization, public errors, missing errors, and friendly messages',async()=>{
  fetcher.mockImplementationOnce(()=>response({id}));await documentRequest('/api','session',{action:'read',id});expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer session')
  fetcher.mockImplementationOnce(()=>response({error:'forbidden'},false));await expect(documentRequest('/api',null,{})).rejects.toMatchObject({code:'forbidden'})
  fetcher.mockImplementationOnce(()=>response({},false));await expect(documentRequest('/api',null,{})).rejects.toMatchObject({code:'document_unavailable'})
  expect(documentMessage(new DocumentRequestError('forbidden'))).toContain('permission');expect(documentMessage(new DocumentRequestError('unknown'))).toContain('try again');expect(documentMessage(new Error())).toContain('connection')
})
it('merges feedback pages without losing loaded rows or duplicating refreshed replies',()=>{
  const old={id:'old',body:'Original'},reply={id:'reply',body:'Reply'}
  expect(mergeFeedback([old,reply] as never,[{...old,body:'Updated'},{id:'new',body:'New'}] as never)).toEqual([{...old,body:'Updated'},reply,{id:'new',body:'New'}])
})
