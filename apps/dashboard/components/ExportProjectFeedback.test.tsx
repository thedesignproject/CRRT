import {act,cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react'
import {afterEach,beforeEach,expect,it,vi}from'vitest'
import {ExportProjectFeedback}from'./ExportProjectFeedback'
const fetchMock=vi.fn(),props={apiBase:'/api',accessToken:'session',projectKey:'project/key'}
beforeEach(()=>{vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset().mockResolvedValue({ok:true,blob:async()=>new Blob(['{}'])});vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:export');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('downloads a permission-scoped export without requiring a paid plan',async()=>{
 render(<ExportProjectFeedback {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Export project feedback'}))
 await waitFor(()=>expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export'))
 expect(fetchMock).toHaveBeenCalledWith('/api/v1/projects/project%2Fkey/export',{headers:{Authorization:'Bearer session'}})
 expect(screen.getByText(/Available after cancellation/)).toBeInTheDocument()
})
it('explains failures and rejects stale downloads when the project or account changes',async()=>{
 fetchMock.mockResolvedValueOnce({ok:false});const view=render(<ExportProjectFeedback {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Export project feedback'}));await screen.findByRole('alert')
 let resolve!:(value:unknown)=>void
 fetchMock.mockReturnValueOnce(new Promise(done=>{resolve=done}));fireEvent.click(screen.getByRole('button',{name:'Export project feedback'}));view.rerender(<ExportProjectFeedback {...props} accessToken="new-owner"/>);await act(async()=>resolve({ok:true,blob:async()=>new Blob(['{}'])}));expect(URL.createObjectURL).not.toHaveBeenCalled()
 let reject!:(reason:unknown)=>void
 fetchMock.mockReturnValueOnce(new Promise((_,fail)=>{reject=fail}));fireEvent.click(screen.getByRole('button',{name:'Export project feedback'}));view.unmount();await act(async()=>reject(new Error('late')))
})
