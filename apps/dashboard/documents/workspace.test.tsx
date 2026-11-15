// @vitest-environment jsdom
import { feedbackField, replyField, nameField, openNote, waitForPublication } from '../../../src/__tests__/conversationInteractions'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useEffect, useState } from 'react'
vi.mock('./client',async original=>({...await original<object>(),documentRequest:vi.fn()}))
vi.mock('../hooks/useProjects',()=>({useProjects:vi.fn()}))
import { documentSchemas, type DocumentView, type DocumentComment } from '../../../shared/documents'
import { documentRequest, DocumentRequestError } from './client'
import { DocumentSharing } from './DocumentSharing'
import { DocumentWorkspace } from './DocumentWorkspace'
import { DocumentsPage } from './DocumentsPage'
import { useProjects } from '../hooks/useProjects'
import { DocumentRecoveryProvider, useDocumentRecovery } from './DocumentRecovery'
const id='11111111-1111-4111-8111-111111111111'
const initial:DocumentView={id,accessMode:'private',canComment:true,projectId:'p',title:'Proposal',body:'Original',version:1,publishedRevision:null,shareKey:id,sharing:false,passwordProtected:false,archived:false,updatedAt:'2026-11-06',canEdit:true,canPublish:true,canManage:true}
const comment={id:'22222222-2222-4222-8222-222222222222',document_id:id,revision:1,parent_id:null,quote:'Original',prefix:'',suffix:'',body:'Improve this',author:'Reviewer',review_status:'open',implementation_status:'unassigned',version:1,created_at:'2026-11-06'} as DocumentComment
const request=vi.mocked(documentRequest),onDirty=vi.fn()
beforeEach(()=>{request.mockReset();onDirty.mockReset();Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}})})
afterEach(()=>{vi.useRealTimers()})
it('orders access modes, requires passwords, assigns optional projects and manages invitations',async()=>{
  const action=vi.fn().mockResolvedValue(true),view=render(<DocumentSharing document={initial} disabled={false} onAction={action} projects={[{publicKey:'p',name:'Project'}]} invites={['reviewer@test.local']}/>),access=screen.getByLabelText('Who can open this document?')
  expect(Array.from(access.querySelectorAll('option')).map(o=>o.textContent)).toEqual(['Private','Project members only','Anyone with the link','Anyone with the link + password'])
  fireEvent.change(screen.getByLabelText('Email'),{target:{value:'new@test.local'}});fireEvent.click(screen.getByText('Invite'));expect(action).toHaveBeenLastCalledWith('invite',{email:'new@test.local',remove:false,userRequested:true})
  fireEvent.click(screen.getByText('Remove invitation'));expect(action).toHaveBeenLastCalledWith('invite',{email:'reviewer@test.local',remove:true,userRequested:true})
  fireEvent.change(access,{target:{value:'project'}});expect(screen.getByText(/Requires project membership/)).toBeInTheDocument();fireEvent.change(access,{target:{value:'password'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test password'}});fireEvent.click(screen.getByText('Save access'));expect(action).toHaveBeenLastCalledWith('sharing',{accessMode:'password',password:'test password',userRequested:true})
  fireEvent.change(screen.getByLabelText('Project (optional)'),{target:{value:''}});fireEvent.click(screen.getByText('Save project'));expect(action).toHaveBeenLastCalledWith('assign',{projectId:null,userRequested:true})
  fireEvent.click(screen.getByLabelText('Copy review link'));await screen.findByText('Link copied.')
  vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error());fireEvent.click(screen.getByLabelText('Copy review link'));await screen.findByText(/Could not connect/)
  view.rerender(<DocumentSharing document={{...initial,accessMode:'password',passwordProtected:true,sharing:true,publishedRevision:1}} disabled={false} onAction={action}/>);expect(screen.getByText('Open published document')).toHaveAttribute('rel','noopener noreferrer')
  fireEvent.change(access,{target:{value:'link'}});fireEvent.click(screen.getByText('Save access'));expect(action).toHaveBeenLastCalledWith('sharing',{accessMode:'link',userRequested:true})
  fireEvent.click(screen.getByText('Replace review link'));expect(action).toHaveBeenLastCalledWith('sharing',{accessMode:'password',rotateLink:true,userRequested:true})
  fireEvent.click(screen.getByText('Archive document'));expect(action).toHaveBeenLastCalledWith('archive',{archived:true,userRequested:true})
  expect(screen.getByText('Delete permanently')).toBeDisabled();fireEvent.change(screen.getByLabelText(/To delete permanently/),{target:{value:'Proposal'}});fireEvent.click(screen.getByText('Delete permanently'));expect(action).toHaveBeenLastCalledWith('delete',{userRequested:true})
  view.rerender(<DocumentSharing document={{...initial,archived:true}} disabled={false} onAction={action}/>);fireEvent.click(screen.getByText('Restore document'));expect(action).toHaveBeenLastCalledWith('archive',{archived:false,userRequested:true})
})
it('omits project access for standalone documents and hides management actions from readers',()=>{
  const action=vi.fn(),view=render(<DocumentSharing document={{...initial,projectId:null}} disabled={false} onAction={action}/>);expect(screen.queryByRole('option',{name:'Project members only'})).not.toBeInTheDocument();fireEvent.click(screen.getByText('Save access'));expect(action).toHaveBeenCalledWith('sharing',{accessMode:'private',userRequested:true})
  view.rerender(<DocumentSharing document={{...initial,canManage:false}} disabled onAction={action}/>);expect(screen.queryByText('Save access')).not.toBeInTheDocument();expect(screen.getByLabelText('Who can open this document?')).toBeDisabled()
})
const revision={number:1,title:'Proposal',summary:'Initial',actor_id:id,agent_id:'agent',created_at:'2026-11-06T00:00:00Z'}
function memory(start:DocumentView[]=[]) {
  let docs=start.map(d=>({...d})),feedback:DocumentComment[]=[]
  request.mockImplementation(async(_api,_session,raw)=>{
    const input=raw as Record<string,unknown>;documentSchemas[input.action as keyof typeof documentSchemas].parse(input)
    if(input.action==='list')return {documents:docs,nextOffset:null}
    const doc=docs.find(d=>d.id===input.id)
    if(input.action==='read')return {document:{...doc!},feedback:[...feedback],nextOffset:null}
    if(input.action==='create')docs=[{...initial,id:input.id as string,title:input.title as string}]
    else if(input.action==='delete')docs=[]
    else if(input.action==='history')return {revisions:[revision],nextOffset:null}
    else if(input.action==='revision')return {revision:{...revision,number:input.revision as number,body:'Original'}}
    else if(input.action==='compare')return {comparison:{before:'Original',after:'Changed'}}
    else if(input.action==='comment')feedback=[comment,{...comment,id:'33333333-3333-4333-8333-333333333333',parent_id:input.parentId as string,body:input.body as string}]
    else if(input.action==='review')feedback=feedback.map(f=>({...f,review_status:input.reviewStatus as 'accepted'}))
    else {Object.assign(doc!,{version:doc!.version+1},input.action==='save'?{title:input.title,body:input.body}:input.action==='publish'?{publishedRevision:1}:input.action==='restore'?{body:'Restored'}:input.action==='archive'?{archived:input.archived}:input.action==='sharing'?{sharing:input.sharing}:{})}
    return {id:input.id as string,version:docs.find(d=>d.id===input.id)?.version}
  })
  return {feedback:(items:DocumentComment[])=>{feedback=items}}
}
const workspace=(canCreate=true)=>render(<DocumentWorkspace userId={id} apiBase="/api" session="s" projectId="p" canCreate={canCreate} author="Member"/>)
it('creates, edits, publishes, previews, restores and deletes through the workspace',async()=>{
  memory();workspace();await screen.findByText('Create your first document and share it for review.')
  fireEvent.click(screen.getByLabelText('New document'));fireEvent.click(screen.getByText('Cancel'));fireEvent.click(screen.getByLabelText('New document'));fireEvent.change(screen.getByLabelText('Document title'),{target:{value:'Proposal'}});fireEvent.click(screen.getByText('Create draft'));await screen.findByLabelText('Markdown')
  fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Updated draft'}});fireEvent.click(screen.getByText('Save draft'));await screen.findByText('All changes saved')
  fireEvent.change(screen.getByLabelText('What changed?'),{target:{value:'Initial publication'}});fireEvent.click(screen.getByText('Publish revision'));await screen.findByText('Revision published.')
  fireEvent.click(screen.getByText('Preview'));await screen.findByText('Updated draft')
  fireEvent.click(screen.getByText('History'));await screen.findByText('Revision 1 · Initial');fireEvent.click(screen.getByText('Restore to draft'));await waitFor(()=>expect(screen.getByLabelText('Markdown')).toHaveValue('Restored'))
  fireEvent.click(screen.getByText('Sharing'));fireEvent.change(screen.getByLabelText(/To delete permanently/),{target:{value:'Proposal'}});fireEvent.click(screen.getByText('Delete permanently'));await screen.findByText('Document deleted.')
})
it('reviews feedback, replies, searches documents, reloads and preserves draft conflicts',async()=>{
  const state=memory([{...initial,publishedRevision:1}]);state.feedback([comment]);workspace();await screen.findByText('Proposal');fireEvent.click(screen.getByText('Proposal'));await screen.findByLabelText('Markdown')
  fireEvent.click(screen.getByText('Feedback'));await waitForPublication();await screen.findByText('Improve this');fireEvent.click(screen.getByText('Accept'));await screen.findByText('Changes saved.');fireEvent.click(screen.getByText('Done'));await waitFor(()=>expect(request).toHaveBeenCalledWith('/api','s',expect.objectContaining({implementationStatus:'done'})))
  fireEvent.click(screen.getByText('Reply'));fireEvent.change(replyField(),{target:{value:'On it'}});fireEvent.click(screen.getByText('Send reply'));await screen.findByText('On it');await waitFor(()=>expect(screen.getByRole('button',{name:'Edit'})).toBeEnabled())
  fireEvent.click(screen.getByText('Edit'));fireEvent.click(screen.getByText('Reload latest'));await waitFor(()=>expect(screen.getByLabelText('Markdown')).toBeEnabled())
  request.mockRejectedValueOnce(new DocumentRequestError('version_conflict'));fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Keep my text'}});fireEvent.click(screen.getByText('Save draft'));await screen.findByRole('alert');expect(screen.getByLabelText('Markdown')).toHaveValue('Keep my text')
  await waitFor(()=>expect(screen.getByText('Save draft')).toBeEnabled());fireEvent.click(screen.getByText('Save draft'));await screen.findByText('All changes saved')
  fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Discard this'}})
  fireEvent.click(screen.getByText('Discard changes'));fireEvent.change(screen.getByLabelText('Search documents'),{target:{value:'none'}});expect(screen.queryByRole('button',{name:/Proposal Draft/})).not.toBeInTheDocument()
})
function deferred(){let resolve!:(value:object)=>void,reject!:(error:Error)=>void;const promise=new Promise<object>((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
it('ignores initial and selected document responses after unmount and reports live failures',async()=>{
  for(const phase of ['list','select'])for(const fail of [false,true]){
    const pending=deferred()
    if(phase==='list')request.mockImplementationOnce(()=>pending.promise)
    else request.mockResolvedValueOnce({documents:[initial],nextOffset:null}).mockImplementationOnce(()=>pending.promise)
    const view=workspace()
    if(phase==='select'){await screen.findByText('Proposal');fireEvent.click(screen.getByText('Proposal'))}
    view.unmount();await act(async()=>{if(fail)pending.reject(new Error());else pending.resolve(phase==='list'?{documents:[]}:{document:initial,feedback:[],nextOffset:null})})
  }
  request.mockRejectedValueOnce(new Error());const failed=workspace();await screen.findByRole('alert');failed.unmount()
  request.mockResolvedValueOnce({documents:[initial],nextOffset:null}).mockRejectedValueOnce(new Error());workspace();await screen.findByText('Proposal');fireEvent.click(screen.getByText('Proposal'));await screen.findByRole('alert')
})
it('handles library and feedback pagination with live failures and unmounted results',async()=>{
  for(const kind of ['documents','feedback'])for(const outcome of ['success','failure','unmount-success','unmount-failure']){
    request.mockResolvedValueOnce({documents:[initial],nextOffset:50})
    const view=workspace();await screen.findByText('Proposal')
    if(kind==='feedback'){request.mockResolvedValueOnce({document:initial,feedback:[comment],nextOffset:50});fireEvent.click(screen.getByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'))}
    const pending=deferred();request.mockImplementationOnce(()=>pending.promise);fireEvent.click(screen.getByText(kind==='documents'?'Load more documents':'Load more feedback'))
    if(outcome.startsWith('unmount'))view.unmount()
    await act(async()=>{if(outcome.endsWith('failure'))pending.reject(new Error());else pending.resolve(kind==='documents'?{documents:[{...initial,id:'other',title:'Second',archived:true}],nextOffset:null}:{document:initial,feedback:[{...comment,id:'more'}],nextOffset:null})})
    if(outcome==='failure')expect(screen.getByRole('alert')).toBeInTheDocument()
    if(outcome==='success')expect(screen.getAllByText(kind==='documents'?'Second':'Feedback').length).toBeGreaterThan(0)
    view.unmount()
  }
})
it('finishes in-flight mutations safely after leaving the workspace',async()=>{
  for(const kind of ['save','delete','failure']){
    memory([initial]);const view=workspace();await screen.findByText('Proposal');fireEvent.click(screen.getByText('Proposal'));await screen.findByLabelText('Markdown')
    const pending=deferred()
    if(kind==='delete'){fireEvent.click(screen.getByText('Sharing'));fireEvent.change(screen.getByLabelText(/To delete permanently/),{target:{value:'Proposal'}})}
    else fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Pending'}})
    request.mockImplementationOnce(()=>pending.promise)
    fireEvent.click(screen.getByText(kind==='delete'?'Delete permanently':'Save draft'));view.unmount()
    await act(async()=>{if(kind==='failure')pending.reject(new Error());else pending.resolve({id})})
  }
})
it('supports read-only and archived documents and recoverable comment failures',async()=>{
  memory([{...initial,canEdit:false,canPublish:false,canManage:false,canComment:false,archived:true}]);const archived=workspace(false);await screen.findByText('Proposal');fireEvent.click(screen.getByText('Proposal'));await screen.findByText('Original');expect(screen.queryByRole('button',{name:'History'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Sharing'})).not.toBeInTheDocument();expect(screen.getByText('Archived · sharing disabled')).toBeInTheDocument();fireEvent.click(screen.getByText('Feedback'));await waitForPublication();expect(screen.queryByText('Accept')).not.toBeInTheDocument();archived.unmount()
  memory([initial]);workspace();await screen.findByText('Proposal');fireEvent.click(screen.getByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'))
  request.mockRejectedValueOnce(new Error());fireEvent.change(feedbackField(),{target:{value:'A note'}});fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(screen.getAllByRole('alert').length).toBe(2))
})
it('shows project loading, errors, empty memberships and project switching',async()=>{
  memory();const projects=vi.mocked(useProjects);projects.mockReturnValue({projects:[],loading:true,error:null} as never)
  const view=render(<DocumentsPage apiBase="/api" session="s" author="Me"/>);expect(screen.getByRole('status')).toBeInTheDocument()
  projects.mockReturnValue({projects:[],loading:false,error:'No access'} as never);view.rerender(<DocumentsPage apiBase="/api" session="s" author="Me"/>);expect(screen.getByRole('alert')).toHaveTextContent('No access')
  projects.mockReturnValue({projects:[],loading:false,error:null} as never);view.rerender(<DocumentsPage apiBase="/api" session="s" author="Me"/>);expect(screen.getByLabelText('New document')).toBeInTheDocument()
  memory();projects.mockReturnValue({projects:[{publicKey:'p',name:'First',capabilities:['feedback:manage']},{publicKey:'other',name:'Other'}],loading:false,error:null} as never);view.rerender(<DocumentsPage apiBase="/api" session="s" author="Me"/>);await screen.findByLabelText('New document');fireEvent.change(screen.getByLabelText('View'),{target:{value:'project:other'}});await screen.findByText('No documents in this project yet.')
})
it.each(['First checkpoint plus later typing','Original'])('preserves in-flight edits, including reverting to the old text: %s',async(continuedBody)=>{
  let doc={...initial},finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve}),saves:Record<string,unknown>[]=[]
  request.mockImplementation(async(_api,_session,raw)=>{const input=raw as Record<string,unknown>
    if(input.action==='list')return{documents:[doc],nextOffset:null}
    if(input.action==='read')return{document:{...doc},feedback:[],nextOffset:null}
    saves.push(input);if(saves.length===1)await pending
    doc={...doc,title:input.title as string,body:input.body as string,version:doc.version+1};return{id:doc.id,version:doc.version}
  })
  workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown')
  fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'First checkpoint'}});fireEvent.click(screen.getByText('Save draft'))
  fireEvent.change(screen.getByLabelText('Title'),{target:{value:'New title'}});fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:continuedBody}})
  await act(async()=>finish());expect(screen.getByLabelText('Title')).toHaveValue('New title');expect(screen.getByLabelText('Markdown')).toHaveValue(continuedBody)
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Preview'})).toBeDisabled()
  fireEvent.click(screen.getByText('Save draft'));await screen.findByText('All changes saved')
  expect(saves[1]).toMatchObject({expectedVersion:2,title:'New title',body:continuedBody});await waitFor(()=>expect(screen.getByRole('button',{name:'Preview'})).not.toBeDisabled())
})
it('pauses on a collaborator write after saving and preserves local text through reload',async()=>{
  let doc={...initial},collaborator=false
  request.mockImplementation(async(_api,_session,raw)=>{const input=raw as Record<string,unknown>
    if(input.action==='list')return{documents:[doc],nextOffset:null}
    if(input.action==='read')return{document:{...doc},feedback:[],nextOffset:null}
    const savedVersion=doc.version+1;doc={...doc,title:input.title as string,body:input.body as string,version:savedVersion}
    if(!collaborator){collaborator=true;doc={...doc,body:'Collaborator text',version:savedVersion+1}}
    return{id,version:savedVersion}
  })
  workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown')
  fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'My work'}});fireEvent.click(screen.getByText('Save draft'));await screen.findByRole('alert');expect(screen.getByLabelText('Markdown')).toHaveValue('My work')
  fireEvent.click(screen.getByText('Reload latest'));await screen.findByText('Collaborator text');expect(screen.getByLabelText('Markdown')).toHaveValue('My work')
  expect(screen.getByRole('status')).toHaveTextContent('Autosave paused');fireEvent.click(screen.getByText('Save draft'));await screen.findByText('All changes saved')
  expect(request).toHaveBeenLastCalledWith('/api','s',{action:'read',id})
})
it('blocks switching projects while the editor has unsaved changes',async()=>{
  memory([initial]);vi.mocked(useProjects).mockReturnValue({projects:[{publicKey:'p',name:'Project'}],loading:false,error:null} as never)
  render(<DocumentsPage apiBase="/api" session="s" author="Me"/>);fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown')
  fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Keep me'}});expect(screen.getByLabelText('View')).toBeDisabled()
  fireEvent.click(screen.getByText('Discard changes'));await waitFor(()=>expect(screen.getByLabelText('View')).not.toBeDisabled())
})
it('keeps existing password settings when saving access with no replacement',()=>{
  const action=vi.fn();render(<DocumentSharing document={{...initial,accessMode:'password',passwordProtected:true}} disabled={false} onAction={action}/>);fireEvent.click(screen.getByText('Save access'));expect(action).toHaveBeenCalledWith('sharing',{accessMode:'password',userRequested:true})
})
it('ignores refreshed content after a successful mutation when unmounted',async()=>{
  memory([initial]);const view=workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Saved'}})
  const pending=deferred();request.mockResolvedValueOnce({id,version:2}).mockResolvedValueOnce({documents:[initial]}).mockImplementationOnce(()=>pending.promise);fireEvent.click(screen.getByText('Save draft'));await waitFor(()=>expect(request).toHaveBeenLastCalledWith('/api','s',{action:'read',id}));view.unmount();await act(async()=>pending.resolve({document:{...initial,version:2},feedback:[]}))
})
it.each([false,true])('preserves editor state across project/token refresh, including conflict=%s',async conflict=>{
  memory([initial]);const projects=vi.mocked(useProjects),items=[{publicKey:'p',name:'Project'}];projects.mockReturnValue({projects:items,loading:false,error:null} as never)
  const view=render(<DocumentsPage apiBase="/api" session="old-token" author="Me"/>);fireEvent.click(await screen.findByText('Proposal'));const input=await screen.findByLabelText('Markdown');fireEvent.change(input,{target:{value:'Keep this draft'}})
  if(conflict){request.mockRejectedValueOnce(new DocumentRequestError('version_conflict'));fireEvent.click(screen.getByText('Save draft'));await screen.findByRole('alert')}
  projects.mockReturnValue({projects:items,loading:true,error:null} as never);view.rerender(<DocumentsPage apiBase="/api" session="new-token" author="Me"/>);expect(screen.getByLabelText('Markdown')).toBe(input);expect(input).toHaveValue('Keep this draft')
  projects.mockReturnValue({projects:items,loading:false,error:null} as never);view.rerender(<DocumentsPage apiBase="/api" session="new-token" author="Me"/>);expect(screen.getByLabelText('Markdown')).toBe(input);expect(input).toHaveValue('Keep this draft');await waitFor(()=>expect(input).toBeEnabled());if(conflict)expect(screen.getByRole('status')).toHaveTextContent('Autosave paused')
})
it('locks clean editor inputs during a reset-producing reload',async()=>{
  memory([initial]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');const pending=deferred();request.mockImplementationOnce(()=>pending.promise);fireEvent.click(screen.getByText('Reload latest'))
  expect(screen.getByLabelText('Title')).toBeDisabled();expect(screen.getByLabelText('Markdown')).toBeDisabled()
  await act(async()=>pending.resolve({document:{...initial,body:'Latest server text',version:2},feedback:[],nextOffset:null}));expect(screen.getByLabelText('Markdown')).toBeEnabled();expect(screen.getByLabelText('Markdown')).toHaveValue('Latest server text')
})
it('guards feedback drafts against tab, document and project navigation until discarded',async()=>{
  memory([{...initial,publishedRevision:1}]);vi.mocked(useProjects).mockReturnValue({projects:[{publicKey:'p',name:'Project'}],loading:false,error:null} as never)
  render(<DocumentsPage apiBase="/api" session="s" author="Me"/>);fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication();fireEvent.change(feedbackField(),{target:{value:'Do not lose this'}})
  for(const name of ['Preview','Reload latest','New document'])expect(screen.getByRole('button',{name})).toBeDisabled();expect(screen.getByLabelText('View')).toBeDisabled();expect(screen.getByRole('button',{name:/^Proposal/})).toBeDisabled()
  fireEvent.click(screen.getByText('Discard feedback'));await waitFor(()=>expect(screen.getByLabelText('View')).toBeEnabled());fireEvent.click(screen.getByText('Preview'));fireEvent.click(screen.getByText('Feedback'));await waitForPublication();expect(feedbackField()).toHaveValue('')
})
it.each(['owner','admin','member','guest',undefined])('uses document project roles when widget feedback is private: %s',async role=>{
  memory();vi.mocked(useProjects).mockReturnValue({projects:[{publicKey:'p',name:'Project',role,widgetPrivate:true,feedbackAccess:'admins',capabilities:['feedback:create']}],loading:false,error:null} as never)
  render(<DocumentsPage apiBase="/api" session="s" author="Me"/>);fireEvent.change(screen.getByLabelText('View'),{target:{value:'project:p'}})
  if(role&&role!=='guest')expect(await screen.findByLabelText('New document')).toBeInTheDocument();else await screen.findByText('No documents in this project yet.')
})
it('serializes reviews and keeps navigation locked until the operation finishes',async()=>{
  const state=memory([{...initial,publishedRevision:1},{...initial,id:'33333333-3333-4333-8333-333333333333',title:'Second'}]);state.feedback([comment,{...comment,id:'other-comment',body:'Another note'}]);request.mockResolvedValueOnce({documents:[initial,{...initial,id:'33333333-3333-4333-8333-333333333333',title:'Second'}],nextOffset:50});workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication();const pending=deferred();request.mockImplementationOnce(()=>pending.promise)
  const reviews=screen.getAllByText('Accept') as HTMLButtonElement[],reload=screen.getByText('Reload latest') as HTMLButtonElement,other=screen.getByText('Second').closest('button')!,more=screen.getByText('Load more documents') as HTMLButtonElement
  act(()=>{reviews[0].click();reviews[1].click();reload.click();other.click();more.click()})
  expect(request.mock.calls.filter(call=>(call[2] as any).action==='review')).toHaveLength(1)
  for(const name of ['Accept','Reject','Done','Reply'])for(const button of screen.getAllByRole('button',{name}))expect(button).toBeDisabled();expect(other).toBeDisabled();expect(screen.getByRole('menuitem',{name:/Add note/,hidden:true})).toBeDisabled()
  await act(async()=>pending.resolve({id}));await waitFor(()=>expect(other).toBeEnabled());fireEvent.click(other);await screen.findByLabelText('Markdown');fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'New document draft'}});expect(screen.getByLabelText('Markdown')).toHaveValue('New document draft');expect(screen.getByRole('heading',{name:'Second'})).toBeInTheDocument()
})
it.each(['private','link','password','detach'])('clears management state after a completed %s access transition removes access',async mode=>{
  memory([{...initial,accessMode:'project',sharing:true,publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Sharing'))
  request.mockResolvedValueOnce({id}).mockResolvedValueOnce({documents:[],nextOffset:null}).mockRejectedValueOnce(new DocumentRequestError(mode==='link'||mode==='password'?'document_not_found':'forbidden'))
  if(mode==='detach'){fireEvent.change(screen.getByLabelText('Project (optional)'),{target:{value:''}});fireEvent.click(screen.getByText('Save project'))}else{fireEvent.change(screen.getByLabelText('Who can open this document?'),{target:{value:mode}});if(mode==='password')fireEvent.change(screen.getByLabelText('Password'),{target:{value:'new password'}});fireEvent.click(screen.getByText('Save access'))}
  await screen.findByText('Changes saved. This document is no longer available in this workspace.');expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.queryByText('Save access')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/^Proposal/})).not.toBeInTheDocument();expect(screen.getByLabelText('New document')).toBeEnabled()
})
it.each(['network','conflict','publish'])('keeps unrelated %s follow-up failures visible',async kind=>{
  memory([{...initial,publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown')
  request.mockResolvedValueOnce({id}).mockResolvedValueOnce({documents:[],nextOffset:null}).mockRejectedValueOnce(kind==='network'?new Error('Offline'):new DocumentRequestError(kind==='conflict'?'version_conflict':'forbidden'))
  if(kind==='publish'){fireEvent.change(screen.getByLabelText('What changed?'),{target:{value:'Publication'}});fireEvent.click(screen.getByText('Publish revision'))}else{fireEvent.click(screen.getByText('Sharing'));fireEvent.click(screen.getByText('Save access'))}
  await screen.findByRole('alert');expect(screen.queryByText('Changes saved. This document is no longer available in this workspace.')).not.toBeInTheDocument();expect(screen.getByRole('heading',{name:kind==='publish'?'Document unavailable':'Proposal'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:/^Proposal/})).not.toBeInTheDocument()
})
it('opens published preview after an access change retains only invited-reader permissions',async()=>{
  memory([{...initial,publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Sharing'))
  request.mockResolvedValueOnce({id}).mockResolvedValueOnce({documents:[{...initial,canManage:false}],nextOffset:null}).mockResolvedValueOnce({document:{...initial,body:'Published view',canEdit:false,canManage:false,canPublish:false,publishedRevision:1},feedback:[],nextOffset:null});fireEvent.click(screen.getByText('Save access'));await screen.findByText('Published view');expect(screen.queryByText('Save access')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Preview'})).toHaveAttribute('aria-pressed','true')
})
it('ignores an expected access-loss response after leaving the workspace',async()=>{
  memory([initial]);const view=workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Sharing'));const pending=deferred();request.mockResolvedValueOnce({id}).mockResolvedValueOnce({documents:[],nextOffset:null}).mockImplementationOnce(()=>pending.promise);fireEvent.click(screen.getByText('Save access'));await waitFor(()=>expect(request).toHaveBeenLastCalledWith('/api','s',{action:'read',id}));view.unmount();await act(async()=>pending.reject(new DocumentRequestError('forbidden')))
})
it('keeps unsaved editor text available after reload downgrades editing to invited-reader access',async()=>{
  memory([initial]);workspace();fireEvent.click(await screen.findByText('Proposal'));const body=await screen.findByLabelText('Markdown');fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Local title'}});fireEvent.change(body,{target:{value:'Local work to recover'}})
  request.mockResolvedValueOnce({document:{...initial,title:'Published title',body:'Published content',canEdit:false,canPublish:false,canManage:false,publishedRevision:1},feedback:[],nextOffset:null});fireEvent.click(screen.getByText('Reload latest'));await screen.findByText(/Your editing access changed/);expect(screen.getByLabelText('Markdown')).toBe(body);expect(body).toHaveValue('Local work to recover');expect(body).toHaveProperty('readOnly',true);expect(body).toBeEnabled();expect(screen.getByLabelText('Title')).toHaveValue('Local title');expect(screen.queryByText('Save draft')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Your draft'})).toHaveAttribute('aria-pressed','true')
  fireEvent.click(screen.getByText('Discard changes'));await screen.findByText('Published content');expect(screen.getByRole('button',{name:'Preview'})).toBeEnabled();expect(screen.getByLabelText('New document')).toBeEnabled();expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument()
})
it.each(['review','discard'])('retains independent comment operation identity across %s after a lost confirmation',async scenario=>{
  const state=memory([{...initial,publishedRevision:1}]);state.feedback([comment]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication();fireEvent.change(feedbackField(),{target:{value:'Keep the same note'}})
  request.mockResolvedValueOnce({feedbackId:id}).mockRejectedValueOnce(new Error('Confirmation lost'));fireEvent.click(screen.getByText('Add feedback'));await screen.findAllByRole('alert');expect(feedbackField()).toBeDisabled();const first=request.mock.calls.find(call=>(call[2] as any).action==='comment')![2] as any
  if(scenario==='review'){fireEvent.click(screen.getByText('Accept'));await screen.findByText('Changes saved.');await waitFor(()=>expect(screen.getByText('Add feedback')).toBeEnabled());request.mockResolvedValueOnce({document:{...initial,publishedRevision:1},feedback:[{...comment,id,body:'Keep the same note'}],nextOffset:null})}
  else{fireEvent.click(screen.getByText('Discard feedback'));expect(screen.queryByRole('alert')).not.toBeInTheDocument();fireEvent.change(feedbackField(),{target:{value:'Keep the same note'}});request.mockResolvedValueOnce({feedbackId:id}).mockResolvedValueOnce({document:{...initial,publishedRevision:1},feedback:[{...comment,id,body:'Keep the same note'}],nextOffset:null})}
  fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(feedbackField()).toHaveValue(''));const posts=request.mock.calls.filter(call=>(call[2] as any).action==='comment');expect(posts).toHaveLength(scenario==='review'?1:2);if(scenario==='discard')expect((posts[1][2] as any).key).not.toBe(first.key)
})
it('rejects a batched comment submit while a review is already in flight without losing the draft',async()=>{
  const state=memory([{...initial,publishedRevision:1}]);state.feedback([comment]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication();fireEvent.change(feedbackField(),{target:{value:'Preserve this draft'}});const pending=deferred();request.mockImplementationOnce(()=>pending.promise);const accept=screen.getByText('Accept') as HTMLButtonElement,field=feedbackField()
  act(()=>{accept.click();field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}))});await screen.findByText('Wait for the current request to finish, then try again.');expect(request.mock.calls.filter(call=>(call[2] as any).action==='comment')).toHaveLength(0);expect(feedbackField()).toHaveValue('Preserve this draft');await act(async()=>pending.resolve({id}))
})
it.each(['success','failure'])('finishes comment confirmation safely after unmount: %s',async outcome=>{
  memory([{...initial,publishedRevision:1}]);const view=workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication();fireEvent.change(feedbackField(),{target:{value:'Pending feedback'}});const pending=deferred();request.mockImplementationOnce(()=>pending.promise);fireEvent.click(screen.getByText('Add feedback'));view.unmount();await act(async()=>{if(outcome==='success')pending.resolve({feedbackId:id});else pending.reject(new Error('Offline'))})
})

it.each(['editor','feedback'])('preserves pending %s when the selected project disappears',async kind=>{
  memory([{...initial,publishedRevision:2}]);const projects=vi.mocked(useProjects);projects.mockReturnValue({projects:[{publicKey:'p',name:'Project',role:'member'}],loading:false,error:null} as never)
  const view=render(<DocumentsPage apiBase="/api" session="s" author="Me"/>);fireEvent.change(screen.getByLabelText('View'),{target:{value:'project:p'}});fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');if(kind==='feedback'){fireEvent.click(screen.getByText('Feedback'));await waitForPublication()}
  const field=(kind==='editor'?screen.getByLabelText('Markdown'):feedbackField());fireEvent.change(field,{target:{value:'Keep my pending work'}})
  projects.mockReturnValue({projects:[],loading:false,error:null} as never);view.rerender(<DocumentsPage apiBase="/api" session="new" author="Me"/>);expect((kind==='editor'?screen.getByLabelText('Markdown'):feedbackField())).toBe(field);expect(field).toHaveValue('Keep my pending work');expect(screen.getByLabelText('View')).toHaveValue('project:p');expect(screen.getByRole('option',{name:'Project unavailable'})).toBeInTheDocument();expect(screen.queryByLabelText('New document')).not.toBeInTheDocument()
})
it('preserves a later-page thread and shows its reply after a review refresh',async()=>{
  const state=memory([{...initial,publishedRevision:2}]);state.feedback([]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'))
  request.mockResolvedValueOnce({document:{...initial,publishedRevision:2},feedback:[comment],nextOffset:50});fireEvent.click(screen.getByText('Reload latest'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication();await screen.findByText('Improve this')
  const older={...comment,id:'44444444-4444-4444-8444-444444444444',body:'Older page parent'};request.mockResolvedValueOnce({document:{...initial,publishedRevision:2},feedback:[older],nextOffset:null});fireEvent.click(screen.getByText('Load more feedback'));await screen.findByText('Older page parent');fireEvent.click(screen.getAllByText('Reply')[1]);fireEvent.change(replyField(),{target:{value:'Reply across refresh'}})
  state.feedback([comment]);fireEvent.click(screen.getAllByText('Accept')[0]);await screen.findByText('Changes saved.');expect(screen.getByText('Older page parent')).toBeInTheDocument();fireEvent.click(screen.getByText('Send reply'));await waitFor(()=>expect(feedbackField()).toHaveValue(''))
  expect(request.mock.calls.map(c=>c[2]).find((i:any)=>i.action==='comment')).toMatchObject({revision:1,parentId:older.id});expect(screen.getByText('Reply across refresh')).toBeInTheDocument()
})

it.each(['Preview','Feedback','Edit','History','Sharing'])('conceals cached %s content after a reload definitively loses access',async tab=>{
  const state=memory([{...initial,body:'Private server text',publishedRevision:1}]);state.feedback([comment]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');if(tab!=='Edit')fireEvent.click(screen.getByRole('button',{name:tab}));if(tab==='History')await screen.findByText(/Revision 1/)
  request.mockRejectedValueOnce(new DocumentRequestError('forbidden'));fireEvent.click(screen.getByText('Reload latest'));await screen.findByRole('heading',{name:'Document unavailable'});expect(screen.queryByText('Private server text')).not.toBeInTheDocument();expect(screen.queryByText('Improve this')).not.toBeInTheDocument();expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument();expect(screen.queryByText('Save access')).not.toBeInTheDocument();expect(screen.queryByText('Compare with draft')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/^Proposal/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Feedback'}));await waitForPublication();expect(screen.queryByText('Improve this')).not.toBeInTheDocument();expect(screen.queryByText('Reply')).not.toBeInTheDocument();expect(screen.queryByText('Add feedback')).not.toBeInTheDocument()
})
it.each(['Unauthorized','login_required','document_not_found'])('conceals an invited reader document on %s and restores only after a successful read',async code=>{
  memory([{...initial,body:'Invited published content',canEdit:false,canManage:false,canPublish:false,publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByText('Invited published content');request.mockRejectedValueOnce(new DocumentRequestError(code));fireEvent.click(screen.getByText('Reload latest'));await screen.findByRole('heading',{name:'Document unavailable'});expect(screen.queryByText('Invited published content')).not.toBeInTheDocument()
  const pending=deferred();request.mockImplementationOnce(()=>pending.promise);fireEvent.click(screen.getByText('Reload latest'));expect(screen.queryByText('Invited published content')).not.toBeInTheDocument();await act(async()=>pending.resolve({document:{...initial,body:'Invited published content',canEdit:false,canManage:false,canPublish:false},feedback:[],nextOffset:null}));await screen.findByText('Invited published content')
})
it.each([false,true])('retains only the local editor draft when access is denied, conflict=%s',async conflict=>{
  memory([{...initial,body:'Saved private content',publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));const input=await screen.findByLabelText('Markdown');fireEvent.change(input,{target:{value:'My unsaved work'}});fireEvent.change(screen.getByLabelText('Title'),{target:{value:'My unsaved title'}})
  if(conflict){request.mockRejectedValueOnce(new DocumentRequestError('version_conflict'));fireEvent.click(screen.getByText('Save draft'));await screen.findByText(/This document changed elsewhere/)}
  request.mockRejectedValueOnce(new DocumentRequestError('forbidden'));fireEvent.click(screen.getByText('Reload latest'));await screen.findByRole('heading',{name:'Document unavailable'});expect(screen.getByLabelText('Markdown')).toBe(input);expect(input).toHaveValue('My unsaved work');expect(input).toBeEnabled();expect(input).toHaveProperty('readOnly',true);expect(screen.getByLabelText('Title')).toHaveValue('My unsaved title');expect(screen.queryByText('Saved private content')).not.toBeInTheDocument();expect(screen.queryByText('Current published content')).not.toBeInTheDocument();expect(screen.queryByText('Save draft')).not.toBeInTheDocument();expect(screen.queryByText('Publish revision')).not.toBeInTheDocument();fireEvent.click(screen.getByText('Discard changes'));expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument()
})
it('conceals server feedback and reply context while retaining a rejected local feedback draft',async()=>{
  const state=memory([{...initial,publishedRevision:1}]);state.feedback([comment]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication();fireEvent.click(screen.getByText('Reply'));fireEvent.change(replyField(),{target:{value:'My unsent feedback'}});request.mockRejectedValueOnce(new DocumentRequestError('Unauthorized'));fireEvent.click(screen.getByText('Send reply'));await screen.findByRole('heading',{name:'Document unavailable'});expect(replyField()).toHaveValue('My unsent feedback');expect(replyField()).toHaveProperty('readOnly',true);expect(screen.queryByText('Improve this')).not.toBeInTheDocument();expect(screen.queryByText(/Replying to Reviewer/)).not.toBeInTheDocument();fireEvent.click(screen.getByText('Discard feedback'));expect(screen.queryByRole('alert')).toBeInTheDocument();fireEvent.click(screen.getByText('Reload latest'));await screen.findByLabelText('Markdown')
})
it('conceals an open document after a refreshed project list rejects the session',async()=>{
  memory([initial]);const view=render(<DocumentWorkspace apiBase="/api" session="old" projectId="p" canCreate author="Member"/>);fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');request.mockRejectedValueOnce(new DocumentRequestError('Unauthorized')).mockRejectedValueOnce(new DocumentRequestError('Unauthorized'));view.rerender(<DocumentWorkspace apiBase="/api" session="invalid" projectId="p" canCreate author="Member"/>);await screen.findByRole('heading',{name:'Document unavailable'});expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument()
})

it.each(['initial','compare'])('conceals the workspace after history %s access rejection',async phase=>{
  memory([{...initial,publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');if(phase==='initial')request.mockRejectedValueOnce(new DocumentRequestError('forbidden'));fireEvent.click(screen.getByText('History'))
  if(phase==='compare'){await screen.findByText(/Revision 1/);request.mockRejectedValueOnce(new DocumentRequestError('Unauthorized'));fireEvent.click(screen.getByText('Compare with draft'))}
  await screen.findByRole('heading',{name:'Document unavailable'});expect(screen.queryByLabelText('Document history')).not.toBeInTheDocument();expect(screen.queryByText('Original')).not.toBeInTheDocument()
})

it('does not restore protected library titles from an old session after the current session is denied',async()=>{
  const old=deferred();request.mockImplementationOnce(()=>old.promise);const view=render(<DocumentWorkspace apiBase="/api" session="old" projectId="p" canCreate author="Member"/>);request.mockRejectedValueOnce(new DocumentRequestError('Unauthorized')).mockRejectedValueOnce(new DocumentRequestError('Unauthorized'));view.rerender(<DocumentWorkspace apiBase="/api" session="invalid" projectId="p" canCreate author="Member"/>);await screen.findByRole('alert')
  await act(async()=>old.resolve({documents:[{...initial,title:'Protected old-session title'}],nextOffset:50}));expect(screen.queryByText('Protected old-session title')).not.toBeInTheDocument();expect(screen.queryByText('Load more documents')).not.toBeInTheDocument();expect(screen.getByRole('alert')).toBeInTheDocument()
})
it.each(['success','failure'])('ignores stale library %s after the current session has loaded',async outcome=>{
  const old=deferred();request.mockImplementationOnce(()=>old.promise);const view=render(<DocumentWorkspace apiBase="/api" session="old" projectId="p" canCreate author="Member"/>);request.mockResolvedValueOnce({documents:[{...initial,title:'Current library title'}],nextOffset:null});view.rerender(<DocumentWorkspace apiBase="/api" session="current" projectId="p" canCreate author="Member"/>);await screen.findByText('Current library title')
  await act(async()=>{if(outcome==='failure')old.reject(new DocumentRequestError('Unauthorized'));else old.resolve({documents:[{...initial,title:'Stale library title'}],nextOffset:50})});expect(screen.getByText('Current library title')).toBeInTheDocument();expect(screen.queryByText('Stale library title')).not.toBeInTheDocument();expect(screen.queryByText('Load more documents')).not.toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('does not let an old library completion stop the current session loading indicator',async()=>{
  const old=deferred(),current=deferred();request.mockImplementationOnce(()=>old.promise);const view=render(<DocumentWorkspace apiBase="/api" session="old" projectId="p" canCreate author="Member"/>);request.mockImplementationOnce(()=>current.promise);view.rerender(<DocumentWorkspace apiBase="/api" session="current" projectId="p" canCreate author="Member"/>);await act(async()=>old.resolve({documents:[initial],nextOffset:null}));expect(screen.getByRole('status',{name:'Loading documents'})).toBeInTheDocument();expect(screen.queryByText('Proposal')).not.toBeInTheDocument();await act(async()=>current.resolve({documents:[{...initial,title:'Current library title'}],nextOffset:null}));await screen.findByText('Current library title');expect(screen.queryByRole('status',{name:'Loading documents'})).not.toBeInTheDocument()
})

it.each(['success','failure'])('ignores a stale document-open %s after the replacement session is denied',async outcome=>{
  memory([initial]);const props={apiBase:'/api',projectId:'p',canCreate:true,author:'Member',userId:id},view=render(<DocumentWorkspace {...props} session="old"/>);await screen.findByText('Proposal');const old=deferred();request.mockImplementationOnce(()=>old.promise);fireEvent.click(screen.getByText('Proposal'))
  request.mockRejectedValueOnce(new DocumentRequestError('Unauthorized')).mockRejectedValueOnce(new DocumentRequestError('Unauthorized'));view.rerender(<DocumentWorkspace {...props} session="current"/>);await screen.findByRole('alert');await act(async()=>{if(outcome==='success')old.resolve({document:{...initial,title:'Stale private title',body:'Stale private body'},feedback:[],nextOffset:null});else old.reject(new DocumentRequestError('forbidden'))})
  expect(screen.queryByText('Stale private title')).not.toBeInTheDocument();expect(screen.queryByText('Stale private body')).not.toBeInTheDocument();expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('Could not complete')
})
it.each(['mutation','list','read'].flatMap(phase=>['success','failure'].map(outcome=>[phase,outcome])))('ignores stale %s follow-up %s and stops the old mutation chain',async(phase,outcome)=>{
  memory([initial]);const props={apiBase:'/api',projectId:'p',canCreate:true,author:'Member',userId:id},view=render(<DocumentWorkspace {...props} session="old"/>);fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Sharing'));const old=deferred(),before=request.mock.calls.length
  if(phase!=='mutation')request.mockResolvedValueOnce({id,version:1});if(phase==='read')request.mockResolvedValueOnce({documents:[initial],nextOffset:null});request.mockImplementationOnce(()=>old.promise);fireEvent.click(screen.getByText('Save access'));await waitFor(()=>expect(request.mock.calls.length).toBe(before+(phase==='mutation'?1:phase==='list'?2:3)))
  request.mockRejectedValueOnce(new DocumentRequestError('Unauthorized')).mockRejectedValueOnce(new DocumentRequestError('Unauthorized'));view.rerender(<DocumentWorkspace {...props} session="current"/>);await screen.findByRole('heading',{name:'Document unavailable'});const oldCalls=request.mock.calls.filter(c=>c[1]==='old').length
  await act(async()=>{if(outcome==='failure')old.reject(new DocumentRequestError('forbidden'));else old.resolve(phase==='mutation'?{id,version:1}:phase==='list'?{documents:[initial],nextOffset:null}:{document:{...initial,body:'Stale secret'},feedback:[],nextOffset:null})})
  expect(request.mock.calls.filter(c=>c[1]==='old')).toHaveLength(oldCalls);expect(screen.getByRole('heading',{name:'Document unavailable'})).toBeInTheDocument();expect(screen.queryByText('Stale secret')).not.toBeInTheDocument();expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument();expect(screen.queryByText('Save access')).not.toBeInTheDocument()
})
it.each(['documents','feedback'].flatMap(kind=>['success','failure'].map(outcome=>[kind,outcome])))('ignores stale %s pagination %s after current access denial',async(kind,outcome)=>{
  const state=memory([{...initial,publishedRevision:1}]);state.feedback([comment]);request.mockResolvedValueOnce({documents:[initial],nextOffset:50});const props={apiBase:'/api',projectId:'p',canCreate:true,author:'Member',userId:id},view=render(<DocumentWorkspace {...props} session="old"/>);await screen.findByText('Proposal');request.mockResolvedValueOnce({document:{...initial,publishedRevision:1},feedback:[comment],nextOffset:50});fireEvent.click(screen.getByText('Proposal'));await screen.findByLabelText('Markdown');if(kind==='feedback'){fireEvent.click(screen.getByText('Feedback'));await waitForPublication()};await waitForPublication();const old=deferred();request.mockImplementationOnce(()=>old.promise);fireEvent.click(screen.getByText(kind==='feedback'?'Load more feedback':'Load more documents'))
  request.mockRejectedValueOnce(new DocumentRequestError('Unauthorized')).mockRejectedValueOnce(new DocumentRequestError('Unauthorized'));view.rerender(<DocumentWorkspace {...props} session="current"/>);await screen.findByRole('heading',{name:'Document unavailable'});await act(async()=>{if(outcome==='failure')old.reject(new DocumentRequestError('forbidden'));else old.resolve({document:{...initial,body:'Stale secret'},documents:[{...initial,title:'Stale library'}],feedback:[{...comment,body:'Stale feedback'}],nextOffset:null})})
  expect(screen.queryByText('Stale secret')).not.toBeInTheDocument();expect(screen.queryByText('Stale library')).not.toBeInTheDocument();expect(screen.queryByText('Stale feedback')).not.toBeInTheDocument();expect(screen.getByRole('heading',{name:'Document unavailable'})).toBeInTheDocument()
})
it.each(['mutation','confirmation'].flatMap(phase=>['success','failure'].map(outcome=>[phase,outcome])))('ignores stale comment %s %s without restoring protected content',async(phase,outcome)=>{
  memory([{...initial,publishedRevision:1}]);const props={apiBase:'/api',projectId:'p',canCreate:true,author:'Member',userId:id},view=render(<DocumentWorkspace {...props} session="old"/>);fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication();fireEvent.change(feedbackField(),{target:{value:'My pending comment'}});const old=deferred(),before=request.mock.calls.length;if(phase==='confirmation')request.mockResolvedValueOnce({feedbackId:id});request.mockImplementationOnce(()=>old.promise);fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(request.mock.calls.length).toBe(before+(phase==='mutation'?1:2)))
  request.mockRejectedValueOnce(new DocumentRequestError('Unauthorized')).mockRejectedValueOnce(new DocumentRequestError('Unauthorized'));view.rerender(<DocumentWorkspace {...props} session="current"/>);await screen.findByRole('heading',{name:'Document unavailable'});if(phase==='mutation'&&outcome==='success')request.mockRejectedValueOnce(new DocumentRequestError('Unauthorized'))
  await act(async()=>{if(outcome==='failure')old.reject(new Error('Old session failed'));else old.resolve(phase==='mutation'?{feedbackId:id}:{document:{...initial,body:'Stale private content'},feedback:[{...comment,body:'Stale conversation'}],nextOffset:null})});expect(screen.getByRole('heading',{name:'Document unavailable'})).toBeInTheDocument();expect(screen.queryByText('Stale private content')).not.toBeInTheDocument();expect(screen.queryByText('Stale conversation')).not.toBeInTheDocument();if(outcome==='failure')expect(feedbackField()).toHaveValue('My pending comment')
})
it('does not let a stale operation release a newer operation lock',async()=>{
  memory([initial]);const props={apiBase:'/api',projectId:'p',canCreate:true,author:'Member',userId:id},view=render(<DocumentWorkspace {...props} session="old"/>);await screen.findByText('Proposal');const old=deferred();request.mockImplementationOnce(()=>old.promise);fireEvent.click(screen.getByText('Proposal'));request.mockResolvedValueOnce({documents:[initial],nextOffset:null});view.rerender(<DocumentWorkspace {...props} session="current"/>);await waitFor(()=>expect(screen.getByRole('button',{name:/^Proposal/})).toBeEnabled());const current=deferred();request.mockImplementationOnce(()=>current.promise);fireEvent.click(screen.getByText('Proposal'));await act(async()=>old.resolve({document:initial,feedback:[],nextOffset:null}));expect(screen.getByRole('button',{name:/^Proposal/})).toBeDisabled();expect(screen.getByLabelText('New document')).toBeDisabled();await act(async()=>current.resolve({document:{...initial,body:'Current authorized draft'},feedback:[],nextOffset:null}));expect(screen.getByLabelText('Markdown')).toHaveValue('Current authorized draft')
})

it.each(['Edit','Preview','History','Sharing','Feedback'])('revalidates an open %s after a successful guest session refresh',async tab=>{
  memory([{...initial,accessMode:'project',body:'Saved private draft',publishedRevision:1}]);const props={apiBase:'/api',projectId:'p',canCreate:true,author:'Member',userId:id},view=render(<DocumentWorkspace {...props} session="old"/>);fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');if(tab!=='Edit')fireEvent.click(screen.getByRole('button',{name:tab}));if(tab==='History')await screen.findByText(/Revision 1/)
  const fresh=deferred(),guest={...initial,accessMode:'project' as const,title:'Published title',body:'Published content only',canEdit:false,canPublish:false,canManage:false,canComment:false,publishedRevision:1};request.mockResolvedValueOnce({documents:[guest],nextOffset:null}).mockImplementationOnce(()=>fresh.promise);view.rerender(<DocumentWorkspace {...props} session="guest-token"/>);expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument();expect(screen.queryByText('Saved private draft')).not.toBeInTheDocument();expect(screen.queryByText('Save access')).not.toBeInTheDocument()
  await act(async()=>fresh.resolve({document:guest,feedback:[comment],nextOffset:null}));await screen.findByRole('heading',{name:'Published title'});expect(screen.queryByText('Saved private draft')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Edit'})).not.toBeInTheDocument();expect(screen.queryByText('Save draft')).not.toBeInTheDocument();expect(screen.queryByText('Publish revision')).not.toBeInTheDocument();if(tab!=='Feedback')expect(screen.getByText('Published content only')).toBeInTheDocument();else expect(screen.queryByRole('button',{name:'Open CRRT menu'})).not.toBeInTheDocument()
})
it('preserves genuinely unsaved edits through guest revalidation without keeping the saved private draft',async()=>{
  memory([{...initial,body:'Saved private draft',publishedRevision:1}]);const props={apiBase:'/api',projectId:'p',canCreate:true,author:'Member',userId:id},view=render(<DocumentWorkspace {...props} session="old"/>);fireEvent.click(await screen.findByText('Proposal'));const input=await screen.findByLabelText('Markdown');fireEvent.change(input,{target:{value:'My unsaved text'}})
  const guest={...initial,body:'Published only',canEdit:false,canPublish:false,canManage:false,canComment:false,publishedRevision:1};request.mockResolvedValueOnce({documents:[guest],nextOffset:null}).mockResolvedValueOnce({document:guest,feedback:[],nextOffset:null});view.rerender(<DocumentWorkspace {...props} session="guest"/>);await waitFor(()=>expect(input).toBeEnabled());expect(screen.getByLabelText('Markdown')).toBe(input);expect(input).toHaveValue('My unsaved text');expect(input).toHaveProperty('readOnly',true);expect(screen.queryByText('Saved private draft')).not.toBeInTheDocument();expect(screen.queryByText('Save draft')).not.toBeInTheDocument();fireEvent.click(screen.getByText('Discard changes'));expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument();expect(screen.getByText('Published only')).toBeInTheDocument()
})
it.each(['success','failure'])('ignores a stale automatic document revalidation %s',async outcome=>{
  memory([initial]);const props={apiBase:'/api',projectId:'p',canCreate:true,author:'Member',userId:id},view=render(<DocumentWorkspace {...props} session="old"/>);fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');const stale=deferred();request.mockResolvedValueOnce({documents:[initial],nextOffset:null}).mockImplementationOnce(()=>stale.promise);view.rerender(<DocumentWorkspace {...props} session="middle"/>);request.mockResolvedValueOnce({documents:[initial],nextOffset:null}).mockResolvedValueOnce({document:{...initial,body:'Current verified content'},feedback:[],nextOffset:null});view.rerender(<DocumentWorkspace {...props} session="current"/>);await waitFor(()=>expect(screen.getByLabelText('Markdown')).toHaveValue('Current verified content'));await act(async()=>{if(outcome==='failure')stale.reject(new DocumentRequestError('Unauthorized'));else stale.resolve({document:{...initial,body:'Stale content'},feedback:[],nextOffset:null})});expect(screen.getByLabelText('Markdown')).toHaveValue('Current verified content');expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('reloads every loaded feedback page when reviewing a later-page thread',async()=>{
  const state=memory([{...initial,publishedRevision:1}]);state.feedback([comment]);const view=workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');request.mockResolvedValueOnce({document:{...initial,publishedRevision:1},feedback:[comment],nextOffset:50});fireEvent.click(screen.getByText('Reload latest'));await waitFor(()=>expect(screen.getByLabelText('Markdown')).toBeEnabled());fireEvent.click(screen.getByText('Feedback'));await waitForPublication();const older={...comment,id:'44444444-4444-4444-8444-444444444444',body:'Later thread'};request.mockResolvedValueOnce({document:{...initial,publishedRevision:1},feedback:[older],nextOffset:null});fireEvent.click(screen.getByText('Load more feedback'));await screen.findByText('Later thread')
  request.mockResolvedValueOnce({id}).mockResolvedValueOnce({documents:[initial],nextOffset:null}).mockResolvedValueOnce({document:{...initial,publishedRevision:1},feedback:[comment],nextOffset:50}).mockResolvedValueOnce({document:{...initial,publishedRevision:1},feedback:[{...older,review_status:'accepted'}],nextOffset:null});fireEvent.click(screen.getAllByText('Accept')[1]);await screen.findByText('Changes saved.');expect(screen.getByText('Later thread')).toBeInTheDocument();expect(screen.getByText('accepted')).toBeInTheDocument();expect(screen.queryByText('Load more feedback')).not.toBeInTheDocument();expect(request).toHaveBeenCalledWith('/api','s',{action:'read',id,offset:50});view.unmount()
})

it('opens an empty conversation when optional feedback fields are absent',async()=>{
  memory([initial]);workspace();await screen.findByText('Proposal');request.mockResolvedValueOnce({document:initial});fireEvent.click(screen.getByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication();expect(screen.getByText('No comments yet')).toBeInTheDocument();expect(screen.queryByText('Load more feedback')).not.toBeInTheDocument()
})

it.each(['Feedback','History','Preview','Sharing'])('opens a newly created document in Edit after starting from %s',async tab=>{
  memory([{...initial,publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByRole('button',{name:tab}));if(tab==='History')await screen.findByText(/Revision 1/)
  fireEvent.click(screen.getByLabelText('New document'));fireEvent.change(screen.getByLabelText('Document title'),{target:{value:'New draft'}});fireEvent.click(screen.getByText('Create draft'));const input=await screen.findByLabelText('Markdown');expect(screen.getByLabelText('Title')).toHaveValue('New draft');expect(screen.getByRole('button',{name:'Edit'})).toHaveAttribute('aria-pressed','true');fireEvent.change(input,{target:{value:'My new document text'}});expect(input).toHaveValue('My new document text')
})

it('offers only document assignment destinations allowed by project membership',()=>{
  const action=vi.fn().mockResolvedValue(true),destinations=[
    {publicKey:'owned',name:'Owned project',role:'owner' as const},
    {publicKey:'admin',name:'Admin project',role:'admin' as const},
    {publicKey:'member',name:'Member project',role:'member' as const},
    {publicKey:'guest',name:'Guest project',role:'guest' as const},
    {publicKey:'unknown',name:'Unknown permissions'},
  ]
  render(<DocumentSharing document={{...initial,projectId:null}} disabled={false} onAction={action} projects={destinations}/>)
  const picker=screen.getByLabelText('Project (optional)')
  expect([...picker.querySelectorAll('option')].map(option=>option.textContent)).toEqual(['No project','Owned project','Admin project','Member project'])
  expect(screen.getByRole('button',{name:'Save project'})).toBeDisabled()
  fireEvent.submit(picker.closest('form')!);expect(action).not.toHaveBeenCalled()
  for(const projectId of ['owned','admin','member']){
    fireEvent.change(picker,{target:{value:projectId}});fireEvent.click(screen.getByRole('button',{name:'Save project'}))
    expect(action).toHaveBeenLastCalledWith('assign',{projectId,userRequested:true})
  }
})
it('blocks a previously selected assignment destination after project permissions change',()=>{
  const action=vi.fn().mockResolvedValue(true),props={document:{...initial,projectId:null},disabled:false,onAction:action},view=render(<DocumentSharing {...props} projects={[{publicKey:'target',name:'Target project',role:'member'}]}/>),picker=screen.getByLabelText('Project (optional)')
  fireEvent.change(picker,{target:{value:'target'}})
  view.rerender(<DocumentSharing {...props} projects={[{publicKey:'target',name:'Target project',role:'guest'}]}/>)
  expect(picker).toHaveValue('target');expect(screen.getByRole('option',{name:'Target project'})).toBeDisabled();expect(screen.getByRole('button',{name:'Save project'})).toBeDisabled()
  fireEvent.submit(picker.closest('form')!);expect(action).not.toHaveBeenCalled()
  view.rerender(<DocumentSharing {...props} projects={[]}/>)
  expect(screen.getByRole('option',{name:'Project unavailable'})).toBeDisabled();expect(picker).toHaveValue('target')
  fireEvent.change(picker,{target:{value:''}});fireEvent.submit(picker.closest('form')!);expect(action).not.toHaveBeenCalled()
})
it.each(['busy','archived'] as const)('does not submit a project assignment while %s',state=>{
  const action=vi.fn().mockResolvedValue(true),props={document:{...initial,projectId:null},disabled:false,onAction:action,projects:[{publicKey:'target',name:'Target project',role:'admin' as const}]},view=render(<DocumentSharing {...props}/>),picker=screen.getByLabelText('Project (optional)')
  fireEvent.change(picker,{target:{value:'target'}})
  view.rerender(<DocumentSharing {...props} document={{...props.document,archived:state==='archived'}} disabled={state==='busy'}/>)
  fireEvent.submit(picker.closest('form')!);expect(action).not.toHaveBeenCalled()
})
it('passes project roles from the workspace project list into the document assignment picker',async()=>{
  memory([{...initial,projectId:null}]);vi.mocked(useProjects).mockReturnValue({projects:[{publicKey:'member',name:'Editable destination',role:'member'},{publicKey:'guest',name:'Read-only destination',role:'guest'}],loading:false,error:null} as never)
  render(<DocumentsPage apiBase="/api" session="s" author="Me"/>)
  fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Sharing'))
  const picker=screen.getByLabelText('Project (optional)')
  expect([...picker.querySelectorAll('option')].map(option=>option.textContent)).toEqual(['No project','Editable destination'])
  fireEvent.change(picker,{target:{value:'member'}});fireEvent.click(screen.getByRole('button',{name:'Save project'}))
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/api','s',expect.objectContaining({action:'assign',projectId:'member'})))
})

it('defaults to all documents, groups projects, and separates my documents from project browsing',async()=>{
  memory([initial]);vi.mocked(useProjects).mockReturnValue({projects:[{publicKey:'p',name:'Team',role:'member'},{publicKey:'all',name:'Read-only project',role:'guest'}],loading:false,error:null} as never)
  render(<DocumentsPage apiBase="/api" session="s" author="Me"/>)
  const picker=await screen.findByLabelText('View');expect(picker).toHaveValue('all')
  expect([...picker.querySelectorAll('option')].map(option=>option.textContent)).toEqual(['All documents','My documents','Team','Read-only project'])
  expect(screen.getByRole('group',{name:'Projects'}).querySelectorAll('option')).toHaveLength(2)
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/api','s',{action:'list',projectId:null,scope:'all'}))
  fireEvent.change(picker,{target:{value:'mine'}})
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/api','s',{action:'list',projectId:null,scope:'mine'}))
  fireEvent.change(picker,{target:{value:'project:all'}})
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/api','s',{action:'list',projectId:'all'}))
  expect(picker).toHaveValue('project:all');expect(screen.queryByLabelText('New document')).not.toBeInTheDocument()
})
it.each(['all','mine'] as const)('keeps %s scope through pagination and creates documents without a project',async scope=>{
  memory();vi.mocked(useProjects).mockReturnValue({projects:[],loading:false,error:null} as never)
  request.mockResolvedValueOnce({documents:[],nextOffset:50})
  render(<DocumentsPage apiBase="/api" session="s" author="Me"/>);const picker=await screen.findByLabelText('View')
  if(scope==='mine'){request.mockResolvedValueOnce({documents:[],nextOffset:50});fireEvent.change(picker,{target:{value:'mine'}})}
  await screen.findByText('Load more documents');fireEvent.click(screen.getByText('Load more documents'))
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/api','s',{action:'list',projectId:null,scope,offset:50}))
  fireEvent.click(screen.getByLabelText('New document'));fireEvent.change(screen.getByLabelText('Document title'),{target:{value:'My new draft'}});fireEvent.click(screen.getByText('Create draft'))
  await screen.findByLabelText('Markdown')
  expect(request).toHaveBeenCalledWith('/api','s',expect.objectContaining({action:'create',projectId:null,title:'My new draft'}))
  expect(picker).toHaveValue(scope);expect(request.mock.calls.filter(call=>(call[2] as any).action==='list').slice(-1)[0][2]).toEqual({action:'list',projectId:null,scope})
})
it.each(['?view=mine','?project=p'])('opens an explicit document view from the URL %s',async query=>{
  const previous=window.location.href;window.history.replaceState({},'',query)
  memory();vi.mocked(useProjects).mockReturnValue({projects:[{publicKey:'p',name:'Project',role:'member'}],loading:false,error:null} as never)
  render(<DocumentsPage apiBase="/api" session="s" author="Me"/>);expect(await screen.findByLabelText('View')).toHaveValue(query==='?view=mine'?'mine':'project:p')
  window.history.replaceState({},'',previous)
})

it('recovers an older personal draft under My documents without losing its text',async()=>{
  memory([initial]);vi.mocked(useProjects).mockReturnValue({projects:[],loading:false,error:null} as never)
  function LegacyRecovery(){
    const recovery=useDocumentRecovery('owner'),[ready,setReady]=useState(false)
    useEffect(()=>{recovery.update({projectId:null,documentId:id,tab:'Edit'},{editor:{title:'Legacy draft',body:'My unsaved legacy text'}});setReady(true)},[recovery])
    return ready?<DocumentsPage apiBase="/api" session="s" author="Me" userId="owner"/>:null
  }
  render(<DocumentRecoveryProvider><LegacyRecovery/></DocumentRecoveryProvider>)
  expect(await screen.findByLabelText('View')).toHaveValue('mine')
  await waitFor(()=>expect(screen.getByLabelText('Markdown')).toHaveValue('My unsaved legacy text'))
})

it('renders the published body with the widget and sends feedback on its actual selected passage',async()=>{
  memory([{...initial,body:'Private unpublished draft',publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown')
  fireEvent.click(screen.getByText('Feedback'));await waitForPublication()
  expect(document.querySelector('.document-prose')).toHaveTextContent('Original');expect(screen.queryByText('Private unpublished draft')).not.toBeInTheDocument()
  const paragraph=document.querySelector('.document-prose p')!,range=document.createRange();range.selectNodeContents(paragraph)
  paragraph.getBoundingClientRect=()=>({left:100,top:200,width:400,height:100} as DOMRect)
  Object.defineProperty(range,'getClientRects',{value:()=>[{left:120,top:220,width:80,height:20}]})
  Object.defineProperty(range,'getBoundingClientRect',{value:()=>({left:120,top:220,width:80,height:20})})
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);fireEvent.mouseUp(paragraph)
  fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'A note on the published passage'}});fireEvent.click(screen.getByRole('button',{name:'Add feedback'}))
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/api','s',expect.objectContaining({action:'comment',quote:'Original',revision:1,target:expect.objectContaining({selector:'.document-prose > p:nth-of-type(1)',elementX:.15,elementY:.3})})))
  window.getSelection()!.removeAllRanges()
})

it('reports a failed publication read and can retry through the normal document reload',async()=>{
  memory([{...initial,publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown')
  request.mockRejectedValueOnce(new Error('Offline'));fireEvent.click(screen.getByText('Feedback'));await screen.findByRole('alert')
  expect(document.querySelector('.document-prose')).toBeNull()
  fireEvent.click(screen.getByText('Reload latest'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication()
  expect(document.querySelector('.document-prose')).toHaveTextContent('Original')
})
it.each(['success','failure'] as const)('ignores a late published-body %s after leaving Feedback',async outcome=>{
  memory([{...initial,body:'Private draft',publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown')
  const publication=deferred();request.mockImplementationOnce(()=>publication.promise);fireEvent.click(screen.getByText('Feedback'));expect(screen.getByLabelText('Loading published document')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Preview'));expect(screen.getByText('Private draft')).toBeInTheDocument()
  await act(async()=>{if(outcome==='success')publication.resolve({revision:{...revision,body:'Obsolete publication'}});else publication.reject(new Error('Late failure'))})
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.queryByText('Obsolete publication')).not.toBeInTheDocument();expect(screen.getByText('Private draft')).toBeInTheDocument()
})
function selectPublication(element:Element,end=element.textContent!.length){
  element.getBoundingClientRect=()=>({left:100,top:200,width:400,height:100} as DOMRect)
  const range=document.createRange();range.setStart(element.firstChild!,0);range.setEnd(element.firstChild!,end)
  Object.defineProperty(range,'getClientRects',{value:()=>[{left:120,top:220,width:80,height:20}]});Object.defineProperty(range,'getBoundingClientRect',{value:()=>({left:120,top:220,width:80,height:20})})
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);fireEvent.mouseUp(element)
}
it('freezes the quoted passage and pin target while retrying an uncertain feedback submission',async()=>{
  memory([{...initial,publishedRevision:1}]);workspace();fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication()
  selectPublication(document.querySelector('.document-prose p')!);fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'One quoted note'}})
  request.mockRejectedValueOnce(new Error('Connection lost'));fireEvent.click(screen.getByRole('button',{name:'Add feedback'}));await screen.findAllByRole('alert')
  const first=request.mock.calls.find(call=>(call[2] as any).action==='comment')![2] as any
  selectPublication(document.querySelector('.document-prose p')!,4)
  request.mockResolvedValueOnce({feedbackId:comment.id}).mockResolvedValueOnce({document:{...initial,publishedRevision:1},feedback:[{...comment,body:'One quoted note'}],nextOffset:null})
  fireEvent.click(screen.getByRole('button',{name:'Add feedback'}));await waitFor(()=>expect(screen.queryByLabelText('Leave feedback')).not.toBeInTheDocument())
  const posts=request.mock.calls.filter(call=>(call[2] as any).action==='comment');expect(posts).toHaveLength(2);expect(posts[1][2]).toMatchObject({key:first.key,quote:'Original',target:first.target})
  window.getSelection()!.removeAllRanges()
})
it.each(['unchanged','changed'] as const)('revalidates a selected passage against a newer %s publication',async mode=>{
  memory([{...initial,publishedRevision:1}]);const props={apiBase:'/api',projectId:'p',canCreate:true,author:'Member',userId:id},view=render(<DocumentWorkspace {...props} session="old"/>)
  fireEvent.click(await screen.findByText('Proposal'));await screen.findByLabelText('Markdown');fireEvent.click(screen.getByText('Feedback'));await waitForPublication()
  selectPublication(document.querySelector('.document-prose p')!);fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Feedback through publication'}})
  const nextDocument={...initial,publishedRevision:2},body=mode==='changed'?'Replacement passage':'Original'
  request.mockResolvedValueOnce({documents:[nextDocument],nextOffset:null}).mockResolvedValueOnce({document:nextDocument,feedback:[],nextOffset:null}).mockResolvedValueOnce({revision:{...revision,number:2,body}})
  view.rerender(<DocumentWorkspace {...props} session="renewed"/>);await waitForPublication();await waitFor(()=>expect(document.querySelector('.document-prose')).toHaveTextContent(body))
  if(mode==='unchanged')request.mockResolvedValueOnce({feedbackId:comment.id}).mockResolvedValueOnce({document:nextDocument,feedback:[{...comment,body:'Feedback through publication'}],nextOffset:null})
  fireEvent.click(screen.getByRole('button',{name:'Add feedback'}))
  if(mode==='changed'){await screen.findByText(/Select the passage again/);expect(request.mock.calls.filter(call=>(call[2] as any).action==='comment')).toHaveLength(0);expect(screen.getByLabelText('Leave feedback')).toHaveValue('Feedback through publication')}
  else await waitFor(()=>expect(request).toHaveBeenCalledWith('/api','renewed',expect.objectContaining({action:'comment',revision:2,quote:'Original'})))
  window.getSelection()!.removeAllRanges()
})
