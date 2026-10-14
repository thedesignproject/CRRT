import {expect,it,vi,afterEach} from 'vitest'
import {validateCloudDeployment} from './deployment-mode.js'
afterEach(()=>vi.unstubAllEnvs())
it('allows inactive first deployments without activating enforcement',()=>{
  expect(()=>validateCloudDeployment(false,{})).not.toThrow()
  expect(()=>validateCloudDeployment(false,{CRRT_DEPLOYMENT_MODE:'community'})).not.toThrow()
  expect(()=>validateCloudDeployment(false,{CRRT_DEPLOYMENT_MODE:'cloud',STRIPE_ENABLED:'true'})).not.toThrow()
})
it.each([{}, {CRRT_DEPLOYMENT_MODE:'community'}])('rejects incompatible deployments of an activated database',env=>{
  expect(()=>validateCloudDeployment(true,env)).toThrow('activated Cloud database')
})
it('allows explicitly configured Cloud and rejects ambiguous or invalid modes',()=>{
  expect(()=>validateCloudDeployment(true,{CRRT_DEPLOYMENT_MODE:'cloud'})).not.toThrow()
  expect(()=>validateCloudDeployment(false,{STRIPE_ENABLED:'true'})).toThrow('STRIPE_ENABLED')
  expect(()=>validateCloudDeployment(false,{CRRT_DEPLOYMENT_MODE:'invalid'})).toThrow('must be cloud or community')
  vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud');validateCloudDeployment(true)
})
