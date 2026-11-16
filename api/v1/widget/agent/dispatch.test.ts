import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../_lib/agent-dispatch.js',async original=>({...await original<object>(),sendDispatch:vi.fn(),widgetDispatchState:vi.fn()}))
vi.mock('../../../_lib/widget-session.js',async original=>({...await original<object>(),requireWidgetSession:vi.fn(),assertWidgetPage:vi.fn()}))
import { sendDispatch,widgetDispatchState,DispatchError } from '../../../_lib/agent-dispatch'
import { requireWidgetSession,assertWidgetPage,WidgetSessionError } from '../../../_lib/widget-session'
import handler from './dispatch'
const id='11111111-1111-4111-8111-111111111111'
const input={projectKey:'p',pageUrl:'https://example.com/page',listenerId:id,commentId:id,expectedUpdatedAt:'2026-11-16T00:00:00.123456Z',idempotencyKey:id}
async function call(method: string|undefined='POST',body:unknown=input,query:Record<string,string>={projectKey:'p',pageUrl:input.pageUrl}){
  const res={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn(),end:vi.fn()}
  await handler({method,body,query,headers:{}} as never,res as never);return res
}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(requireWidgetSession).mockResolvedValue({user_id:'actor',project_key:'p',origin:'https://example.com',display_name:'Owner',expires_at:'later'});vi.mocked(sendDispatch).mockResolvedValue({state:'queued',dispatchId:id});vi.mocked(widgetDispatchState).mockResolvedValue({listeners:[],dispatches:[]})})
it('supports preflight and restricts methods without authenticating',async()=>{
  expect((await call('OPTIONS')).status).toHaveBeenCalledWith(204)
  expect((await call('DELETE')).status).toHaveBeenCalledWith(405)
  const res={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn(),end:vi.fn()};await handler({headers:{}} as never,res as never);expect(res.status).toHaveBeenCalledWith(405)
  expect(requireWidgetSession).not.toHaveBeenCalled()
})
it('binds SEND to authenticated identity and widget origin and never caches it',async()=>{
  const res=await call();expect(res.status).toHaveBeenCalledWith(200);expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
  expect(assertWidgetPage).toHaveBeenCalledWith(expect.objectContaining({user_id:'actor'}),'p',input.pageUrl)
  expect(sendDispatch).toHaveBeenCalledWith('actor',input)
  expect((await call('POST',{...input,actor:'forged'})).status).toHaveBeenCalledWith(400)
})
it('returns scoped status and rejects missing query parameters',async()=>{
  expect((await call('GET')).json).toHaveBeenCalledWith({listeners:[],dispatches:[]})
  expect(widgetDispatchState).toHaveBeenCalledWith('p',input.pageUrl,'actor')
  expect((await call('GET',{},{})).status).toHaveBeenCalledWith(400)
  expect((await call('GET',{}, {projectKey:'p'})).status).toHaveBeenCalledWith(400)
})
it('rejects expired sessions, scope mismatches and storage failures',async()=>{
  vi.mocked(requireWidgetSession).mockRejectedValueOnce(new WidgetSessionError(401,'expired'));expect((await call()).status).toHaveBeenCalledWith(401)
  vi.mocked(assertWidgetPage).mockImplementationOnce(()=>{throw new WidgetSessionError(403,'origin')});expect((await call()).status).toHaveBeenCalledWith(403)
  vi.mocked(sendDispatch).mockRejectedValueOnce(new DispatchError(409,'already_sent'));expect((await call()).json).toHaveBeenCalledWith({code:'already_sent',error:'already_sent'})
  vi.mocked(sendDispatch).mockRejectedValueOnce(new Error('secret'));expect((await call()).json).toHaveBeenCalledWith({code:'dispatch_unavailable'})
})
