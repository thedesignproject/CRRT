import {cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react'
import {afterEach,beforeEach,expect,it,vi}from'vitest'
vi.mock('./local-feedback',()=>({readLocalWorkspace:vi.fn(),deleteLocalComment:vi.fn(),resolveLocalComment:vi.fn(),exportLocalFeedback:vi.fn()}))
vi.mock('./comments-api',()=>({importLocalProject:vi.fn()}))
import {readLocalWorkspace,deleteLocalComment,resolveLocalComment,exportLocalFeedback}from'./local-feedback'
import {importLocalProject}from'./comments-api'
import {LocalWorkspacePanel}from'./local-workspace-panel'
const comment={id:'local-id',body:'Feedback',reviewStatus:'open'}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(readLocalWorkspace).mockResolvedValue({version:1,name:'Local feedback',comments:[comment]}as never);vi.mocked(exportLocalFeedback).mockResolvedValue('{}');vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('offers local resolve, reopen, delete and a complete portable export',async()=>{
 const view=render(<LocalWorkspacePanel sessionToken={null} billingUrl="https://example.com/dashboard/billing" />)
 fireEvent.click(await screen.findByRole('button',{name:'Resolve'}));await waitFor(()=>expect(resolveLocalComment).toHaveBeenCalledWith('local-id',true))
 vi.mocked(readLocalWorkspace).mockResolvedValue({version:1,name:'Local',comments:[{...comment,reviewStatus:'accepted'}]}as never)
 fireEvent.click(screen.getByRole('button',{name:'Delete local feedback'}));await waitFor(()=>expect(deleteLocalComment).toHaveBeenCalledWith('local-id'))
 fireEvent.click(await screen.findByRole('button',{name:'Reopen'}));await waitFor(()=>expect(resolveLocalComment).toHaveBeenCalledWith('local-id',false))
 fireEvent.click(screen.getByRole('button',{name:'Export local feedback'}));await waitFor(()=>expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test'))
 expect(screen.queryByRole('button',{name:'Import local project'})).toBeNull();view.unmount()
})
it('imports screenshot-sized batches, retains the local copy and permits empty project imports',async()=>{
 render(<LocalWorkspacePanel sessionToken="token-A" billingUrl="https://example.com/dashboard/billing" />)
 fireEvent.click(screen.getByRole('button',{name:'Import to Cloud'}));fireEvent.change(screen.getByRole('textbox',{name:'Cloud project key'}),{target:{value:'chosen'}})
 fireEvent.click(screen.getByRole('button',{name:'Import local project'}))
 await screen.findByText(/local copy is retained/);expect(importLocalProject).toHaveBeenCalledWith('chosen','Local feedback',[comment],'token-A',expect.any(AbortSignal))
 vi.mocked(readLocalWorkspace).mockResolvedValue({version:1,name:'Local',comments:[]})
 fireEvent.click(screen.getByRole('button',{name:'Import local project'}));await waitFor(()=>expect(importLocalProject).toHaveBeenCalledWith('chosen','Local',[],'token-A',expect.any(AbortSignal)))
})
it('explains load and operation failures without discarding local data',async()=>{
 vi.mocked(readLocalWorkspace).mockRejectedValueOnce(new Error('Storage unavailable'))
 const view=render(<LocalWorkspacePanel sessionToken="token-A" billingUrl="https://example.com/dashboard/billing" />)
 await screen.findByText(/Storage unavailable/)
 fireEvent.click(screen.getByRole('button',{name:'Import to Cloud'}))
 fireEvent.click(screen.getByRole('button',{name:/Local feedback \(/}))
 vi.mocked(importLocalProject).mockRejectedValue(new Error('Allowance reached'))
 fireEvent.click(screen.getByRole('button',{name:'Import local project'}));await screen.findByText('Allowance reached')
 vi.mocked(exportLocalFeedback).mockRejectedValue('unknown')
 fireEvent.click(screen.getByRole('button',{name:'Export local feedback'}));await screen.findByText('Local feedback is unavailable')
 view.unmount()
})

it('stops before the first upload if the visible account changes during the storage read',async()=>{
 let finish!:(value:unknown)=>void
 const view=render(<LocalWorkspacePanel sessionToken="token-A" billingUrl="https://example.com/billing" />)
 fireEvent.click(screen.getByRole('button',{name:'Import to Cloud'}))
 vi.mocked(readLocalWorkspace).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve as never}))
 fireEvent.click(screen.getByRole('button',{name:'Import local project'}))
 view.rerender(<LocalWorkspacePanel sessionToken="token-B" billingUrl="https://example.com/billing" />)
 finish({version:1,name:'Local',comments:[comment]})
 await screen.findByText(/Sign-in changed; import stopped/)
 expect(importLocalProject).not.toHaveBeenCalled();expect(deleteLocalComment).not.toHaveBeenCalled()
})
it('stops subsequent batches and suppresses success after changing accounts',async()=>{
 let finish!:()=>void
 vi.mocked(readLocalWorkspace).mockResolvedValue({version:1,name:'Local',comments:[comment,{...comment,id:'second'}]}as never)
 vi.mocked(importLocalProject).mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve({projectId:'p',imported:1})}))
 const view=render(<LocalWorkspacePanel sessionToken="token-A" billingUrl="https://example.com/billing" />)
 fireEvent.click(screen.getByRole('button',{name:'Import to Cloud'}));fireEvent.click(screen.getByRole('button',{name:'Import local project'}))
 await waitFor(()=>expect(importLocalProject).toHaveBeenCalledOnce())
 const signal=vi.mocked(importLocalProject).mock.calls[0][4]!
 view.rerender(<LocalWorkspacePanel sessionToken={null} billingUrl="https://example.com/billing" />)
 view.rerender(<LocalWorkspacePanel sessionToken="token-A" billingUrl="https://example.com/billing" />)
 finish();await screen.findByText(/Sign-in changed; import stopped/)
 expect(signal.aborted).toBe(true);expect(importLocalProject).toHaveBeenCalledOnce()
 expect(screen.queryByText(/Imported into your project/)).toBeNull()
})
it('does not start queued uploads after the popup closes',async()=>{
 let finish!:(value:unknown)=>void
 const view=render(<LocalWorkspacePanel sessionToken="token-A" billingUrl="https://example.com/billing" />)
 fireEvent.click(screen.getByRole('button',{name:'Import to Cloud'}))
 vi.mocked(readLocalWorkspace).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve as never}))
 fireEvent.click(screen.getByRole('button',{name:'Import local project'}));view.unmount()
 finish({version:1,name:'Local',comments:[comment]});await new Promise(resolve=>setTimeout(resolve,0))
 expect(importLocalProject).not.toHaveBeenCalled()
})

it('explains an aborted in-flight request after account change while retaining local data',async()=>{
 vi.mocked(importLocalProject).mockImplementationOnce((_project,_name,_comments,_token,signal)=>new Promise((_resolve,reject)=>{
   signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))
 }))
 const view=render(<LocalWorkspacePanel sessionToken="token-A" billingUrl="https://example.com/billing" />)
 fireEvent.click(screen.getByRole('button',{name:'Import to Cloud'}));fireEvent.click(screen.getByRole('button',{name:'Import local project'}))
 await waitFor(()=>expect(importLocalProject).toHaveBeenCalledOnce())
 view.rerender(<LocalWorkspacePanel sessionToken="token-B" billingUrl="https://example.com/billing" />)
 await screen.findByText(/Sign-in changed; import stopped. Your local feedback is retained/)
 expect(deleteLocalComment).not.toHaveBeenCalled()
})

it('renders compact, left-aligned comment actions with a readable status and capacity',async()=>{
 render(<LocalWorkspacePanel sessionToken={null} billingUrl="https://example.com/billing" />)
 const body=await screen.findByText('Feedback');expect(body.closest('article')).toHaveClass('local-comment')
 expect(screen.getByText('Open')).toHaveClass('local-status');expect(screen.getByText('1/50')).toHaveClass('local-count')
 expect(screen.getByRole('button',{name:'Delete local feedback'})).toHaveAttribute('title','Delete local feedback')
 expect(screen.getByRole('button',{name:'Resolve'})).toHaveClass('local-action')
})

it('shows the latest three comments initially and expands in batches without limiting exports',async()=>{
 const comments=Array.from({length:50},(_,i)=>({...comment,id:String(i),body:`Feedback ${i+1}`}))
 vi.mocked(readLocalWorkspace).mockResolvedValue({version:1,name:'Local',comments}as never)
 render(<LocalWorkspacePanel sessionToken={null} billingUrl="https://example.com/billing" />)
 await screen.findByText('Feedback 50');expect(screen.getByText('50/50')).toBeInTheDocument()
 expect(screen.getAllByRole('article')).toHaveLength(3);expect(screen.queryByText('Feedback 47')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Show more (47 remaining)'}));expect(screen.getAllByRole('article')).toHaveLength(13)
 for(let i=0;i<4;i++)fireEvent.click(screen.getByRole('button',{name:/Show more/}))
 expect(screen.getAllByRole('article')).toHaveLength(50);expect(screen.queryByRole('button',{name:/Show more/})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Show less'}));expect(screen.getAllByRole('article')).toHaveLength(3)
 fireEvent.click(screen.getByRole('button',{name:'Export local feedback'}));await waitFor(()=>expect(exportLocalFeedback).toHaveBeenCalled())
})

it('keeps signed-in local feedback subtle and opens import separately without uploading',async()=>{
 const view=render(<LocalWorkspacePanel sessionToken="pro-token" billingUrl="https://example.com/billing" />)
 const toggle=await screen.findByRole('button',{name:'Local feedback (1)'})
 expect(toggle).toHaveAttribute('aria-expanded','false')
 expect(screen.queryByText('Feedback')).toBeNull();expect(screen.queryByRole('button',{name:'Export local feedback'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Import to Cloud'}))
 expect(screen.getByRole('textbox',{name:'Cloud project key'})).toBeInTheDocument();expect(importLocalProject).not.toHaveBeenCalled()
 expect(screen.queryByText('Feedback')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Import to Cloud'}));expect(screen.queryByRole('textbox',{name:'Cloud project key'})).toBeNull()
 fireEvent.click(toggle);expect(screen.getByText('Feedback')).toBeInTheDocument();expect(toggle).toHaveAttribute('aria-expanded','true')
 fireEvent.click(toggle);expect(screen.queryByText('Feedback')).toBeNull()
 fireEvent.click(toggle);fireEvent.click(screen.getByRole('button',{name:'Import to Cloud'}))
 view.rerender(<LocalWorkspacePanel sessionToken="studio-token" billingUrl="https://example.com/billing" />)
 expect(screen.queryByText('Feedback')).toBeNull();expect(screen.queryByRole('textbox',{name:'Cloud project key'})).toBeNull()
 view.rerender(<LocalWorkspacePanel sessionToken={null} billingUrl="https://example.com/billing" />)
 expect(screen.getByText('Feedback')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Import to Cloud'})).toBeNull()
})
