// @vitest-environment jsdom
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {DocumentView} from '../../../shared/documents'
vi.mock('./client',async original=>({...await original<object>(),documentRequest:vi.fn()}))
import {documentRequest} from './client'
import {DocumentHistory} from './DocumentHistory'
const id='11111111-1111-4111-8111-111111111111'
const initial:DocumentView={id,accessMode:'private',canComment:true,projectId:'p',title:'Proposal',body:'Original',version:1,publishedRevision:null,shareKey:id,sharing:false,passwordProtected:false,archived:false,updatedAt:'2026-11-06',canEdit:true,canPublish:true,canManage:true}
const request=vi.mocked(documentRequest)
beforeEach(()=>request.mockReset())
const revision={number:1,title:'Proposal',summary:'Initial',actor_id:id,agent_id:'agent',created_at:'2026-11-06T00:00:00Z'}
it('loads history, compares revisions, paginates, restores, and reports request errors',async()=>{
  request.mockResolvedValueOnce({revisions:[revision],nextOffset:50});const restore=vi.fn()
  render(<DocumentHistory document={initial} apiBase="/api" session="s" disabled={false} onRestore={restore}/>);expect(screen.getByRole('status')).toBeInTheDocument();await screen.findByText('Revision 1 · Initial')
  request.mockResolvedValueOnce({comparison:{before:'Original',after:'Changed'}});fireEvent.click(screen.getByText('Compare with draft'));await screen.findByText('Changed')
  fireEvent.click(screen.getByText('Restore to draft'));expect(restore).toHaveBeenCalledWith(1)
  request.mockResolvedValueOnce({revisions:[{...revision,number:2,agent_id:null}],nextOffset:null});fireEvent.click(screen.getByText('Load older revisions'));await screen.findByText('Revision 2 · Initial')
  request.mockRejectedValueOnce(new Error());fireEvent.click(screen.getAllByText('Compare with draft')[0]);await screen.findByRole('alert')
})
it('handles empty and unavailable history and ignores completion after unmount',async()=>{
  request.mockResolvedValueOnce({revisions:[]});const view=render(<DocumentHistory document={{...initial,canEdit:false}} apiBase="/api" session="s" disabled={false} onRestore={vi.fn()}/>);await screen.findByText(/Publish the first revision/);view.unmount()
  request.mockRejectedValueOnce(new Error());const failure=render(<DocumentHistory document={initial} apiBase="/api" session="s" disabled={false} onRestore={vi.fn()}/>);await screen.findByRole('alert');failure.unmount()
  for(const fail of [false,true]){let resolve!:(v:object)=>void,reject!:(e:Error)=>void;request.mockImplementationOnce(()=>new Promise((a,b)=>{resolve=a;reject=b}));const pending=render(<DocumentHistory document={initial} apiBase="/api" session="s" disabled={false} onRestore={vi.fn()}/>);pending.unmount();await act(async()=>{if(fail)reject(new Error());else resolve({revisions:[]})})}
  request.mockResolvedValueOnce({revisions:[revision]});render(<DocumentHistory document={{...initial,archived:true}} apiBase="/api" session="s" disabled={false} onRestore={vi.fn()}/>);await screen.findByText('Revision 1 · Initial');expect(screen.queryByText('Restore to draft')).not.toBeInTheDocument()
})

it.each(['success','failure'])('does not report a stale comparison %s after leaving history',async outcome=>{
  request.mockResolvedValueOnce({revisions:[revision]});const onError=vi.fn(),view=render(<DocumentHistory document={initial} apiBase="/api" session="s" disabled={false} onRestore={vi.fn()} onError={onError}/>);await screen.findByText(/Revision 1/)
  let resolve!:(v:object)=>void,reject!:(e:Error)=>void;request.mockImplementationOnce(()=>new Promise((a,b)=>{resolve=a;reject=b}));fireEvent.click(screen.getByText('Compare with draft'));view.unmount();await act(async()=>{if(outcome==='failure')reject(new Error('No access'));else resolve({comparison:{before:'Secret',after:'Private'}})});expect(onError).not.toHaveBeenCalled()
})

it.each(['success','failure'])('ignores previous-session history comparison %s after reauthorization',async outcome=>{
  request.mockResolvedValueOnce({revisions:[revision]});const onError=vi.fn(),props={document:initial,apiBase:'/api',disabled:false,onRestore:vi.fn(),onError},view=render(<DocumentHistory {...props} session="old"/>);await screen.findByText(/Revision 1/)
  let resolve!:(v:object)=>void,reject!:(e:Error)=>void;request.mockImplementationOnce(()=>new Promise((a,b)=>{resolve=a;reject=b}));fireEvent.click(screen.getByText('Compare with draft'));request.mockResolvedValueOnce({revisions:[{...revision,number:2}]});view.rerender(<DocumentHistory {...props} session="new"/>);await screen.findByText(/Revision 2/)
  await act(async()=>{if(outcome==='failure')reject(new Error('Old token rejected'));else resolve({comparison:{before:'Stale secret',after:'Stale draft'}})});expect(onError).not.toHaveBeenCalled();expect(screen.queryByText('Stale secret')).not.toBeInTheDocument();expect(screen.getByText('Compare with draft')).toBeEnabled()
})
