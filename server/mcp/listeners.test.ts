// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { beforeEach,afterEach,expect,it,vi } from 'vitest'
vi.mock('../../api/_lib/agent-dispatch.js',async original=>({...await original<object>(),dispatchRpc:vi.fn(),listListeners:vi.fn()}))
vi.mock('../../api/_lib/tokens.js',()=>({generateAccessToken:()=> 'private-token',generateSlug:()=> 'slug',hashToken:()=> 'hash',encryptToken:()=> 'encrypted'}))
vi.mock('./context.js',()=>({contextTools:[{}, {run:vi.fn()}]}))
import { dispatchRpc,listListeners,DispatchError } from '../../api/_lib/agent-dispatch'
import { contextTools } from './context'
import { listenerTools,listenerInstructions } from './listeners'
import { tools } from './tools'
const actor={user_id:randomUUID(),connection_id:randomUUID(),email:'test@example.com',scope:'crrt:read crrt:implement'}
const id=randomUUID(), projectId='project'
const start={projectId,listenerId:id,label:'Codex',repositoryUrl:'https://github.com/a/b',userRequested:true}
const run=(index:number,input:Record<string,unknown>)=>listenerTools[index].run(input,actor)
beforeEach(()=>{vi.resetAllMocks();vi.mocked(dispatchRpc).mockResolvedValue({});vi.mocked(listListeners).mockResolvedValue([])})
afterEach(()=>vi.useRealTimers())
it('registers scoped tools with explicit start/stop consent',async()=>{
  for(const tool of listenerTools){expect(tools).toContain(tool);expect(tool.scope).toBe('crrt:implement');await expect(tool.run({}, {...actor,scope:'crrt:read'})).rejects.toMatchObject({code:'insufficient_scope'})}
  expect(listenerTools[0].input.safeParse({...start,userRequested:false}).success).toBe(false)
  expect(listenerTools[3].input.safeParse({listenerId:id}).success).toBe(false)
  expect(await run(0,start)).toEqual({instructions:listenerInstructions})
  expect(dispatchRpc).toHaveBeenCalledWith('agent_listener_register',expect.objectContaining({p_actor:actor.user_id,p_connection:actor.connection_id,p_senders:[actor.user_id]}))
  await run(0,{...start,senderIds:[actor.user_id]})
})
it('lists only the current connection for recovery and stops without deleting queued work',async()=>{
  expect(await run(1,{projectId})).toEqual({listeners:[]})
  expect(listListeners).toHaveBeenCalledWith(projectId,actor.user_id,actor.connection_id)
  expect(await run(3,{listenerId:id,userRequested:true})).toEqual({listenerId:id,stopped:true})
})
it('returns the prepared work and complete context without share credentials',async()=>{
  vi.mocked(dispatchRpc).mockResolvedValue({state:'received',workId:'work',feedbackId:'feedback',projectId})
  vi.mocked(contextTools[1].run).mockResolvedValue({implementationPrompt:'full prompt',untrustedData:true})
  const result=await run(2,{listenerId:id,waitSeconds:0})
  expect(result).toMatchObject({state:'received',workId:'work',promptVersion:'1',context:{implementationPrompt:'full prompt'}})
  expect(JSON.stringify(result)).not.toContain('private-token')
  expect(contextTools[1].run).toHaveBeenCalledWith({projectId,feedbackIds:['feedback']},actor)
})
it('waits within the requested bound and handles cancelled work',async()=>{
  vi.useFakeTimers();vi.mocked(dispatchRpc).mockResolvedValue({state:'waiting'})
  const pending=run(2,{listenerId:id,waitSeconds:3});await vi.advanceTimersByTimeAsync(3000)
  expect(await pending).toMatchObject({state:'waiting'});expect(dispatchRpc).toHaveBeenCalledTimes(3)
  vi.mocked(dispatchRpc).mockResolvedValue({state:'cancelled',reason:'feedback_changed'})
  expect(await run(2,{listenerId:id})).toMatchObject({state:'cancelled'})
})
it('converts domain errors and propagates unexpected/context failures',async()=>{
  vi.mocked(dispatchRpc).mockRejectedValueOnce(new DispatchError(409,'listener_stopped'))
  await expect(run(2,{listenerId:id})).rejects.toMatchObject({code:'listener_stopped',status:409})
  vi.mocked(dispatchRpc).mockRejectedValueOnce(new Error('unexpected'))
  await expect(run(0,start)).rejects.toThrow('unexpected')
})
