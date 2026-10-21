import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('./config.js',()=>({stripeClient:vi.fn()}))
vi.mock('./service.js',()=>({billingSummary:vi.fn()}))
vi.mock('./entitlements.js',()=>({ownerEntitlements:vi.fn()}))
import {stripeClient} from './config.js'
import {billingSummary} from './service.js'
import {ownerEntitlements} from './entitlements.js'
import {cloudBillingSummary} from './cloud-summary.js'
const retrieve=vi.fn()
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('STRIPE_PRO_PRICE_ID','price_pro');vi.stubEnv('STRIPE_STUDIO_PRICE_ID','price_studio');vi.stubEnv('STRIPE_MODE','test')
  vi.mocked(stripeClient).mockReturnValue({prices:{retrieve}} as never)
  vi.mocked(billingSummary).mockResolvedValue({enabled:true} as never)
  vi.mocked(ownerEntitlements).mockResolvedValue({canWrite:true,status:'none'} as never)
  retrieve.mockImplementation(async id=>({active:true,currency:'usd',unit_amount:id==='price_pro'?1900:4900,recurring:{interval:'month',interval_count:1}}))
})
afterEach(()=>vi.unstubAllEnvs())
it('returns validated plan pricing with server-owned usage after reconciliation',async()=>{
  expect(await cloudBillingSummary('owner')).toMatchObject({status:'none',testMode:true,plans:[{id:'pro',amount:'$19'},{id:'studio',amount:'$49'}],entitlements:{canWrite:true}})
  expect(billingSummary).toHaveBeenCalledWith('owner');expect(ownerEntitlements).toHaveBeenCalledWith('owner')
  vi.stubEnv('STRIPE_MODE','live');expect((await cloudBillingSummary('owner')).testMode).toBe(false)
})
it.each([{tax_behavior:'inclusive'},{active:false},{currency:'eur'},{unit_amount:999},{recurring:null},{recurring:{interval:'year',interval_count:1}},{recurring:{interval:'month',interval_count:2}}])('fails closed for a misconfigured price %j',async patch=>{
  retrieve.mockResolvedValue({active:true,currency:'usd',unit_amount:1900,recurring:{interval:'month',interval_count:1},...patch})
  await expect(cloudBillingSummary('owner')).rejects.toThrow('approved monthly catalog')
})

it('returns annual account pricing with monthly resource allowances and supported capabilities', async () => {
  vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID','price_pro_year'); vi.stubEnv('STRIPE_STUDIO_YEARLY_PRICE_ID','price_studio_year')
  vi.mocked(billingSummary).mockResolvedValue({enabled:true,billingCycle:'yearly'} as never)
  retrieve.mockImplementation(async id => ({ active: true, currency: 'usd', unit_amount: id === 'price_pro_year' ? 19200 : 49200, recurring: { interval: 'year', interval_count: 1 } }))
  expect(await cloudBillingSummary('owner')).toMatchObject({
    billingCycle: 'yearly', billingCycles: ['monthly','yearly'], actions: {checkoutState:true,changePlan:false},
    plans:[{id:'pro',amount:'$192',interval:'year',comments:2000},{id:'studio',amount:'$492',interval:'year',comments:10000}],
  })
  retrieve.mockResolvedValue({ active: true, currency: 'usd', unit_amount: 1900, recurring: { interval: 'month', interval_count: 1 } })
  await expect(cloudBillingSummary('owner')).rejects.toThrow('approved yearly catalog')
})
