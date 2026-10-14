import { afterEach, expect, it, vi } from 'vitest'
import { CLOUD_PLANS, cloudPriceCatalog, isCloud, parseCloudPlan, planForPrice, subscriptionCanWrite } from './plans.js'
afterEach(()=>vi.unstubAllEnvs())
const prices={STRIPE_PRO_PRICE_ID:'price_pro',STRIPE_STUDIO_PRICE_ID:'price_studio'}
it('uses the approved limits and a deployment-owned mode',()=>{
  expect(CLOUD_PLANS.pro).toMatchObject({projects:10,internal_users:10,comments:2000,product_audits:5})
  expect(CLOUD_PLANS.studio).toMatchObject({projects:50,internal_users:25,comments:10000,product_audits:30})
  expect(isCloud({})).toBe(false); expect(isCloud({CRRT_DEPLOYMENT_MODE:'community'})).toBe(false)
  expect(isCloud({CRRT_DEPLOYMENT_MODE:'cloud'})).toBe(true)
  expect(()=>isCloud({CRRT_DEPLOYMENT_MODE:'typo'})).toThrow()
  vi.stubEnv('CRRT_DEPLOYMENT_MODE','cloud'); expect(isCloud()).toBe(true)
})
it('only maps configured, distinct Stripe prices',()=>{
  expect(cloudPriceCatalog(prices)).toEqual({pro:'price_pro',studio:'price_studio'})
  expect(planForPrice('price_pro',prices)).toBe('pro'); expect(planForPrice('price_studio',prices)).toBe('studio')
  expect(planForPrice(null,prices)).toBe(null); expect(planForPrice('other',prices)).toBe(null)
  for(const env of [{},{...prices,STRIPE_PRO_PRICE_ID:'wrong'},{...prices,STRIPE_STUDIO_PRICE_ID:'wrong'},{...prices,STRIPE_STUDIO_PRICE_ID:'price_pro'}]) expect(()=>cloudPriceCatalog(env)).toThrow()
  vi.stubEnv('STRIPE_PRO_PRICE_ID','price_pro');vi.stubEnv('STRIPE_STUDIO_PRICE_ID','price_studio')
  expect(cloudPriceCatalog()).toEqual({pro:'price_pro',studio:'price_studio'});expect(planForPrice('price_pro')).toBe('pro')
  expect(()=>cloudPriceCatalog({STRIPE_PRO_PRICE_ID:'price_pro'})).toThrow()
})
it('accepts plan identifiers rather than client prices',()=>{
  expect(parseCloudPlan('pro')).toBe('pro');expect(parseCloudPlan('studio')).toBe('studio')
  for(const value of [undefined,'free','price_pro',null,{}])expect(()=>parseCloudPlan(value)).toThrow()
})
it('requires a current trusted window and eligible subscription state',()=>{
  const account={plan:'pro',subscription_status:'active',period_start:'2026-01-01',period_end:'2026-02-01'}
  const now=Date.parse('2026-01-15')
  expect(subscriptionCanWrite(account,now)).toBe(true)
  expect(subscriptionCanWrite({...account,plan:'studio',subscription_status:'trialing'},now)).toBe(true)
  for(const value of [null,{...account,plan:null},{...account,plan:'free'},{...account,period_start:null},{...account,period_end:null},{...account,period_end:'invalid'},{...account,period_start:'2027-01-01'}])expect(subscriptionCanWrite(value,now)).toBe(false)
  for(const status of [null,'canceled','unpaid','past_due','paused'])expect(subscriptionCanWrite({...account,subscription_status:status},now)).toBe(false)
  expect(subscriptionCanWrite({...account,subscription_status:'past_due',grace_until:'2026-01-16'},now)).toBe(true)
  expect(subscriptionCanWrite({...account,subscription_status:'past_due',grace_until:'2026-01-14'},now)).toBe(false)
  expect(subscriptionCanWrite({...account,period_end:'2026-01-15'},now)).toBe(false)
  vi.spyOn(Date,'now').mockReturnValue(now);expect(subscriptionCanWrite(account)).toBe(true);vi.restoreAllMocks()
})
