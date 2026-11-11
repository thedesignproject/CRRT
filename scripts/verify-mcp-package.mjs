import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { randomBytes, createHash, randomUUID } from 'node:crypto'
const root = process.cwd(), require = createRequire(`${root}/package.json`)
const { createClient } = require('@supabase/supabase-js')
const { Client, StreamableHTTPClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')))
const entry = require(`${root}/.vercel/output/functions/api-router.func/api/__vercel-router.js`)
const handler = entry.default
const origin = 'http://127.0.0.1:3001', resource = `${origin}/api/mcp/v1`
process.env.MCP_ORIGIN = origin
if (!['127.0.0.1','localhost'].includes(new URL(process.env.SUPABASE_URL).hostname)) throw new Error('Local targets only')
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const service = createClient(process.env.SUPABASE_URL, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers)
    if (!/^[^.]+\.[^.]+\.[^.]+$/.test(secret) && headers.get('authorization') === `Bearer ${secret}`) headers.delete('authorization')
    return fetch(input, { ...init, headers })
  } },
})
const publicClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
async function invoke(url, init = {}) {
  const target = new URL(url), headers = Object.fromEntries(new Headers(init.headers))
  const req = { method: init.method || 'GET', url: target.pathname, query: { ...Object.fromEntries(target.searchParams), __audit_path: target.pathname }, headers, body: init.body ? JSON.parse(init.body) : undefined }
  let status = 200, payload = '', responseHeaders = new Headers()
  const res = { setHeader(k,v) { responseHeaders.set(k,String(v)); return res }, status(n) { status=n; return res }, send(value) { payload=value; return res }, json(value) { responseHeaders.set('content-type','application/json'); payload=JSON.stringify(value); return res }, end() { return res } }
  await handler(req,res)
  return new Response(payload || null,{status,headers:responseHeaders})
}
async function post(action, body, bearer) {
  const response = await invoke(`${origin}/api/mcp/oauth/${action}`, { method:'POST',headers:{'content-type':'application/json',...(bearer ? {authorization:`Bearer ${bearer}`} : {})},body:JSON.stringify(body) })
  const value=await response.json(); if (!response.ok) throw new Error(`OAuth ${action}: ${response.status} ${JSON.stringify(value)}`); return value
}
let user, clientId, client
try {
  const metadata = await invoke(`${origin}/api/mcp/oauth/metadata`)
  if (metadata.status !== 200) throw new Error('Packaged metadata failed')
  const challenge = await invoke(resource, {method:'POST',headers:{'content-type':'application/json'},body:'{}'})
  if (challenge.status !== 401 || !challenge.headers.get('www-authenticate')) throw new Error('Packaged auth challenge failed')
  const email=`packaged-mcp-${randomUUID()}@test.local`, password=`Local-${randomUUID()}!`
  const created=await service.auth.admin.createUser({email,password,email_confirm:true}); if(created.error)throw created.error; user=created.data.user.id
  const login=await publicClient.auth.signInWithPassword({email,password}); if(login.error)throw login.error
  const registered=await post('register',{client_name:'Packaged local verifier',redirect_uris:['http://127.0.0.1:8765/callback']}); clientId=registered.client_id
  const verifier=randomBytes(32).toString('base64url'), scope='crrt:read crrt:implement crrt:review crrt:dashboard'
  const consent=await post('consent',{client_id:clientId,redirect_uri:'http://127.0.0.1:8765/callback',response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:'packaged-state',scope,resource,decision:'approve'},login.data.session.access_token)
  const tokens=await post('token',{client_id:clientId,redirect_uri:'http://127.0.0.1:8765/callback',grant_type:'authorization_code',code:new URL(consent.redirectUrl).searchParams.get('code'),code_verifier:verifier,resource})
  client=new Client({name:'packaged-verifier',version:'1'})
  await client.connect(new StreamableHTTPClientTransport(new URL(resource),{fetch:invoke,requestInit:{headers:{authorization:`Bearer ${tokens.access_token}`}}}))
  const tools=await client.listTools(); if(tools.tools.length!==13)throw new Error(`Unexpected tool count ${tools.tools.length}`)
  const result=await client.callTool({name:'run_dashboard_operation',arguments:{operation:'notifications.read_all',userRequested:true,idempotencyKey:randomUUID()}})
  if(result.isError || result.structuredContent?.ok!==true)throw new Error(`Packaged write failed ${JSON.stringify(result)}`)
  // Exercise cached recovery in the packaged module graph, including domain
  // error class identity across its lazy-loaded Record helpers.
  const status=await client.callTool({name:'connection_status',arguments:{}})
  const connectionId=status.structuredContent.connectionId
  const retryKey=randomUUID(), recordId=randomUUID(), requestKey=randomUUID()
  const recoveryArgs={operation:'recordings.agent_payload',query:{id:recordId},body:{requestKey},idempotencyKey:retryKey}
  const requestHash=createHash('sha256').update(JSON.stringify([recoveryArgs.operation,recoveryArgs.query,recoveryArgs.body])).digest('hex')
  const {encryptToken}=require(`${root}/.vercel/output/functions/api-router.func/api/_lib/tokens.js`)
  const receipt={ok:true,status:200,data:{payload:{recording:{revision:1},project:null,transcript:['private cached fixture']}}}
  const saved=await service.from('mcp_dashboard_operations').insert({connection_id:connectionId,request_key:retryKey,request_hash:requestHash,response:{ciphertext:encryptToken(JSON.stringify(receipt))}})
  if(saved.error)throw saved.error
  const recordEnabled=process.env.CRRT_RECORD_ENABLED
  try {
    for(const [enabled,code,httpStatus] of [['false','record_disabled',503],['true','record_not_found',404]]){
      process.env.CRRT_RECORD_ENABLED=enabled
      const failed=await client.callTool({name:'run_dashboard_operation',arguments:recoveryArgs})
      const data=failed.structuredContent
      if(data?.ok!==false || data.code!==code || data.status!==httpStatus || data.retryable!==false || JSON.stringify(failed).includes('private cached fixture'))throw new Error('Packaged recovery did not preserve its feature/access failure')
    }
  } finally {
    if(recordEnabled===undefined)delete process.env.CRRT_RECORD_ENABLED
    else process.env.CRRT_RECORD_ENABLED=recordEnabled
  }
  console.log('Packaged Node function: metadata, authentication, OAuth, discovery, dashboard writes and protected recovery failures passed')
} finally {
  if(client)await client.close()
  if(clientId){
    const codes=await service.from('mcp_codes').select('hash').eq('client_id',clientId)
    const credentials=await service.from('mcp_credentials').select('hash,mcp_connections!inner(client_id)').eq('mcp_connections.client_id',clientId)
    if(codes.error || credentials.error)throw new Error('Fixture quota cleanup lookup failed')
    const keys=[...codes.data.map(row=>`exchange:${row.hash}`),...credentials.data.map(row=>`refresh:${row.hash}`)]
    if(keys.length){const {error}=await service.from('mcp_limits').delete().in('key',keys);if(error)throw error}
    const {error}=await service.from('mcp_clients').delete().eq('id',clientId);if(error)throw error
  }
  if(user){ await service.from('mcp_limits').delete().in('key',[`tool:${user}`,`consent:${user}`]); const {error}=await service.auth.admin.deleteUser(user);if(error)throw error }
}
