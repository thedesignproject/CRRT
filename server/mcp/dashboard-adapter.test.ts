// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const fake = vi.hoisted(() => ({ results: [] as unknown[], calls: [] as unknown[] }))
vi.mock('../../api/_lib/supabase.js', () => {
  const query: Record<string, unknown> = {}
  for (const name of ['from', 'insert', 'select', 'eq', 'update']) query[name] = (...args: unknown[]) => { fake.calls.push([name, ...args]); return query }
  query.then = (resolve: (value: unknown) => void) => resolve(fake.results.shift())
  query.maybeSingle = () => Promise.resolve(fake.results.shift())
  return { getServiceSupabase: () => query }
})
vi.mock('../../api/_lib/record/core.js', () => ({ owned: vi.fn(async () => ({revision:1,project_key:null,state:'ready'})) }))
vi.mock('../../api/_lib/record/agent.js', () => ({ recordAccess: vi.fn(async () => undefined), agentArtifactAccess: vi.fn(async () => []) }))
vi.mock('../../api/_lib/record/storage.js', () => ({ artifacts: vi.fn(async () => []) }))
const promptReader=vi.hoisted(()=>vi.fn())
vi.mock('../../api/v1/feedback-shares/[shareId]/prompt.js',()=>({default:promptReader}))
import { encryptToken } from '../../api/_lib/tokens.js'
import { trustedUser } from '../../api/_lib/trusted-user.js'
import { runDashboardOperation } from './dashboard-adapter.js'
import type { DashboardOperation } from './dashboard-operations.js'
const actor = { user_id: 'user', email: 'user@test.local', connection_id: 'connection' }
const ok = (data: unknown = null) => ({ data, error: null })
const handler = vi.fn()
const operation: DashboardOperation = { name: 'test', description: 'Test', method: 'GET', query: ['projectId'], required: ['projectId'], body: '', load: async () => ({ default: handler }) }
const key = 'one-request-key-123'
beforeEach(() => {
  fake.results = []; fake.calls = []; handler.mockReset(); promptReader.mockReset()
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true'); vi.stubEnv('MCP_ORIGIN', 'http://127.0.0.1:3001'); vi.stubEnv('SHARE_TOKEN_SECRET', 'local-test-secret')
})
afterEach(() => vi.unstubAllEnvs())
const run = (op = operation, query = { projectId: 'project' }, body = {}, retryKey?: string) => runDashboardOperation(op, query, body, actor, retryKey)
it('injects only the authenticated actor and clears identity after completion', async () => {
  let request!: VercelRequest
  handler.mockImplementation((req: VercelRequest, res: VercelResponse) => {
    request = req
    res.setHeader('Cache-Control', 'no-store')
    expect(trustedUser(req)).toEqual({ userId: actor.user_id, email: actor.email, mcpConnectionId: actor.connection_id })
    expect(req.headers).toMatchObject({ authorization: 'Bearer internal-mcp', host: '127.0.0.1:3001', 'x-forwarded-proto': 'http' })
    return res.status(200).json({ id: 'resource' })
  })
  expect(await run()).toEqual({ ok: true, status: 200, data: { id: 'resource' } })
  expect(trustedUser(request)).toBeUndefined()
  expect(fake.calls).toEqual([])
})
it('does not allow extra query fields, absent required fields, anonymous audits or missing retry keys', async () => {
  await expect(run(operation, { projectId: 'project', userId: 'victim' } as never)).rejects.toThrow('unsupported_query')
  await expect(run(operation, {} as never)).rejects.toThrow('missing_query')
  const audit = { ...operation, name: 'audits.create', method: 'POST' as const }
  await expect(run(audit)).rejects.toThrow('project_required')
  await expect(run(audit, undefined, { projectKey: '' })).rejects.toThrow('project_required')
  await expect(run(audit, undefined, { projectKey: 'project' })).rejects.toThrow('idempotency_key_required')
  expect(handler).not.toHaveBeenCalled()
})
it.each([400, 401, 402, 403, 409, 429, 503])('preserves actionable handler failures (%s)', async status => {
  handler.mockImplementation((_req, res) => res.status(status).json({ error: 'Visible dashboard error' }))
  const result = await run()
  expect(result).toMatchObject({ ok: false, status, data: { error: 'Visible dashboard error' }, retryable: status === 429 || status >= 500 })
  expect(result.code).toBeTruthy()
})
it('captures send/end responses and refuses an unfinished handler', async () => {
  handler.mockImplementationOnce((_req, res) => res.status(200).send('export'))
  expect(await run()).toMatchObject({ data: 'export' })
  handler.mockImplementationOnce((_req, res) => res.status(204).end())
  expect(await run()).toMatchObject({ ok: true, status: 204, data: null })
  handler.mockResolvedValueOnce(undefined)
  await expect(run()).rejects.toThrow('dashboard_response_unavailable')
})
it('reserves mutations before execution, forwards retry keys, encrypts receipts and recovers identical retries', async () => {
  fake.results.push(ok(), ok())
  let request!: VercelRequest
  handler.mockImplementation((req, res) => { request = req; return res.status(201).json({ token: 'private-share-token' }) })
  const write = { ...operation, method: 'POST' as const }
  const result = await run(write, undefined, { nested: { z: 1, a: 2 } }, key)
  expect(result.status).toBe(201)
  expect(request.headers['idempotency-key']).toBe(key)
  const insert = fake.calls.find(call => (call as unknown[])[0] === 'insert') as [string, { request_hash: string }]
  const update = fake.calls.find(call => (call as unknown[])[0] === 'update') as [string, { response: unknown }]
  expect(JSON.stringify(update)).not.toContain('private-share-token')
  fake.results.push({ error: { code: '23505' } }, ok({ request_hash: insert[1].request_hash, response: update[1].response }))
  expect(await run(write, undefined, { nested: { a: 2, z: 1 } }, key)).toMatchObject({ ok: true, status: 201, data: null, code: 'operation_already_recorded' })
  expect(handler).toHaveBeenCalledTimes(1)
})
it('does not reexecute pending/crashed operations or allow a retry key with different content', async () => {
  const write = { ...operation, method: 'POST' as const }
  handler.mockRejectedValueOnce(new Error('crash'))
  fake.results.push(ok())
  await expect(run(write, undefined, { values: [null, true, 1] }, key)).rejects.toThrow('crash')
  const insert = fake.calls.find(call => (call as unknown[])[0] === 'insert') as [string, { request_hash: string }]
  fake.results.push({ error: { code: '23505' } }, ok({ request_hash: insert[1].request_hash, response: null }))
  expect(await run(write, undefined, { values: [null, true, 1] }, key)).toMatchObject({ code: 'operation_pending_or_uncertain', retryable: false })
  for (const prior of [null, { request_hash: 'different', response: null }]) {
    fake.results.push({ error: { code: '23505' } }, ok(prior))
    await expect(run(write, undefined, {}, key)).rejects.toThrow('idempotency_conflict')
  }
  expect(handler).toHaveBeenCalledTimes(1)
})
it('fails closed on storage errors and never retries a failed mutation automatically', async () => {
  const write = { ...operation, method: 'POST' as const }
  fake.results.push({ error: { code: 'unavailable' } })
  await expect(run(write, undefined, {}, key)).rejects.toThrow('storage_unavailable')
  handler.mockImplementation((_req, res) => res.status(503).json({ error: 'Unavailable' }))
  fake.results.push(ok(), ok())
  expect(await run(write, undefined, {}, key)).toMatchObject({ retryable: false })
  fake.results.push(ok(), { error: 'write receipt failed' })
  await expect(run(write, undefined, {}, key)).rejects.toThrow('storage_unavailable')
})
it('clears internal request identity if a handler throws', async () => {
  let request!: VercelRequest
  handler.mockImplementation(req => { request = req; throw new Error('failure') })
  await expect(run()).rejects.toThrow('failure')
  expect(trustedUser(request)).toBeUndefined()
})
it('validates an authenticated project audit before reserving it', async () => {
  fake.results.push(ok(), ok())
  handler.mockImplementation((_req, res) => res.status(202).json({ auditId: 'audit' }))
  expect(await run({ ...operation, method: 'POST', name: 'audits.create' }, undefined, { projectKey: 'project' }, key)).toMatchObject({ ok: true, status: 202 })
})

it('recovers a quota-counted Record read without invoking or charging it again', async () => {
  const payload={payload:{recording:{revision:1},project:null,transcript:Array.from({length:1000},()=>({text:'long context '.repeat(100)}))}}
  handler.mockImplementation((_req,res)=>res.status(200).json(payload))
  fake.results.push(ok(),ok())
  const read={...operation,name:'recordings.agent_payload',method:'POST' as const,readOnly:true}
  await run(read,undefined,{requestKey:'record-payload-key'},key)
  const insert=fake.calls.find(call=>(call as unknown[])[0]==='insert') as [string,{request_hash:string}]
  const update=fake.calls.find(call=>(call as unknown[])[0]==='update') as [string,{response:unknown}]
  fake.results.push({error:{code:'23505'}},ok({request_hash:insert[1].request_hash,response:update[1].response}))
  expect(await run(read,undefined,{requestKey:'record-payload-key'},key)).toMatchObject({ok:true,code:'operation_recovered',data:payload})
  expect(handler).toHaveBeenCalledTimes(1)
})

it('routes recovery through the allowlisted prompt reader with the authenticated actor', async () => {
  const create={...operation,name:'shares.create',method:'POST' as const}
  handler.mockImplementationOnce((_req,res)=>res.status(201).json({shareId:'share',token:'old'}))
  fake.results.push(ok(),ok())
  await run(create,undefined,{},key)
  const insert=fake.calls.find(call=>(call as unknown[])[0]==='insert') as [string,{request_hash:string}]
  const update=fake.calls.find(call=>(call as unknown[])[0]==='update') as [string,{response:unknown}]
  fake.results.push({error:{code:'23505'}},ok({request_hash:insert[1].request_hash,response:update[1].response}))
  promptReader.mockImplementationOnce((req,res)=>{
    expect(trustedUser(req)).toMatchObject({userId:actor.user_id,mcpConnectionId:actor.connection_id})
    expect(req.query).toEqual({shareId:'share',target:'generic'})
    return res.status(403).json({error:'Access removed'})
  })
  const recovered=await run(create,undefined,{},key)
  expect(recovered).toMatchObject({ok:false,status:403})
  fake.results.push({error:{code:'23505'}},ok({request_hash:insert[1].request_hash,response:update[1].response}))
  promptReader.mockImplementationOnce((_req,res)=>res.status(200).json({tokenUrl:'https://crrt.test/state?token=renewed'}))
  expect(await run(create,undefined,{},key)).toMatchObject({ok:true,data:{shareId:'share',token:'renewed'}})
  expect(handler).toHaveBeenCalledTimes(1)
})
