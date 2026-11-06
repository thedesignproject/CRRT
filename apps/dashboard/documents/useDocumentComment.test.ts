// @vitest-environment jsdom
import{act,renderHook}from'@testing-library/react'
import{beforeEach,expect,it,vi}from'vitest'
vi.mock('./client',async original=>({...await original<object>(),documentRequest:vi.fn()}))
import{documentRequest,DocumentRequestError}from'./client'
import{useDocumentComment}from'./useDocumentComment'
const request=vi.mocked(documentRequest),id='11111111-1111-4111-8111-111111111111',input={id,revision:1,body:'Feedback',author:'Reviewer',quote:'',prefix:'',suffix:''}
beforeEach(()=>request.mockReset())
it('requires a known principal before authenticated submission',async()=>{
  const{result}=renderHook(()=>useDocumentComment('/api','token',null));await expect(result.current.submit(input)).rejects.toMatchObject({code:'feedback_account_changed'});expect(request).not.toHaveBeenCalled();expect(result.current.hasPending()).toBe(false)
})
it('requires discard before replacing an unresolved draft and starts a new operation afterward',async()=>{
  request.mockRejectedValueOnce(new Error('Offline'));const{result}=renderHook(()=>useDocumentComment('/api',null,null));await act(async()=>{await expect(result.current.submit(input)).rejects.toThrow('Offline')});expect(result.current.locked).toBe(true);expect(result.current.hasPending()).toBe(true)
  await expect(result.current.submit({...input,body:'Changed draft'})).rejects.toMatchObject({code:'feedback_draft_changed'});expect(request).toHaveBeenCalledTimes(1);const key=(request.mock.calls[0][2] as any).key
  act(()=>result.current.discard());request.mockResolvedValueOnce({feedbackId:id}).mockResolvedValueOnce({feedback:[]});await act(async()=>{await result.current.submit({...input,body:'Changed draft'})});expect((request.mock.calls[1][2] as any).key).not.toBe(key);expect(result.current.locked).toBe(false)
})
it('does not replay an authenticated write after logout but can reconcile a known receipt after switching accounts',async()=>{
  const{result,rerender}=renderHook(({session,userId})=>useDocumentComment('/api',session,userId),{initialProps:{session:'token-a' as string|null,userId:'user-a'}});request.mockRejectedValueOnce(new Error('Offline'));await act(async()=>{await expect(result.current.submit(input)).rejects.toThrow()})
  rerender({session:'token-b',userId:'user-b'});await expect(result.current.submit(input)).rejects.toMatchObject({code:'feedback_account_changed'});expect(request).toHaveBeenCalledTimes(1)
  rerender({session:null,userId:'user-a'});await expect(result.current.submit(input)).rejects.toMatchObject({code:'feedback_account_changed'});expect(request).toHaveBeenCalledTimes(1)
  rerender({session:'new-token-a',userId:'user-a'});request.mockResolvedValueOnce({feedbackId:id}).mockRejectedValueOnce(new Error('Read lost'));await act(async()=>{await expect(result.current.submit(input)).rejects.toThrow('Read lost')})
  rerender({session:'token-b',userId:'user-b'});request.mockResolvedValueOnce({feedback:[]});await act(async()=>{await result.current.submit(input)});expect(request).toHaveBeenLastCalledWith('/api','token-b',{action:'read',id,feedbackId:id});expect(request.mock.calls.filter(call=>(call[2] as any).action==='comment')).toHaveLength(2)
})
it('uses the current account only for receipt reads when authentication changes during submission',async()=>{
  let finish!:(value:object)=>void;request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));const{result,rerender}=renderHook(({session,userId})=>useDocumentComment('/api',session,userId),{initialProps:{session:null as string|null,userId:null as string|null}})
  let work!:Promise<unknown>;act(()=>{work=result.current.submit(input)});rerender({session:'token-new',userId:'new-user'});request.mockResolvedValueOnce({feedback:[]});await act(async()=>{finish({feedbackId:id});await work});expect(request.mock.calls[0][1]).toBeNull();expect(request).toHaveBeenLastCalledWith('/api','token-new',{action:'read',id,feedbackId:id})
})
it('reuses the guest operation through password reauthentication and publication changes',async()=>{
  request.mockRejectedValueOnce(new DocumentRequestError('password_required'));const{result}=renderHook(()=>useDocumentComment('/api',null,null));await act(async()=>{await expect(result.current.submit({...input,shareKey:id,accessToken:'expired'})).rejects.toThrow()});expect(result.current.locked).toBe(true);const key=(request.mock.calls[0][2] as any).key
  request.mockResolvedValueOnce({feedbackId:id}).mockResolvedValueOnce({feedback:[]});await act(async()=>{await result.current.submit({...input,revision:2,shareKey:id,accessToken:'fresh'})});expect(request.mock.calls[1]).toEqual(['/api',null,{...input,action:'comment',key,shareKey:id,accessToken:'fresh'}]);expect(request.mock.calls[2]).toEqual(['/api',null,{action:'read',id,shareKey:id,accessToken:'fresh',feedbackId:id}])
})
it('abandons a known uncommitted revision failure before retrying the new publication',async()=>{
  request.mockRejectedValueOnce(new DocumentRequestError('revision_not_found'));const{result}=renderHook(()=>useDocumentComment('/api',null,null));await act(async()=>{await expect(result.current.submit(input)).rejects.toThrow()});expect(result.current.locked).toBe(false);expect(result.current.hasPending()).toBe(false);const key=(request.mock.calls[0][2] as any).key
  request.mockResolvedValueOnce({feedbackId:id}).mockResolvedValueOnce({feedback:[]});await act(async()=>{await result.current.submit({...input,revision:2})});expect((request.mock.calls[1][2] as any)).toMatchObject({revision:2});expect((request.mock.calls[1][2] as any).key).not.toBe(key)
})
