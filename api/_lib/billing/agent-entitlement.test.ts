import { afterEach,beforeEach,expect,it,vi } from 'vitest'
vi.mock('../supabase.js',()=>({getServiceSupabase:vi.fn()}))
vi.mock('./store.js',()=>({getAccount:vi.fn()}))
import {getServiceSupabase} from '../supabase.js'
import {getAccount} from './store.js'
import {agentPlanCatalog,eligibleAgentPriceIds,hasAgentEntitlement,resolveWidgetAgentAccess} from './agent-entitlement.js'
const cloud={CRRT_DEPLOYMENT_MODE:'cloud',STRIPE_PRO_PRICE_ID:'price_pro',STRIPE_STUDIO_PRICE_ID:'price_studio'}
const account={plan:'pro',price_id:'price_pro',subscription_status:'active',period_start:'2020-01-01',period_end:'2099-01-01'}
let results:Array<{data:unknown,error:unknown}>
beforeEach(()=>{
 vi.resetAllMocks(); for(const[key,value]of Object.entries(cloud))vi.stubEnv(key,value)
 results=[]
 const from=vi.fn(()=>{const q:any={};for(const m of ['select','eq'])q[m]=vi.fn(()=>q);q.maybeSingle=vi.fn(async()=>results.shift());return q})
 vi.mocked(getServiceSupabase).mockReturnValue({from} as never)
 vi.mocked(getAccount).mockResolvedValue(account as never)
})
afterEach(()=>vi.unstubAllEnvs())
function actor(owner=false){results=[{data:{user_id:'actor',role:owner?'admin':'member',is_owner:owner},error:null},{data:{user_id:'owner'},error:null}]}
it('maps both Cloud plans and bypasses billing in Community',()=>{
 expect([...agentPlanCatalog(cloud)]).toEqual([['price_pro',{agent:true,collaboratorSeats:9}],['price_studio',{agent:true,collaboratorSeats:24}]])
 expect(eligibleAgentPriceIds()).toEqual(['price_pro','price_studio'])
 expect(eligibleAgentPriceIds({})).toEqual(['community'])
 expect(hasAgentEntitlement(null,{})).toBe(true)
 expect(hasAgentEntitlement(account,cloud)).toBe(true)
 expect(hasAgentEntitlement(null,cloud)).toBe(false)
 expect(hasAgentEntitlement({...account,price_id:'unknown'},cloud)).toBe(false)
 expect(hasAgentEntitlement({...account,subscription_status:'canceled'},cloud)).toBe(false)
})
it('requires membership and existing guest permissions even in Community',async()=>{
 results=[{data:null,error:null}];expect(await resolveWidgetAgentAccess('p','actor')).toEqual({state:'project_access_denied'})
 results=[{data:{role:'guest'},error:null}];expect(await resolveWidgetAgentAccess('p','actor')).toEqual({state:'forbidden',role:'guest'})
 results=[{data:null,error:{}}];await expect(resolveWidgetAgentAccess('p','actor')).rejects.toThrow('membership lookup')
 actor();results[1]={data:null,error:{}};await expect(resolveWidgetAgentAccess('p','actor')).rejects.toThrow('owner lookup')
 actor();results[1]={data:null,error:null};expect(await resolveWidgetAgentAccess('p','actor')).toMatchObject({state:'project_access_denied'})
})
it('distinguishes owner recovery from member recovery without selling member subscriptions',async()=>{
 vi.mocked(getAccount).mockResolvedValue(null)
 actor(true);expect(await resolveWidgetAgentAccess('p','actor')).toMatchObject({state:'upgrade_required'})
 actor();expect(await resolveWidgetAgentAccess('p','actor')).toMatchObject({state:'owner_upgrade_required',ownerUserId:'owner'})
})
it('preserves eligible member access regardless of over-capacity downgrades',async()=>{
 actor();expect(await resolveWidgetAgentAccess('p','actor')).toMatchObject({state:'ready',collaboratorSeatLimit:9})
 vi.mocked(getAccount).mockResolvedValue({...account,plan:'studio',price_id:'price_studio'} as never)
 actor(true);expect(await resolveWidgetAgentAccess('p','actor')).toMatchObject({state:'ready',collaboratorSeatLimit:24})
})
it('does not read billing at all for self-hosted Agent access',async()=>{
 vi.stubEnv('CRRT_DEPLOYMENT_MODE','community')
 vi.mocked(getAccount).mockRejectedValue(new Error('Stripe unavailable'))
 actor();expect(await resolveWidgetAgentAccess('p','actor')).toEqual({state:'ready',role:'member',ownerUserId:'owner'})
 expect(getAccount).not.toHaveBeenCalled()
})
it('keeps legacy owners and collaborators eligible after Studio ends',async()=>{
 const legacy={...account,is_legacy:true,plan:null,price_id:null,subscription_status:null,period_start:null,period_end:null}
 expect(hasAgentEntitlement(legacy,cloud)).toBe(true)
 vi.mocked(getAccount).mockResolvedValue(legacy as never)
 actor();expect(await resolveWidgetAgentAccess('p','actor')).toMatchObject({state:'ready',collaboratorSeatLimit:9})
 vi.mocked(getAccount).mockResolvedValue({...account,is_legacy:true,plan:'studio',price_id:'price_studio'} as never)
 actor();expect(await resolveWidgetAgentAccess('p','actor')).toMatchObject({state:'ready',collaboratorSeatLimit:24})
 vi.mocked(getAccount).mockResolvedValue({...account,is_legacy:true,plan:'studio',subscription_status:'canceled'} as never)
 actor(true);expect(await resolveWidgetAgentAccess('p','actor')).toMatchObject({state:'ready',collaboratorSeatLimit:9})
})
