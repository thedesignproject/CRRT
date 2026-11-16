// @vitest-environment node
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createProof, hashProof } from '../../api/_lib/extension-auth-contracts.js'
import { sendDispatch, widgetDispatchState } from '../../api/_lib/agent-dispatch.js'
import { mcpHandler } from './transport.js'
import { listenerTools } from './listeners.js'
import { actionTools } from './actions.js'
import { assertLocalMcpTargets } from './local-test-targets.js'
const local=process.env.MCP_TEST_LOCAL==='1'
const suite=local?describe:describe.skip
suite('widget SEND through an authenticated MCP client',()=>{
  if(local)assertLocalMcpTargets(process.env)
  const sql=postgres(process.env.DATABASE_URL||'postgres://localhost/unused')
  const user=randomUUID(),clientId=randomUUID(),connection=randomUUID(),listenerId=randomUUID(),project=`send-mcp-${randomUUID()}`
  const repo='https://github.com/example/widget-send',page='https://example.com/page',resource='http://127.0.0.1:3001/api/mcp/v1'
  const token=`crrt_mcp_${createProof()}`
  let client:Client
  const call=async(name:string,args:Record<string,unknown>)=>{
    const result=await client.callTool({name,arguments:args});expect(result.isError,JSON.stringify(result.content)).not.toBe(true)
    return result.structuredContent as Record<string,any>
  }
  beforeAll(async()=>{
    process.env.MCP_ORIGIN='http://127.0.0.1:3001'
    await sql`insert into auth.users(id,email) values(${user},${`${user}@send-mcp.test`})`
    await sql`insert into projects(public_key,slug,name) values(${project},${project},'SEND MCP')`
    await sql`insert into project_members(project_key,user_id,role,is_owner) values(${project},${user},'admin',true)`
    await sql`insert into project_repo_configs(project_key,repo_url) values(${project},${repo})`
    await sql`insert into mcp_clients(id,name,redirect_uris) values(${clientId},'Local SEND',ARRAY['http://localhost/callback'])`
    await sql`insert into mcp_connections(id,user_id,client_id,resource,scope) values(${connection},${user},${clientId},${resource},'crrt:read crrt:implement')`
    await sql`insert into mcp_credentials(hash,connection_id,kind,expires_at) values(${hashProof(token)},${connection},'access',now()+interval '10 minutes')`
    const handler=mcpHandler([...listenerTools,...actionTools])
    client=new Client({name:'send-local-integration',version:'1'})
    await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:`Bearer ${token}`}},fetch:async(url,init)=>handler(new Request(url,init))}))
  })
  afterAll(async()=>{
    await client?.close();await sql`delete from feedback_shares where project_id=${project}`
    await sql`delete from comments where project_id=${project}`;await sql`delete from projects where public_key=${project}`
    await sql`delete from mcp_clients where id=${clientId}`;await sql`delete from auth.users where id=${user}`;await sql.end()
  })
  it('delivers two consecutive human sends and reports ready for testing without another setup',async()=>{
    await call('start_feedback_listener',{projectId:project,listenerId,label:'Codex',repositoryUrl:repo,userRequested:true})
    for(let index=0;index<2;index++){
      const c=(await sql`insert into comments(project_id,url,comment,element) values(${project},${page},${`Improve heading ${index}`},'h1') returning id,updated_at::text`)[0]
      const input={projectKey:project,pageUrl:page,listenerId,commentId:c.id,expectedUpdatedAt:c.updated_at,idempotencyKey:randomUUID()}
      const sent=await sendDispatch(user,input);expect(sent.state).toBe('queued')
      const work=await call('wait_for_feedback',{listenerId,waitSeconds:0})
      expect(work).toMatchObject({state:'received',projectId:project,feedbackId:c.id,repoUrl:repo})
      expect(work.context.implementationPrompt).toBeTruthy()
      expect(work.context.pages[0].feedback[0].body).toContain(`heading ${index}`)
      expect((await call('wait_for_feedback',{listenerId,waitSeconds:0})).workId).toBe(work.workId)
      for(const action of ['claim','start','complete'])await call('update_feedback_progress',{workId:work.workId,feedbackId:c.id,agentId:'integration-executor',promptVersion:'1',action,summary:'Verified the heading change.',idempotencyKey:randomUUID()})
      const state=await widgetDispatchState(project,page,user)
      expect(state.dispatches.find(d=>d.dispatchId===sent.dispatchId)?.state).toBe('completed')
      expect((await call('wait_for_feedback',{listenerId,waitSeconds:0})).state).toBe('waiting')
    }
    expect((await call('list_feedback_listeners',{projectId:project})).listeners).toHaveLength(1)
    await call('stop_feedback_listener',{listenerId,userRequested:true})
    expect((await widgetDispatchState(project,page,user)).listeners[0].online).toBe(false)
  })
})
