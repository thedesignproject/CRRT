// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { z } from 'zod'
const fake=vi.hoisted(()=>({owned:vi.fn(),recordAccess:vi.fn(),sign:vi.fn(),ownerAccess:vi.fn()}))
vi.mock('./auth.js',async original=>({...await original<object>(),identity:vi.fn(async()=>({user_id:'user',email:'user@test.local',connection_id:'connection'})),reserve:vi.fn(async()=>undefined)}))
vi.mock('../../api/_lib/record/core.js',()=>({owned:fake.owned}))
vi.mock('../../api/_lib/record/agent.js',()=>({recordAccess:fake.recordAccess,agentArtifactAccess:fake.sign}))
vi.mock('../../api/_lib/record/storage.js',()=>({artifacts:vi.fn(async()=>[])}))
vi.mock('../../api/_lib/storybook.js',()=>({ownerAccess:fake.ownerAccess}))
import { RecordError, StorybookError } from '../../api/_lib/domain-errors.js'
import { recoverDashboardReceipt } from './dashboard-recovery.js'
import { mcpHandler, type ToolSpec } from './transport.js'
import type { DashboardOperation } from './dashboard-operations.js'
const actor={user_id:'user',email:'user@test.local',connection_id:'connection'}
const cached={ok:true,status:200,data:{payload:{recording:{revision:1},project:null,transcript:['private cached context']}}}
beforeEach(()=>{
  vi.stubEnv('MCP_ORIGIN','http://127.0.0.1:3001');vi.stubEnv('CRRT_RECORD_ENABLED','true')
  fake.owned.mockReset().mockResolvedValue({revision:1,project_key:null,state:'ready'})
  fake.recordAccess.mockReset().mockResolvedValue(undefined);fake.sign.mockReset().mockResolvedValue([]);fake.ownerAccess.mockReset()
})
afterEach(()=>vi.unstubAllEnvs())
async function connect(name='recordings.agent_payload'){
  const spec:ToolSpec={name:'recover',description:'Recover an authorized cached result.',input:z.object({}).strict(),output:z.record(z.string(),z.unknown()),
    run:async()=>({...await recoverDashboardReceipt({name} as DashboardOperation,{id:'record'},{projectKey:'project'},actor,cached,vi.fn())})}
  const handler=mcpHandler([spec])
  const client=new Client({name:'recovery-verifier',version:'1'})
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3001/api/mcp/v1'),{fetch:async(url,init)=>handler(new Request(url,init))}))
  return client
}
it('returns the same disabled-feature failure through the MCP SDK after a successful cached read',async()=>{
  const client=await connect()
  try{
    expect((await client.callTool({name:'recover',arguments:{}})).structuredContent).toMatchObject({ok:true})
    const signs=fake.sign.mock.calls.length
    vi.stubEnv('CRRT_RECORD_ENABLED','false')
    const result=await client.callTool({name:'recover',arguments:{}})
    expect(result.structuredContent).toMatchObject({ok:false,status:503,code:'record_disabled',retryable:false,data:null})
    expect(fake.sign).toHaveBeenCalledTimes(signs)
    expect(JSON.stringify(result)).not.toContain('private cached context')
  }finally{await client.close()}
})
it.each([
  ['record_upgrade_required',402,false],['record_forbidden',403,false],['record_not_found',404,false],['record_unavailable',503,true],
] as const)('preserves Record %s status and retryability through the transport',async(code,status,retryable)=>{
  fake.owned.mockRejectedValueOnce(new RecordError(code,status,retryable))
  const client=await connect()
  try{
    const result=await client.callTool({name:'recover',arguments:{}})
    expect(result.structuredContent).toMatchObject({ok:false,code,status,retryable,data:null})
    expect(JSON.stringify(result)).not.toContain('tool_unavailable')
    expect(fake.sign).not.toHaveBeenCalled()
  }finally{await client.close()}
})
it.each([['upgrade_required',402],['access_denied',403]] as const)('preserves Storybook %s instead of reporting an outage',async(code,status)=>{
  fake.ownerAccess.mockRejectedValueOnce(new StorybookError(status,code,'private diagnostic'))
  const client=await connect('storybook.pair')
  try{
    const result=await client.callTool({name:'recover',arguments:{}})
    expect(result.structuredContent).toMatchObject({ok:false,code,status,retryable:false,data:null})
    expect(JSON.stringify(result)).not.toContain('private diagnostic')
  }finally{await client.close()}
})
it('keeps unexpected recovery exceptions private',async()=>{
  fake.owned.mockRejectedValueOnce(new Error('private database detail'))
  const client=await connect()
  try{
    const result=await client.callTool({name:'recover',arguments:{}})
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({code:'tool_unavailable'})
    expect(JSON.stringify(result)).not.toContain('private database detail')
  }finally{await client.close()}
})
