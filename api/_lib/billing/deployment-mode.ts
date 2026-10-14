import {isCloud} from './plans.js'

/** Read-only preflight; enabling database enforcement is a separate operation. */
export function validateCloudDeployment(databaseEnabled:boolean,env:Record<string,string|undefined>=process.env){
  const cloud=isCloud(env)
  if(databaseEnabled && !cloud)throw new Error('An activated Cloud database requires CRRT_DEPLOYMENT_MODE=cloud')
  if(env.STRIPE_ENABLED==='true' && !cloud)throw new Error('STRIPE_ENABLED requires CRRT_DEPLOYMENT_MODE=cloud')
}
