import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn(), requireProjectCapability: vi.fn() }))
vi.mock('../../../../_lib/trusted-user.js', () => ({ trustedUser: vi.fn() }))
vi.mock('../../../../_lib/mcp-github-flow.js', () => ({ readMcpGithubFlow: vi.fn() }))
import { requireUser, requireProjectCapability } from '../../../../_lib/auth.js'
import { trustedUser } from '../../../../_lib/trusted-user.js'
import { readMcpGithubFlow } from '../../../../_lib/mcp-github-flow.js'
import handler from './completion.js'
const response = () => ({ statusCode:200, body:null as unknown, setHeader:vi.fn(), status(n:number){ this.statusCode=n; return this }, json(value:unknown){this.body=value;return this}, end(){return this} })
const req = (query:Record<string,string>={projectId:'project',flowId:'flow'},method='GET') => ({query,method,headers:{}})
const call = (request=req(),res=response()) => handler(request as never,res as never)
beforeEach(() => {
  vi.mocked(requireUser).mockResolvedValue({userId:'user',email:'user@test.local'})
  vi.mocked(requireProjectCapability).mockResolvedValue({role:'admin'})
  vi.mocked(trustedUser).mockReturnValue({userId:'user',email:'user@test.local',mcpConnectionId:'connection'})
  vi.mocked(readMcpGithubFlow).mockResolvedValue({state:'pending',flowId:'flow',expiresAt:'later'})
})
it('returns actor-bound browser completion only through the trusted MCP connection',async()=>{
  const res=response();await call(req(),res)
  expect(res.statusCode).toBe(200);expect(res.body).toMatchObject({state:'pending'})
  expect(readMcpGithubFlow).toHaveBeenCalledWith({connectionId:'connection',requestKey:'flow'},'user','project')
  vi.mocked(trustedUser).mockReturnValueOnce(undefined)
  const denied=response();await call(req(),denied);expect(denied.statusCode).toBe(403)
})
it('handles methods, login, inputs, changed roles and expired flows',async()=>{
  for(const [method,status] of [['OPTIONS',204],['POST',405]] as const){const res=response();await call(req(undefined,method),res);expect(res.statusCode).toBe(status)}
  vi.mocked(requireUser).mockResolvedValueOnce(null);await call()
  for(const query of [{projectId:'project'},{flowId:'flow'}] as Array<Record<string,string>>){const res=response();await call(req(query),res);expect(res.statusCode).toBe(400)}
  vi.mocked(requireProjectCapability).mockResolvedValueOnce(null);await call()
  vi.mocked(readMcpGithubFlow).mockRejectedValueOnce(new Error('unavailable'))
  const res=response();await call(req(),res);expect(res.statusCode).toBe(409)
})
