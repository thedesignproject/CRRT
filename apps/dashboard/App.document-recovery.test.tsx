// @vitest-environment jsdom
import { feedbackField, replyField, nameField, openNote, waitForPublication } from '../../src/__tests__/conversationInteractions'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import type { DocumentComment, DocumentView } from '../../shared/documents'
const auth = vi.hoisted(() => ({ session: { access_token: 'a' } as { access_token: string } | null, user: { id: 'a', email: 'a@test.local' } as { id: string; email: string } | null, loading: false, signOut: vi.fn() }))
vi.mock('./hooks/useAuth',()=>({useAuth:()=>auth}))
vi.mock('./hooks/useProjects',()=>({useProjects:()=>({projects:[{publicKey:'p',name:'Project',role:'member'}],loading:false,error:null})}))
vi.mock('./lib/supabase',()=>({supabase:{}}))
vi.mock('./components/LoginPage',()=>({LoginPage:({continuationPath}:{continuationPath?:string})=><div>Sign in {continuationPath}</div>}))
vi.mock('./documents/client',async original=>({...await original<object>(),documentRequest:vi.fn()}))
import { documentRequest, DocumentRequestError } from './documents/client'
import { App } from './App'
import { route } from './lib/routes'

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
const base:DocumentView={id:a,projectId:'p',accessMode:'private',title:'A saved title',body:'A saved body',version:1,publishedRevision:1,shareKey:a,sharing:false,passwordProtected:false,archived:false,updatedAt:'2026-11-10',canEdit:true,canPublish:true,canManage:true,canComment:true}
const root:DocumentComment={id:'33333333-3333-4333-8333-333333333333',document_id:a,revision:1,parent_id:null,quote:'',prefix:'',suffix:'',body:'Server feedback',author:'Reviewer',review_status:'open',implementation_status:'unassigned',claimed_by:null,version:1,created_at:'2026-11-10'}
const request=vi.mocked(documentRequest)
let docs:Record<string,DocumentView>,comments:DocumentComment[],posted:Map<string,string>,blocked:boolean
const service=async(_api:string,session:string|null,raw:object,_signal?:AbortSignal)=>{
  const input=raw as Record<string,unknown>,owner=session?.startsWith('a')?'a':'b',document=docs[owner]
  if(input.action==='list')return {documents:blocked?[]:[document],nextOffset:null}
  if(input.action==='revision')return {revision:{number:1,title:'Published',body:'Published body',summary:'Initial',actor_id:'a',agent_id:null,created_at:'2026-11-06'}}
  if(blocked||input.id!==document.id)throw new DocumentRequestError('forbidden')
  if(input.action==='read')return {document:{...document},feedback:[...comments],nextOffset:null}
  if(input.action==='comment'){
    const key=input.key as string
    if(!posted.has(key)){const id=crypto.randomUUID();posted.set(key,id);comments.push({...root,id,parent_id:input.parentId as string??null,body:input.body as string,author:input.author as string})}
    return {feedbackId:posted.get(key)}
  }
  throw new Error('Unexpected request')
}
beforeEach(()=>{auth.session={access_token:'a'};auth.user={id:'a',email:'a@test.local'};auth.loading=false;docs={a:{...base},b:{...base,id:b,title:'B saved title',body:'B saved body',shareKey:b}};comments=[root];posted=new Map();blocked=false;request.mockReset().mockImplementation(service);window.history.replaceState({},'',route('/documents'))})
afterEach(()=>vi.useRealTimers())
function account(view:ReturnType<typeof render>,user:'a'|'b'|null){auth.session=user?{access_token:user+'-new'}:null;auth.user=user?{id:user,email:user+'@test.local'}:null;view.rerender(<App/>)}
async function open(){fireEvent.click(await screen.findByText('A saved title'));return screen.findByLabelText('Markdown')}
function deferred(){let resolve!:(v:object)=>void,reject!:(e:Error)=>void;return {promise:new Promise<object>((a,b)=>{resolve=a;reject=b}),resolve:(v:object)=>resolve(v),reject:(e:Error)=>reject(e)}}

it('keeps editor drafts isolated by account and discards them when the App is closed',async()=>{
  const storage=vi.spyOn(Storage.prototype,'setItem'),view=render(<App/>);const input=await open();fireEvent.change(input,{target:{value:'Only A unsaved text'}});account(view,null);expect(screen.getByText(/Sign in/)).toHaveTextContent('/documents');expect(screen.queryByDisplayValue('Only A unsaved text')).not.toBeInTheDocument();expect(screen.queryByText('A saved body')).not.toBeInTheDocument()
  account(view,'b');fireEvent.click(await screen.findByText('B saved title'));const other=await screen.findByLabelText('Markdown');expect(other).toHaveValue('B saved body');fireEvent.change(other,{target:{value:'Only B unsaved text'}});docs.a.body='A changed on the server';account(view,'a');await waitFor(()=>expect(screen.getByLabelText('Markdown')).toHaveValue('Only A unsaved text'));expect(screen.queryByDisplayValue('Only B unsaved text')).not.toBeInTheDocument();expect(screen.getByText('A changed on the server')).toBeInTheDocument();expect(screen.getByText(/Autosave paused/)).toBeInTheDocument();expect(request.mock.calls.filter(call=>(call[2] as any).action==='save')).toHaveLength(0)
  fireEvent.click(screen.getByText('Discard changes'));account(view,null);account(view,'a');await screen.findByText('A saved title');expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument();account(view,'b');await waitFor(()=>expect(screen.getByLabelText('Markdown')).toHaveValue('Only B unsaved text'))
  expect(storage.mock.calls.some(call=>String(call[1]).includes('unsaved text'))).toBe(false);view.unmount();render(<App/>);fireEvent.click(await screen.findByText('B saved title'));expect(await screen.findByLabelText('Markdown')).toHaveValue('B saved body');storage.mockRestore()
})
it('restores an unsent reply, its original parent context and selected project after sign-in',async()=>{
  const view=render(<App/>);fireEvent.change(await screen.findByLabelText('View'),{target:{value:'project:p'}});await open();fireEvent.click(screen.getByText('Feedback'));await waitForPublication();fireEvent.click(screen.getByText('Reply'));fireEvent.change(replyField(),{target:{value:'My unsent reply'}});account(view,null);expect(screen.queryByDisplayValue('My unsent reply')).not.toBeInTheDocument();account(view,'a');await waitFor(()=>expect(replyField()).toHaveValue('My unsent reply'));expect(screen.getByLabelText('View')).toHaveValue('project:p');expect(request).toHaveBeenCalledWith(expect.any(String),'a-new',{action:'read',id:a,feedbackId:root.id});fireEvent.click(screen.getByText('Send reply'));await waitFor(()=>expect(feedbackField()).toHaveValue(''));expect(posted.size).toBe(1);account(view,null);account(view,'a');await screen.findByText('A saved title');expect(screen.queryByLabelText('Reply')).not.toBeInTheDocument()
})
it.each(['editor','feedback'])('keeps only the local %s draft recoverable if access was revoked while signed out',async kind=>{
  const view=render(<App/>);await open();if(kind==='feedback'){fireEvent.click(screen.getByText('Feedback'));await waitForPublication()};await waitForPublication();fireEvent.change((kind==='editor'?screen.getByLabelText('Markdown'):feedbackField()),{target:{value:'My local recovery text'}});account(view,null);blocked=true;account(view,'a');const field=await screen.findByLabelText(kind==='editor'?'Recovered Markdown':'Recovered feedback');expect(field).toHaveValue('My local recovery text');expect(field).toHaveProperty('readOnly',true);expect(field).toBeEnabled();expect(screen.queryByText('A saved body')).not.toBeInTheDocument();expect(screen.queryByText('Server feedback')).not.toBeInTheDocument();fireEvent.click(screen.getByText('Discard recovered work'));expect(screen.queryByDisplayValue('My local recovery text')).not.toBeInTheDocument();account(view,null);account(view,'a');await screen.findByText('Create your first document and share it for review.');expect(screen.queryByLabelText('Recovered Markdown')).not.toBeInTheDocument()
})
it.each(['mutation','confirmation'])('retains the original comment retry identity after a lost %s response and sign-out',async phase=>{
  const view=render(<App/>);await open();fireEvent.click(screen.getByText('Feedback'));await waitForPublication();fireEvent.change(feedbackField(),{target:{value:'Only post once'}});const pending=deferred()
  if(phase==='mutation')request.mockImplementationOnce(async(...args)=>{await service(...args);return pending.promise as never});else request.mockImplementationOnce(service).mockImplementationOnce(()=>pending.promise as never)
  fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(posted.size).toBe(1));const original=request.mock.calls.find(call=>(call[2] as any).action==='comment')![2] as {key:string};account(view,null);await act(async()=>pending.reject(new Error('Lost response')));account(view,'a');await waitFor(()=>expect(feedbackField()).toHaveValue('Only post once'));await waitFor(()=>expect(screen.getByText('Add feedback')).toBeEnabled());fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(feedbackField()).toHaveValue(''));expect(posted.size).toBe(1);const attempts=request.mock.calls.filter(call=>(call[2] as any).action==='comment');expect(attempts).toHaveLength(phase==='mutation'?2:1);for(const attempt of attempts)expect(attempt[2]).toMatchObject({key:original.key})
})
it('does not let an old successful operation erase a replacement feedback draft',async()=>{
  const view=render(<App/>);await open();fireEvent.click(screen.getByText('Feedback'));await waitForPublication();fireEvent.change(feedbackField(),{target:{value:'Original operation'}});const pending=deferred();let result:object={};request.mockImplementationOnce(async(...args)=>{result=await service(...args);return pending.promise as never});fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(posted.size).toBe(1));account(view,null);account(view,'a');await waitFor(()=>expect(screen.getByText('Discard feedback')).toBeEnabled());fireEvent.click(screen.getByText('Discard feedback'));fireEvent.change(feedbackField(),{target:{value:'New unsent replacement'}});await act(async()=>pending.resolve(result));expect(feedbackField()).toHaveValue('New unsent replacement');account(view,null);account(view,'a');await waitFor(()=>expect(feedbackField()).toHaveValue('New unsent replacement'))
})

it.each(['all','mine'] as const)('restores the %s document view together with an unsaved editor draft',async scope=>{
  const view=render(<App/>);const picker=await screen.findByLabelText('View')
  if(scope==='mine')fireEvent.change(picker,{target:{value:'mine'}})
  await open();fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Keep the selected view'}})
  account(view,null);account(view,'a')
  await waitFor(()=>expect(screen.getByLabelText('Markdown')).toHaveValue('Keep the selected view'))
  expect(screen.getByLabelText('View')).toHaveValue(scope)
})

it('restores an unsent quoted selection and pin position after signing back into the same account',async()=>{
  const view=render(<App/>);await open();fireEvent.click(screen.getByText('Feedback'));await waitForPublication()
  const paragraph=document.querySelector('.document-prose p')!,range=document.createRange();range.selectNodeContents(paragraph)
  paragraph.getBoundingClientRect=()=>({left:100,top:200,width:400,height:100} as DOMRect)
  Object.defineProperty(range,'getClientRects',{value:()=>[{left:120,top:220,width:80,height:20}]});Object.defineProperty(range,'getBoundingClientRect',{value:()=>({left:120,top:220,width:80,height:20})})
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);fireEvent.mouseUp(paragraph)
  fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'My recovered quoted note'}})
  account(view,null);account(view,'a')
  await waitFor(()=>expect(screen.getByLabelText('Leave feedback')).toHaveValue('My recovered quoted note'));await waitForPublication();await waitFor(()=>expect(screen.getByRole('button',{name:'Add feedback'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'Add feedback'}))
  await waitFor(()=>expect(request).toHaveBeenCalledWith(expect.any(String),'a-new',expect.objectContaining({action:'comment',quote:'Published body',revision:1,target:expect.objectContaining({selector:'.document-prose > p:nth-of-type(1)',elementX:.15,elementY:.3})})))
  expect(posted.size).toBe(1);window.getSelection()!.removeAllRanges()
})
