import {act,cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react'
import {afterEach,beforeEach,expect,it,vi}from'vitest'
import {BillingSettings}from'./BillingSettings'
const fetchMock=vi.fn()
const summary={enabled:true,testMode:true,canManage:false,entitlements:{mode:'cloud',plan:null,status:'none',canWrite:false,trialUsed:false,resetAt:'2026-11-01',usage:{projects:2,internal_users:4,comments:123,product_audits:1},limits:{projects:10,internal_users:10,comments:2000,product_audits:5}},plans:[{id:'pro',name:'Cloud Pro',amount:'$19',interval:'month',projects:10,internal_users:10,comments:2000,product_audits:5},{id:'studio',name:'Cloud Studio',amount:'$49',interval:'month',projects:50,internal_users:25,comments:10000,product_audits:30}]}
const props={apiBase:'/api',accessToken:'owner'}
function response(value:unknown,ok=true){return{ok,json:async()=>value}}
beforeEach(()=>{vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset().mockResolvedValue(response(summary));vi.spyOn(window.location,'assign').mockImplementation(()=>{})})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('compares only the approved Cloud plans and explains usage, trial and retained data',async()=>{
 render(<BillingSettings {...props}/>);expect(screen.getByRole('status')).toHaveTextContent('Loading')
 await screen.findByRole('heading',{name:'Cloud Pro'})
 expect(screen.getByRole('heading',{name:'Cloud Studio'})).toBeInTheDocument();expect(screen.getByText('$19')).toBeInTheDocument();expect(screen.getByText('$49')).toBeInTheDocument()
 expect(screen.getByText(/14-day trial/)).toBeInTheDocument();expect(screen.getByText(/remains readable and exportable/)).toBeInTheDocument()
 expect(screen.getByRole('table')).toHaveTextContent('123');expect(screen.queryByText('Free')).toBeNull()
 fetchMock.mockResolvedValueOnce(response({url:'https://checkout.stripe.com/selected'}));fireEvent.click(screen.getByRole('button',{name:'Start Cloud Studio trial'}))
 await waitFor(()=>expect(window.location.assign).toHaveBeenCalledWith('https://checkout.stripe.com/selected'))
 expect(JSON.parse(fetchMock.mock.lastCall![1].body)).toEqual({action:'checkout',plan:'studio'})
})
it('manages an existing plan and uses portal changes instead of duplicate subscriptions',async()=>{
 fetchMock.mockResolvedValue(response({...summary,testMode:false,canManage:true,entitlements:{...summary.entitlements,plan:'pro',status:'active',canWrite:true,trialUsed:true,resetAt:null}}))
 render(<BillingSettings {...props}/>);await screen.findByText('Current plan');expect(screen.getByRole('button',{name:'Current plan'})).toBeDisabled()
 expect(screen.queryByText(/Sandbox/)).toBeNull();expect(screen.getByText(/Monthly billing/)).toBeInTheDocument()
 fetchMock.mockResolvedValue(response({url:'https://billing.stripe.com/portal'}));fireEvent.click(screen.getByRole('button',{name:'Change plan'}))
 await waitFor(()=>expect(window.location.assign).toHaveBeenCalled())
 expect(JSON.parse(fetchMock.mock.lastCall![1].body)).toEqual({action:'portal'})
 fireEvent.click(screen.getByRole('button',{name:'Manage billing'}));await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(3))
})
it('offers paid resubscription after a used trial and handles missing limits',async()=>{
 fetchMock.mockResolvedValue(response({...summary,canManage:true,entitlements:{...summary.entitlements,status:'canceled',trialUsed:true,limits:{projects:null,internal_users:null,comments:null,product_audits:null}}}))
 render(<BillingSettings {...props}/>);await screen.findByRole('button',{name:'Subscribe to Cloud Pro'})
 expect(screen.getAllByText('Choose a plan')).toHaveLength(4)
})
it('hides disabled billing and supports retry after failed reads',async()=>{
 fetchMock.mockResolvedValueOnce(response({},false));render(<BillingSettings {...props}/>);await screen.findByRole('alert')
 fetchMock.mockResolvedValueOnce(response({enabled:false}));fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByText('Billing is not enabled in this environment.')
})
it.each(['http','scheme','host','network'])('rejects failed or unsafe %s checkout responses',async kind=>{
 render(<BillingSettings {...props}/>);await screen.findByRole('heading',{name:'Cloud Pro'})
 if(kind==='network')fetchMock.mockRejectedValueOnce(new Error('offline'))
 else fetchMock.mockResolvedValueOnce(response({url:kind==='scheme'?'http://checkout.stripe.com/path':'https://evil.example/'},kind!=='http'))
 fireEvent.click(screen.getByRole('button',{name:'Start Cloud Pro trial'}));await screen.findByRole('alert');expect(window.location.assign).not.toHaveBeenCalled()
 fetchMock.mockResolvedValueOnce(response(summary));fireEvent.click(screen.getByRole('button',{name:'Refresh billing status'}));await screen.findByRole('heading',{name:'Cloud Pro'})
})
it('ignores stale summary and checkout responses after account changes or unmount',async()=>{
 let resolve!:(value:unknown)=>void
 fetchMock.mockReturnValueOnce(new Promise(done=>{resolve=done}));const view=render(<BillingSettings {...props}/>);view.unmount()
 await act(async()=>resolve(response(summary)));expect(screen.queryByText('Cloud Pro')).toBeNull()
 fetchMock.mockResolvedValue(response(summary));const next=render(<BillingSettings {...props}/>);await screen.findByRole('heading',{name:'Cloud Pro'})
 fetchMock.mockReturnValueOnce(new Promise(done=>{resolve=done}));fireEvent.click(screen.getByRole('button',{name:'Start Cloud Pro trial'}));next.rerender(<BillingSettings {...props} accessToken="new-owner"/>);await screen.findByRole('heading',{name:'Cloud Pro'})
 await act(async()=>resolve(response({url:'https://checkout.stripe.com/stale'})));expect(window.location.assign).not.toHaveBeenCalled()
 let reject!:(reason:unknown)=>void
 fetchMock.mockReturnValueOnce(new Promise((_,fail)=>{reject=fail}));fireEvent.click(screen.getByRole('button',{name:'Start Cloud Pro trial'}));next.unmount();await act(async()=>reject(new Error('late')))
 fetchMock.mockReturnValueOnce(new Promise((_,fail)=>{reject=fail}));const last=render(<BillingSettings {...props}/>);last.unmount();await act(async()=>reject(new Error('late summary')))
})

it('shows scheduled cancellation while Cloud remains writable and removes it after cancellation',async()=>{
 fetchMock.mockResolvedValue(response({...summary,cancelAtPeriodEnd:true,periodEnd:'2026-10-28',entitlements:{...summary.entitlements,status:'trialing',canWrite:true}}))
 const view=render(<BillingSettings {...props}/>);await screen.findByText(/Your subscription cancels on/)
 expect(screen.getByText(/You can keep using Cloud until then/)).toHaveTextContent(new Date('2026-10-28').toLocaleDateString())
 fetchMock.mockResolvedValue(response({...summary,cancelAtPeriodEnd:true,periodEnd:'2026-10-28'}))
 view.rerender(<BillingSettings {...props} accessToken="other"/>);await screen.findByRole('heading',{name:'Cloud Pro'})
 expect(screen.queryByText(/Your subscription cancels on/)).toBeNull()
 fetchMock.mockResolvedValue(response({...summary,cancelAtPeriodEnd:true,periodEnd:null}));fireEvent.click(screen.getByRole('button',{name:'Refresh billing status'}));await screen.findByRole('heading',{name:'Cloud Pro'})
 expect(screen.queryByText(/Your subscription cancels on/)).toBeNull()
})
