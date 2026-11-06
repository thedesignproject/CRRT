// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ queue: [] as unknown[], calls: [] as unknown[] }))
vi.mock('../../api/_lib/supabase.js', () => {
  const q: Record<string, unknown> = {}
  for (const name of ['from','select','eq','gt','lt','not','is','delete','insert','update']) q[name] = (...args: unknown[]) => { fake.calls.push([name,...args]); return q }
  q.then = (resolve: (v: unknown) => void) => resolve(fake.queue.shift())
  q.maybeSingle = () => Promise.resolve(fake.queue.shift())
  return { getServiceSupabase: () => q, getNonPersistentSupabase: vi.fn() }
})
vi.mock('./auth.js', async original => ({ ...await original<object>(), dashboardUser: vi.fn(), reserve: vi.fn() }))
vi.mock('../../api/_lib/documents.js', async original => ({ ...await original<object>(), executeDocument: vi.fn() }))
import { dashboardUser, reserve, McpError } from './auth.js'
import { executeDocument, DocumentError } from '../../api/_lib/documents.js'
import { documentUnlockTool, documentUnlockHttp, documentDashboardUrl } from './document-unlock.js'
const actor = { user_id: randomUUID(), connection_id: randomUUID(), email: 'reader@test.local', scope: 'crrt:read crrt:implement crrt:review crrt:dashboard' }
const shareKey = randomUUID(), requestId = randomUUID(), secret = 'a'.repeat(43)
const ok = (data: unknown) => ({ data, error: null })
const row = { id: requestId, connection_id: actor.connection_id, share_key: shareKey, access_token: null, expires_at: '2030-01-01T00:00:00Z' }
const connection = { id: actor.connection_id, scope: actor.scope, mcp_clients: { name: 'My agent' } }
const browser = (body: object, method = 'POST') => documentUnlockHttp(new Request('http://127.0.0.1:3001/api/mcp/document-unlock', { method, ...(method==='POST'?{body:JSON.stringify(body)}:{}) }))
beforeEach(() => {
  fake.queue.length=0; fake.calls.length=0; vi.mocked(executeDocument).mockReset(); vi.mocked(reserve).mockReset()
  vi.mocked(dashboardUser).mockReset().mockResolvedValue({id:actor.user_id,email:actor.email} as never)
  vi.stubEnv('MCP_ORIGIN','http://127.0.0.1:3001'); vi.stubEnv('APP_URL','http://127.0.0.1:5173'); vi.stubEnv('MCP_DASHBOARD_URL','http://127.0.0.1:5173/dashboard/mcp-auth'); vi.stubEnv('MCP_DOCUMENT_UNLOCK_METHOD',undefined)
})
afterEach(() => vi.unstubAllEnvs())
it('uses an explicitly supplied password directly without creating a browser request',async()=>{
  vi.mocked(executeDocument).mockResolvedValue({accessToken:'grant'})
  expect(await documentUnlockTool.run({shareKey,password:'supplied password'},actor)).toEqual({status:'approved',accessToken:'grant'})
  expect(executeDocument).toHaveBeenCalledWith({action:'unlock',shareKey,password:'supplied password'},{userId:actor.user_id,email:actor.email,mcpConnectionId:actor.connection_id});expect(fake.calls).toHaveLength(0)
  vi.mocked(executeDocument).mockRejectedValueOnce(new DocumentError(401,'incorrect_password'));await expect(documentUnlockTool.run({shareKey,password:'wrong'},actor)).rejects.toMatchObject({code:'incorrect_password'})
  vi.mocked(executeDocument).mockRejectedValueOnce(new Error('unexpected'));await expect(documentUnlockTool.run({shareKey,password:'wrong'},actor)).rejects.toThrow('unexpected')
})
it('creates separate browser and polling proofs and puts only the browser proof in the URL fragment',async()=>{
  fake.queue.push(ok({id:shareKey}),ok(null),ok(null))
  const output=await documentUnlockTool.run({shareKey},actor),url=new URL(output.browserUrl as string)
  expect(url.pathname).toBe('/dashboard/document-unlock');expect(url.search).toBe('');expect(output).toMatchObject({status:'pending',method:'browser',nextAction:expect.any(String)})
  const inserted=(fake.calls.find((c:any)=>c[0]==='insert') as any)[1],browserProof=new URLSearchParams(url.hash.slice(1)).get('proof')!
  expect(browserProof).toHaveLength(43);expect(inserted.browser_proof_hash).not.toBe(browserProof);expect(inserted.poll_proof_hash).not.toBe(output.pollToken);expect(browserProof).not.toBe(output.pollToken);expect(inserted.connection_id).toBe(actor.connection_id);expect(Date.parse(output.expiresAt as string)).toBeGreaterThan(Date.now())
})
it('supports changing the default method while keeping explicit password and URL configuration independent',async()=>{
  vi.stubEnv('MCP_DOCUMENT_UNLOCK_METHOD','chat');expect(await documentUnlockTool.run({shareKey},actor)).toEqual({status:'password_required',method:'chat'});expect(fake.calls).toHaveLength(0)
  vi.stubEnv('MCP_DASHBOARD_URL',undefined);expect(documentDashboardUrl('./document-unlock').href).toBe('http://127.0.0.1:5173/dashboard/document-unlock');vi.stubEnv('APP_URL',undefined);expect(documentDashboardUrl('./document-unlock').href).toBe('http://127.0.0.1:3001/dashboard/document-unlock')
})
it('requires explicit read consent and live password sharing before creating an approval',async()=>{
  await expect(documentUnlockTool.run({shareKey},{...actor,scope:'crrt:read'})).rejects.toMatchObject({code:'insufficient_scope'})
  await expect(documentUnlockTool.run({shareKey,extra:true},actor)).rejects.toThrow()
  fake.queue.push(ok(null));await expect(documentUnlockTool.run({shareKey},actor)).rejects.toMatchObject({code:'document_not_found'})
  vi.mocked(reserve).mockRejectedValueOnce(new McpError(429,'rate_limited'));await expect(documentUnlockTool.run({shareKey},actor)).rejects.toMatchObject({code:'rate_limited'})
  fake.queue.push({data:null,error:{message:'storage'}});await expect(documentUnlockTool.run({shareKey},actor)).rejects.toMatchObject({code:'storage_unavailable'})
})
it('polls only the matching connection and refuses expired, guessed or storage-failed requests',async()=>{
  const input={requestId,pollToken:secret};fake.queue.push(ok(row));expect(await documentUnlockTool.run(input,actor)).toEqual({status:'pending',retryAfterSeconds:3})
  fake.queue.push(ok({...row,access_token:'grant'}));expect(await documentUnlockTool.run(input,actor)).toEqual({status:'approved',accessToken:'grant'})
  fake.queue.push(ok({...row,connection_id:randomUUID()}));await expect(documentUnlockTool.run(input,actor)).rejects.toMatchObject({code:'forbidden'})
  fake.queue.push(ok(null));await expect(documentUnlockTool.run(input,actor)).rejects.toMatchObject({code:'unlock_request_expired'})
})
it.each([false,true])('inspects the connected client without exposing its grant, approved=%s',async approved=>{
  fake.queue.push(ok({...row,access_token:approved?'grant':null}),ok(connection));const result=await(await browser({requestId,proof:secret,action:'inspect'})).json()
  expect(result).toMatchObject({clientName:'My agent',shareKey,status:approved?'approved':'pending'});expect(JSON.stringify(result)).not.toContain('grant');expect(fake.calls).toContainEqual(['eq','user_id',actor.user_id])
})
it('approves the browser password for that connection without returning it or the grant to the page',async()=>{
  fake.queue.push(ok(row),ok(connection),ok({id:requestId}));vi.mocked(executeDocument).mockResolvedValue({accessToken:'grant'})
  expect(await(await browser({requestId,proof:secret,action:'approve',password:'browser only password'})).json()).toEqual({status:'approved'});expect(executeDocument).toHaveBeenCalledWith({action:'unlock',shareKey,password:'browser only password'},{userId:actor.user_id,email:actor.email,mcpConnectionId:actor.connection_id})
  fake.queue.push(ok({...row,access_token:'grant'}),ok(connection));await browser({requestId,proof:secret,action:'approve',password:'ignored repeat'});expect(executeDocument).toHaveBeenCalledTimes(1)
})
it('rejects the wrong browser account, revoked connections, missing consent and expired approvals',async()=>{
  for(const current of [null,{...connection,scope:'crrt:read'}]){fake.queue.push(ok(row),ok(current));await expect(browser({requestId,proof:secret,action:'inspect'})).rejects.toMatchObject({code:'connection_unavailable'})}
  fake.queue.push(ok(null));await expect(browser({requestId,proof:secret,action:'inspect'})).rejects.toMatchObject({code:'unlock_request_expired'})
  await expect(browser({},'GET')).rejects.toMatchObject({code:'method_not_allowed'});vi.mocked(dashboardUser).mockRejectedValueOnce(new McpError(401,'login_required'));await expect(browser({requestId,proof:secret,action:'inspect'})).rejects.toMatchObject({code:'login_required'})
})
it('keeps incorrect passwords and races recoverable without persisting failed grants',async()=>{
  const input={requestId,proof:secret,action:'approve',password:'wrong'}
  fake.queue.push(ok(row),ok(connection));vi.mocked(executeDocument).mockRejectedValueOnce(new DocumentError(401,'incorrect_password'));await expect(browser(input)).rejects.toMatchObject({code:'incorrect_password'})
  fake.queue.push(ok(row),ok(connection));vi.mocked(executeDocument).mockRejectedValueOnce(new Error('unexpected'));await expect(browser(input)).rejects.toThrow('unexpected')
  fake.queue.push(ok(row),ok(connection),ok(null));vi.mocked(executeDocument).mockResolvedValueOnce({accessToken:'grant'});await expect(browser(input)).rejects.toMatchObject({code:'unlock_request_changed'})
})
