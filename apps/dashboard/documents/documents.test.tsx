// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocumentBody, documentHtml, quoteMatches } from './DocumentBody'
import { DocumentThreads } from './DocumentThreads'
import { DocumentReader } from './DocumentReader'
import { documentRequest, documentMessage, DocumentRequestError } from './client'
import { documentRoute } from './DocumentRoute'
import type { DocumentComment, DocumentResult } from '../../../shared/documents'
vi.mock('../components/LoginPage',()=>({LoginPage:()=>null}))
const fetcher = vi.fn()
const id = '11111111-1111-4111-8111-111111111111'
const doc = { id,canComment:true,title:'Design proposal',body:'# Introduction\n\nA clear paragraph.',publishedRevision:2,passwordProtected:false }
const root = { id:'c',document_id:id,revision:1,parent_id:null,quote:'clear paragraph',prefix:'A ',suffix:'.',body:'Make this stronger',author:'Alice',review_status:'open',implementation_status:'unassigned',version:1,created_at:'2026-11-06T00:00:00Z' } as DocumentComment
const reply = { ...root,id:'r',parent_id:'c',body:'Agreed',author:'Bob' }
const response = (data:DocumentResult|object,ok=true) => Promise.resolve({ ok,json:async()=>data })
const page = (fields:object={}) => ({ document:doc,feedback:[],nextOffset:null,...fields })
beforeEach(()=>{vi.stubGlobal('fetch',fetcher);fetcher.mockReset(); Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;Range.prototype.getBoundingClientRect=()=>({width:0,height:0,left:0,top:0}) as DOMRect})
afterEach(()=>{vi.unstubAllGlobals();window.getSelection()?.removeAllRanges()})
it('renders Markdown and sanitizes executable HTML, external images, and inline styles',()=>{
  const html = documentHtml('# Heading\n\n**Bold** [unsafe](javascript:alert(1))\n\n<script>alert(1)</script><img src="https://tracker.test/pixel"><p style="color:red">Text</p><table background="https://tracker.test/background"><tr><td>Safe table</td></tr></table>\n\n| A | B |\n|---|---|\n| 1 | 2 |')
  expect(html).toContain('<h1>Heading</h1>');expect(html).toContain('<strong>Bold</strong>');expect(html).toContain('<table>')
  for(const unsafe of ['<script','<img','style=','background=','href="javascript:'])expect(html).not.toContain(unsafe)
})
it('reattaches only unique quotes with matching surrounding text',()=>{
  expect(quoteMatches(doc.body,root)).toBe(true)
  for(const change of [{quote:''},{quote:'missing'},{prefix:'wrong'},{suffix:'wrong'}])expect(quoteMatches(doc.body,{...root,...change})).toBe(false)
  expect(quoteMatches('same same',{quote:'same',prefix:'',suffix:''})).toBe(false)
  const repeated='First target passage.\n\nSecond target passage.'
  for(const prefix of ['First ','Second '])expect(quoteMatches(repeated,{quote:'target passage.',prefix,suffix:''})).toBe(true)
  expect(quoteMatches('target passage. First\n\ntarget passage. Second',{quote:'target passage.',prefix:'',suffix:' First'})).toBe(true)
  expect(quoteMatches('First target passage.\n\nFirst target passage.',{quote:'target passage.',prefix:'First ',suffix:''})).toBe(false)
})
it('captures text selections only inside document content and within the size limit',()=>{
  const onQuote=vi.fn(), view=render(<DocumentBody source="A clear paragraph." onQuote={onQuote}/>), prose=view.container.firstElementChild!
  fireEvent.mouseUp(prose);expect(onQuote).not.toHaveBeenCalled()
  const range=document.createRange();range.selectNodeContents(prose.querySelector('p')!);window.getSelection()!.addRange(range)
  fireEvent.mouseUp(prose);expect(onQuote).toHaveBeenCalledWith(expect.objectContaining({quote:'A clear paragraph.'}))
  window.getSelection()!.removeAllRanges();const outside=document.createRange();outside.selectNodeContents(document.body);window.getSelection()!.addRange(outside);fireEvent.keyUp(prose)
  expect(onQuote).toHaveBeenCalledTimes(1)
  window.getSelection()!.removeAllRanges();view.rerender(<DocumentBody source={'a'.repeat(2001)} onQuote={onQuote}/>);range.selectNodeContents(prose.querySelector('p')!);window.getSelection()!.addRange(range);fireEvent.mouseUp(prose);expect(onQuote).toHaveBeenCalledTimes(1)
  window.getSelection()!.removeAllRanges();view.rerender(<DocumentBody source=" "/>);fireEvent.mouseUp(prose)
  view.rerender(<DocumentBody source=" "/>);const blank=document.createRange();blank.selectNodeContents(prose);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(blank);fireEvent.mouseUp(prose)
})
it('shows empty feedback, posts comments, recovers failures, and clears selected passages',async()=>{
  const comment=vi.fn().mockRejectedValueOnce(new DocumentRequestError('forbidden')).mockResolvedValue(undefined), clear=vi.fn()
  render(<DocumentThreads feedback={[]} revision={2} source={doc.body} selection={root} onClearSelection={clear} onComment={comment}/> )
  expect(screen.getByText('Start the conversation')).toBeInTheDocument();fireEvent.click(screen.getByLabelText('Clear selected passage'));expect(clear).toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Reviewer'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Improve this'}})
  fireEvent.click(screen.getByText('Add feedback'));expect(await screen.findByRole('alert')).toHaveTextContent('permission')
  fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(screen.getByLabelText('Leave feedback')).toHaveValue(''))
})
it('shows threads, carries matching anchors, marks changed text, and supports replies and review',async()=>{
  const comment=vi.fn().mockResolvedValue(undefined), review=vi.fn(), clear=vi.fn()
  const view=render(<DocumentThreads feedback={[root,reply,{...root,id:'changed',quote:'missing',implementation_status:'ready_for_testing'}]} revision={2} source={doc.body} selection={root} onClearSelection={clear} onComment={comment} onReview={review} authorName="Me"/> )
  expect(screen.getByText('Carried from revision 1')).toBeInTheDocument();expect(screen.getByText('Text changed since revision 1')).toBeInTheDocument();expect(screen.getByText('Agreed')).toBeInTheDocument()
  fireEvent.click(screen.getAllByText('Accept')[0]);fireEvent.click(screen.getAllByText('Reject')[0]);fireEvent.click(screen.getAllByText('Done')[0]);expect(review).toHaveBeenLastCalledWith(root,'accepted',true)
  fireEvent.click(screen.getAllByText('Reply')[0]);expect(screen.getByLabelText('Reply')).toHaveFocus();fireEvent.click(screen.getByLabelText('Cancel reply'))
  fireEvent.click(screen.getAllByText('Reply')[0]);fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'A reply'}});fireEvent.click(screen.getByText('Send reply'));await waitFor(()=>expect(comment).toHaveBeenCalledWith(expect.objectContaining({parentId:'c',quote:''})))
  view.rerender(<DocumentThreads feedback={[{...root,quote:'',revision:2,review_status:'accepted',implementation_status:'done'},{...root,id:'rejected',review_status:'rejected'}]} revision={2} source={doc.body} selection={{quote:'',prefix:'',suffix:''}} onClearSelection={clear} onComment={comment} onReview={review} authorName="Me"/> )
  expect(screen.queryByText('Carried from revision 1')).toBeInTheDocument()
})
it('loads a public document, submits feedback, and paginates the conversation',async()=>{
  fetcher.mockImplementationOnce(()=>response(page({document:{...doc,passwordProtected:true},feedback:[root],nextOffset:50})))
  render(<DocumentReader apiBase="/api" shareKey={id}/>);expect(screen.getByRole('status')).toBeInTheDocument();await screen.findByText('Design proposal')
  fetcher.mockImplementationOnce(()=>response(page({feedback:[reply]})));fireEvent.click(screen.getByText('Load more feedback'));expect(await screen.findByText('Agreed')).toBeInTheDocument()
  fetcher.mockImplementationOnce(()=>response({id,feedbackId:'new'})).mockImplementationOnce(()=>response(page({feedback:[{...reply,id:'new',body:'Thanks'}]})))
  fireEvent.click(screen.getByText('Reply'));fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'Thanks'}});fireEvent.click(screen.getByText('Send reply'))
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(4));expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({revision:1,parentId:'c'})
  await screen.findByText('Thanks');expect(screen.getByText('Agreed')).toBeInTheDocument()
  fetcher.mockImplementationOnce(()=>response({id})).mockImplementationOnce(()=>response(page()))
  fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'A new note'}});fireEvent.click(screen.getByText('Add feedback'))
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(6));expect(JSON.parse(fetcher.mock.calls[4][1].body).revision).toBe(2)
})
it('unlocks protected documents and recovers incorrect passwords',async()=>{
  fetcher.mockImplementationOnce(()=>response({error:'password_required'},false))
  render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('This document is protected')
  fetcher.mockImplementationOnce(()=>response({error:'incorrect_password'},false));fireEvent.change(screen.getByLabelText('Password'),{target:{value:'wrong'}});fireEvent.click(screen.getByText('Open document'));await screen.findByText('That password did not work. Try again.')
  fetcher.mockImplementationOnce(()=>response({accessToken:'grant'})).mockImplementationOnce(()=>response(page()))
  fireEvent.change(screen.getByLabelText('Password'),{target:{value:'correct'}});fireEvent.click(screen.getByText('Open document'));await screen.findByText('Design proposal')
  expect(JSON.parse(fetcher.mock.calls[3][1].body).accessToken).toBe('grant')
})
it('keeps pagination failures recoverable and retries unavailable documents',async()=>{
  fetcher.mockImplementationOnce(()=>response({error:'document_not_found'},false));const view=render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('Document unavailable')
  fetcher.mockImplementationOnce(()=>response(page({nextOffset:50})));fireEvent.click(screen.getByText('Try again'));await screen.findByText('Design proposal')
  fetcher.mockRejectedValueOnce(new Error('offline'));fireEvent.click(screen.getByText('Load more feedback'));expect(await screen.findByRole('alert')).toHaveTextContent('connection')
  view.unmount()
})
it('ignores resolved and rejected reads after unmount and matches only document routes',async()=>{
  for(const reject of [false,true]){
    let resolve!:(v:unknown)=>void,rejectCall!:(e:Error)=>void
    fetcher.mockImplementationOnce(()=>new Promise((a,b)=>{resolve=a;rejectCall=b}))
    const view=render(<DocumentReader apiBase="/api" shareKey={id}/>);view.unmount()
    await act(async()=>{if(reject)rejectCall(new Error());else resolve({ok:true,json:async()=>page()})})
  }
  expect(documentRoute(`/doc/${id}/login`,'/api')).not.toBeNull();expect(documentRoute('/not-a-document','/api')).toBeNull();expect(documentRoute(`/doc/${id}`,'/api')).not.toBeNull()
})
it('keeps bold selections attached to their surrounding paragraph',()=>{
  const capture=vi.fn(),source='First **same** word.\n\nSecond **same** word.',view=render(<DocumentBody source={source} onQuote={capture}/>),bold=view.container.querySelectorAll('strong')[1]
  const range=document.createRange();range.selectNodeContents(bold);window.getSelection()!.addRange(range);fireEvent.mouseUp(bold)
  const anchor=capture.mock.calls[0][0];expect(anchor.prefix).toContain('Second ');expect(quoteMatches(source,anchor)).toBe(true)
})
it('shows project guests the conversation without mutation controls',()=>{
  render(<DocumentThreads feedback={[root,reply]} revision={2} source={doc.body} selection={root} onClearSelection={vi.fn()} onComment={vi.fn()} readOnly/> )
  expect(screen.getByText('Agreed')).toBeInTheDocument();expect(screen.queryByText('Reply')).not.toBeInTheDocument();expect(screen.queryByText('Add feedback')).not.toBeInTheDocument();expect(screen.getByText('View-only access')).toBeInTheDocument()
})
it('preserves draft feedback during password reauthentication and reloads newer revisions',async()=>{
  fetcher.mockImplementationOnce(()=>response(page({feedback:[root]})));render(<DocumentReader apiBase="/api" shareKey={id}/>)
  await screen.findByText('Design proposal');fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Keep this note'}})
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true)
  fetcher.mockImplementationOnce(()=>response({error:'password_required'},false));fireEvent.click(screen.getByText('Add feedback'));await screen.findByRole('form',{name:'Unlock document'})
  expect(screen.getByLabelText('Leave feedback')).toHaveValue('Keep this note')
  fetcher.mockImplementationOnce(()=>response({accessToken:'new-grant'})).mockImplementationOnce(()=>response(page({document:{...doc,publishedRevision:3},feedback:[root]})))
  fireEvent.change(screen.getByLabelText('Password'),{target:{value:'new password'}});fireEvent.click(screen.getByText('Open document'));await screen.findByText('Revision 3')
  expect(screen.getByLabelText('Leave feedback')).toHaveValue('Keep this note')
  fetcher.mockImplementationOnce(()=>response({error:'revision_not_found'},false));fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Reload latest revision')
  fetcher.mockImplementationOnce(()=>response(page({document:{...doc,publishedRevision:4},feedback:[root]})));fireEvent.click(screen.getByText('Reload latest revision'));await screen.findByText('Revision 4');expect(screen.getByLabelText('Leave feedback')).toHaveValue('Keep this note')
  fetcher.mockImplementationOnce(()=>response({feedbackId:id})).mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'Keep this note'}]})))
  fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(screen.getByLabelText('Leave feedback')).toHaveValue(''));expect(screen.getByText('Keep this note')).toBeInTheDocument()
})
it('retries reading a posted comment without duplicating the mutation',async()=>{
  fetcher.mockImplementationOnce(()=>response(page()));render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('Design proposal')
  fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'One note'}})
  fetcher.mockImplementationOnce(()=>response({feedbackId:id})).mockRejectedValueOnce(new Error('offline'));fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Reload latest revision')
  fetcher.mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'One note'}]})));fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('One note')
  expect(fetcher.mock.calls.map(c=>JSON.parse(c[1].body).action).filter(a=>a==='comment')).toHaveLength(1)
})
it.each(['same','carried','changed'])('recovers selected feedback across publication: %s',async mode=>{
  fetcher.mockImplementationOnce(()=>response(page({nextOffset:50})));render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('Design proposal')
  const prose=document.querySelector('.document-prose')!,text=prose.querySelector('p')!.firstChild!,range=document.createRange();range.setStart(text,2);range.setEnd(text,7);window.getSelection()!.addRange(range);fireEvent.mouseUp(prose)
  fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Selected note'}})
  if(mode!=='same'){
    fetcher.mockImplementationOnce(()=>response({error:'revision_not_found'},false));fireEvent.click(screen.getByText('Load more feedback'));await screen.findByText('Reload latest revision')
    fetcher.mockImplementationOnce(()=>response(page({document:{...doc,publishedRevision:3,body:mode==='changed'?'Replaced passage.':doc.body}})));fireEvent.click(screen.getByText('Reload latest revision'));await screen.findByText('Revision 3')
  }
  if(mode==='changed'){fireEvent.click(screen.getByText('Add feedback'));await screen.findAllByText(/Select the passage again/);expect(screen.getByLabelText('Leave feedback')).toHaveValue('Selected note')}
  else{fetcher.mockImplementationOnce(()=>response({feedbackId:id})).mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'Selected note'}]})));fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Selected note');expect(screen.getByLabelText('Leave feedback')).toHaveValue('')}
})
it.each(['post','read'])('reconciles a committed comment across publication after a lost %s response',async phase=>{
  fetcher.mockImplementationOnce(()=>response(page()));render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('Design proposal')
  fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Only once'}})
  if(phase==='read')fetcher.mockImplementationOnce(()=>response({feedbackId:id}));fetcher.mockRejectedValueOnce(new Error('Lost response'))
  fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Reload latest revision');const original=JSON.parse(fetcher.mock.calls[1][1].body)
  fetcher.mockImplementationOnce(()=>response(page({document:{...doc,publishedRevision:3},feedback:[{...root,id,body:'Only once'}]})));fireEvent.click(screen.getByText('Reload latest revision'));await screen.findByText('Revision 3')
  if(phase==='post')fetcher.mockImplementationOnce(()=>response({feedbackId:id}));fetcher.mockImplementationOnce(()=>response(page({document:{...doc,publishedRevision:3},feedback:[{...root,id,body:'Only once'}]})))
  fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(screen.getByLabelText('Leave feedback')).toHaveValue(''))
  const posts=fetcher.mock.calls.map(call=>JSON.parse(call[1].body)).filter(input=>input.action==='comment');expect(posts).toHaveLength(phase==='post'?2:1);for(const post of posts)expect(post).toMatchObject({key:original.key,revision:2})
  expect(screen.getAllByText('Only once')).toHaveLength(1)
})
it('locks feedback fields and context while sending and allows explicit draft discard',async()=>{
  let finish!:()=>void;const comment=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve})),clear=vi.fn(),pending=vi.fn()
  render(<DocumentThreads feedback={[root]} revision={2} source={doc.body} selection={root} onClearSelection={clear} onComment={comment} onPendingChange={pending}/> )
  fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Submitted snapshot'}});fireEvent.click(screen.getByText('Add feedback'))
  for(const field of ['Your name','Leave feedback','Clear selected passage'])expect(screen.getByLabelText(field)).toBeDisabled();expect(screen.getByText('Reply')).toBeDisabled();expect(screen.getByText('Discard feedback')).toBeDisabled()
  await act(async()=>finish());expect(screen.getByLabelText('Leave feedback')).toHaveValue('');expect(pending).toHaveBeenLastCalledWith(false)
  fireEvent.click(screen.getByText('Reply'));fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'Discard this'}});fireEvent.click(screen.getByText('Discard feedback'));expect(screen.getByLabelText('Leave feedback')).toHaveValue('');expect(clear).toHaveBeenCalled()
})
it.each(['post','read'])('discard abandons a lost %s operation before an identical new note',async phase=>{
  fetcher.mockImplementationOnce(()=>response(page()));render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('Design proposal')
  fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Identical note'}})
  if(phase==='read')fetcher.mockImplementationOnce(()=>response({feedbackId:id}));fetcher.mockRejectedValueOnce(new Error('Lost response'))
  fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Retry this feedback or discard it to start a new note.');expect(screen.getByLabelText('Leave feedback')).toBeDisabled();expect(screen.getByText('Add feedback')).toBeEnabled();expect(screen.getByText('Discard feedback')).toBeEnabled()
  const original=JSON.parse(fetcher.mock.calls[1][1].body);fireEvent.click(screen.getByText('Discard feedback'));expect(screen.queryByText('Reload latest revision')).not.toBeInTheDocument();expect(screen.getByLabelText('Leave feedback')).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Identical note'}});fetcher.mockImplementationOnce(()=>response({feedbackId:id})).mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'Identical note'}]})))
  fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(screen.getByLabelText('Leave feedback')).toHaveValue(''));const posts=fetcher.mock.calls.map(call=>JSON.parse(call[1].body)).filter(input=>input.action==='comment');expect(posts).toHaveLength(2);expect(posts[1].key).not.toBe(original.key)
})
it('keeps the submitted passage unchanged during a lost send and subsequent retry',async()=>{
  fetcher.mockImplementationOnce(()=>response(page()));render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('Design proposal');const prose=document.querySelector('.document-prose')!,text=prose.querySelector('p')!.firstChild!
  const select=(start:number,end:number)=>{const text=prose.querySelector('p')!.firstChild!,range=document.createRange();range.setStart(text,start);range.setEnd(text,end);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);fireEvent.mouseUp(prose)}
  select(2,7);fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Keep anchor'}})
  let reject!:(error:Error)=>void;fetcher.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail}));fireEvent.click(screen.getByText('Add feedback'));select(8,17)
  expect(screen.getAllByText('clear').length).toBeGreaterThan(0);await act(async()=>reject(new Error('Lost response')));await screen.findByText('Reload latest revision');select(8,17)
  fetcher.mockImplementationOnce(()=>response({feedbackId:id})).mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'Keep anchor'}]})));fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(screen.getByLabelText('Leave feedback')).toHaveValue(''))
  const posts=fetcher.mock.calls.map(call=>JSON.parse(call[1].body)).filter(input=>input.action==='comment');expect(posts[1]).toMatchObject({key:posts[0].key,quote:'clear'});expect(posts[0].quote).toBe('clear')
})
it('disables review and composer controls during an external workspace operation',()=>{
  const comment=vi.fn(),view=render(<DocumentThreads feedback={[root]} revision={2} source={doc.body} selection={root} onClearSelection={vi.fn()} onComment={comment} onReview={vi.fn()} authorName="Me" disabled/> )
  for(const name of ['Accept','Reject','Done','Reply'])expect(screen.getByRole('button',{name})).toBeDisabled();expect(screen.getByLabelText('Leave feedback')).toBeDisabled();fireEvent.submit(screen.getByLabelText('Leave feedback').closest('form')!);expect(comment).not.toHaveBeenCalled()
  view.rerender(<DocumentThreads feedback={[root]} revision={2} source={doc.body} selection={root} onClearSelection={vi.fn()} onComment={comment} onReview={vi.fn()} authorName="Me"/>);expect(screen.getByLabelText('Leave feedback')).toBeEnabled()
})
it('blocks retry while reloading and keeps the posted note visible afterward',async()=>{
  fetcher.mockImplementationOnce(()=>response(page()));render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('Design proposal');fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Visible note'}})
  fetcher.mockRejectedValueOnce(new Error('Offline'));fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Reload latest revision');let finish!:(value:unknown)=>void;fetcher.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));fireEvent.click(screen.getByText('Reload latest revision'));expect(screen.getByText('Add feedback')).toBeDisabled()
  await act(async()=>finish({ok:true,json:async()=>page()}));expect(screen.getByText('Add feedback')).toBeEnabled();fetcher.mockImplementationOnce(()=>response({feedbackId:id})).mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'Visible note'}]})));fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Visible note');await waitFor(()=>expect(screen.getByLabelText('Leave feedback')).toHaveValue(''))
})
it.each(['success','failure'])('ignores a stale token-refresh %s after posting feedback',async outcome=>{
  fetcher.mockImplementationOnce(()=>response(page()));const view=render(<DocumentReader apiBase="/api" shareKey={id} session="old" userId={id}/>);await screen.findByText('Design proposal');fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Newly posted'}})
  let sent!:(value:unknown)=>void,refreshed!:(value:unknown)=>void,fail!:(error:Error)=>void;fetcher.mockImplementationOnce(()=>new Promise(resolve=>{sent=resolve}));fireEvent.click(screen.getByText('Add feedback'))
  fetcher.mockImplementationOnce(()=>new Promise((resolve,reject)=>{refreshed=resolve;fail=reject}));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="new" userId={id}/>);fetcher.mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'Newly posted'}]})))
  await act(async()=>sent({ok:true,json:async()=>({feedbackId:id})}));await screen.findByText('Newly posted');await act(async()=>{if(outcome==='failure')fail(new Error('Stale failure'));else refreshed({ok:true,json:async()=>page()})})
  expect(screen.getByText('Newly posted')).toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.getByLabelText('Leave feedback')).toHaveValue('')
})
it.each(['refresh','page','error'])('keeps pagination consistent when %s finishes first',async first=>{
  fetcher.mockImplementationOnce(()=>response(page({feedback:[root],nextOffset:50})));const view=render(<DocumentReader apiBase="/api" shareKey={id} session="old" userId={id}/>);await screen.findByText('Design proposal');let paged!:(value:unknown)=>void,refreshed!:(value:unknown)=>void,fail!:(error:Error)=>void
  fetcher.mockImplementationOnce(()=>new Promise((resolve,reject)=>{paged=resolve;fail=reject}));fireEvent.click(screen.getByText('Load more feedback'));expect(screen.getByText('Add feedback')).toBeDisabled()
  fetcher.mockImplementationOnce(()=>new Promise(resolve=>{refreshed=resolve}));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="new" userId={id}/>);const oldPage={ok:true,json:async()=>page({feedback:[{...root,id:'old-page',body:'Loaded page'}]})},newPage={ok:true,json:async()=>page({feedback:[{...root,body:'Refreshed note'}],nextOffset:50})}
  await act(async()=>{if(first==='page')paged(oldPage);else refreshed(newPage)});await act(async()=>{if(first==='page')refreshed(newPage);else if(first==='error')fail(new Error('Stale page failure'));else paged(oldPage)})
  expect(screen.getByText(first==='page'?'Loaded page':'Refreshed note')).toBeInTheDocument();expect(screen.queryByText(first==='page'?'Refreshed note':'Loaded page')).not.toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('retains a newly posted note outside the refreshed first page without mixing documents',async()=>{
  fetcher.mockImplementationOnce(()=>response(page({feedback:[root],nextOffset:50})));const view=render(<DocumentReader apiBase="/api" shareKey={id} session="old" userId={id}/>);await screen.findByText('Design proposal');fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Outside first page'}})
  fetcher.mockImplementationOnce(()=>response({feedbackId:id})).mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'Outside first page'}]})));fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Outside first page')
  fetcher.mockImplementationOnce(()=>response(page({feedback:[root],nextOffset:50})));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="new" userId={id}/>);await waitFor(()=>expect(screen.getByLabelText('Your name')).toBeEnabled());expect(screen.getByText('Outside first page')).toBeInTheDocument()
  const other='22222222-2222-4222-8222-222222222222';fetcher.mockImplementationOnce(()=>response(page({document:{...doc,id:other,title:'Other document'},feedback:[]})));view.rerender(<DocumentReader apiBase="/api" shareKey={other} session="new" userId={id}/>);await screen.findByText('Other document');expect(screen.queryByText('Outside first page')).not.toBeInTheDocument()
})
it('keeps an anonymous pending comment anonymous after signing in',async()=>{
  fetcher.mockImplementationOnce(()=>response(page()));const view=render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('Design proposal');fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Guest'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Anonymous operation'}})
  fetcher.mockRejectedValueOnce(new Error('Lost response'));fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Reload latest revision');fetcher.mockImplementationOnce(()=>response(page()));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="token-b" userId="user-b"/>);await waitFor(()=>expect(screen.getByText('Add feedback')).toBeEnabled())
  fetcher.mockImplementationOnce(()=>response({feedbackId:id})).mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'Anonymous operation'}]})));fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(screen.getByLabelText('Leave feedback')).toHaveValue(''))
  const posts=fetcher.mock.calls.filter(call=>JSON.parse(call[1].body).action==='comment');expect(posts).toHaveLength(2);expect(posts[1][1].headers.Authorization).toBeUndefined();expect(JSON.parse(posts[1][1].body).key).toBe(JSON.parse(posts[0][1].body).key);expect(fetcher.mock.calls[fetcher.mock.calls.length-1][1].headers.Authorization).toBe('Bearer token-b')
})
it('blocks an unresolved authenticated retry after an account switch and resumes under the original user',async()=>{
  fetcher.mockImplementationOnce(()=>response(page()));const view=render(<DocumentReader apiBase="/api" shareKey={id} session="token-a" userId="user-a"/>);await screen.findByText('Design proposal');fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'A'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Original account'}})
  fetcher.mockRejectedValueOnce(new Error('Lost response'));fireEvent.click(screen.getByText('Add feedback'));await screen.findByText('Reload latest revision');fetcher.mockImplementationOnce(()=>response(page()));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="token-b" userId="user-b"/>);await waitFor(()=>expect(screen.getByText('Add feedback')).toBeEnabled());fireEvent.click(screen.getByText('Add feedback'));await screen.findAllByText(/Sign back in to the account/);expect(fetcher.mock.calls.filter(call=>JSON.parse(call[1].body).action==='comment')).toHaveLength(1)
  fetcher.mockImplementationOnce(()=>response(page()));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="new-token-a" userId="user-a"/>);await waitFor(()=>expect(screen.getByText('Add feedback')).toBeEnabled());fetcher.mockImplementationOnce(()=>response({feedbackId:id})).mockImplementationOnce(()=>response(page({feedback:[{...root,id,body:'Original account'}]})));fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(screen.getByLabelText('Leave feedback')).toHaveValue(''));const posts=fetcher.mock.calls.filter(call=>JSON.parse(call[1].body).action==='comment');expect(posts[1][1].headers.Authorization).toBe('Bearer new-token-a');expect(JSON.parse(posts[1][1].body).key).toBe(JSON.parse(posts[0][1].body).key)
})
it('preserves a feedback draft for copying and discarding after view-only downgrade',()=>{
  const discard=vi.fn(),props={feedback:[root],revision:2,source:doc.body,selection:root,onClearSelection:vi.fn(),onComment:vi.fn(),onDiscard:discard},view=render(<DocumentThreads {...props} authorName="Me"/>);fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Preserved feedback'}});view.rerender(<DocumentThreads {...props} authorName="Me" readOnly draftLocked/>);expect(screen.getByLabelText('Leave feedback')).toHaveValue('Preserved feedback');expect(screen.getByLabelText('Leave feedback')).toHaveProperty('readOnly',true);expect(screen.getByLabelText('Leave feedback')).toBeEnabled();expect(screen.getByText('Add feedback')).toBeDisabled();fireEvent.submit(screen.getByLabelText('Leave feedback').closest('form')!);expect(props.onComment).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Discard feedback'));expect(discard).toHaveBeenCalled();expect(screen.getByText('View-only access')).toBeInTheDocument()
})

it.each(['Unauthorized','forbidden','login_required','document_not_found','password_required','incorrect_password'])('conceals protected content after %s while preserving the local feedback draft',async code=>{
  fetcher.mockImplementationOnce(()=>response(page({feedback:[root]})));render(<DocumentReader apiBase="/api" shareKey={id}/>)
  await screen.findByText('Design proposal');fireEvent.click(screen.getByText('Reply'));fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'Me'}});fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'My unsent reply'}})
  fetcher.mockImplementationOnce(()=>response({error:code},false));fireEvent.click(screen.getByText('Send reply'));await waitFor(()=>expect(screen.queryByText('Design proposal')).not.toBeInTheDocument())
  expect(screen.queryByText('Make this stronger')).not.toBeInTheDocument();expect(screen.queryByText(/Replying to Alice/)).not.toBeInTheDocument();expect(document.querySelector('.document-prose')).toBeNull();expect(screen.getByLabelText('Reply')).toHaveValue('My unsent reply');expect(screen.getByLabelText('Reply')).toHaveAttribute('readonly');fireEvent.click(screen.getByText('Discard feedback'));expect(screen.getByRole('alert')).toBeInTheDocument();if(code==='forbidden')expect(screen.getByText('Log in to CRRT')).toHaveAttribute('href',expect.stringContaining('/login'))
})
it.each([null,'another-user'])('conceals the previous account content immediately on principal change to %s',async nextUser=>{
  fetcher.mockImplementationOnce(()=>response(page({feedback:[root]})));const view=render(<DocumentReader apiBase="/api" shareKey={id} session="old" userId={id}/>);await screen.findByText('Design proposal')
  fetcher.mockImplementationOnce(()=>new Promise(()=>{}));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session={nextUser} userId={nextUser}/>);expect(screen.queryByText('Design proposal')).not.toBeInTheDocument();expect(screen.queryByText('Make this stronger')).not.toBeInTheDocument()
})

it('keeps revoked content concealed while a reload is pending and restores it only after authorization succeeds',async()=>{
  fetcher.mockImplementationOnce(()=>response(page({nextOffset:50})));render(<DocumentReader apiBase="/api" shareKey={id}/>);await screen.findByText('Design proposal');fetcher.mockImplementationOnce(()=>response({error:'forbidden'},false));fireEvent.click(screen.getByText('Load more feedback'));await waitFor(()=>expect(screen.queryByText('Design proposal')).not.toBeInTheDocument())
  let resolve!:(value:unknown)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));fireEvent.click(screen.getByText('Reload latest revision'));expect(screen.queryByText('Design proposal')).not.toBeInTheDocument();await act(async()=>resolve({ok:true,json:async()=>page()}));await screen.findByText('Design proposal')
})

it.each(['pending-mutation','pending-confirmation','round-trip'])('revalidates the current account after a comment spans %s',async timing=>{
  fetcher.mockImplementationOnce(()=>response(page()));const view=render(<DocumentReader apiBase="/api" shareKey={id} session="token-a" userId="user-a"/>);await screen.findByText('Design proposal');fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'A'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Posted across accounts'}})
  let mutation!:(v:unknown)=>void,confirmation!:(v:unknown)=>void,stale!:(v:unknown)=>void,latest!:(v:unknown)=>void
  fetcher.mockImplementationOnce(()=>new Promise(r=>{mutation=r}));fireEvent.click(screen.getByText('Add feedback'))
  if(timing==='pending-confirmation'){fetcher.mockImplementationOnce(()=>new Promise(r=>{confirmation=r}));await act(async()=>mutation({ok:true,json:async()=>({feedbackId:id})}))}
  fetcher.mockImplementationOnce(()=>new Promise(r=>{stale=r}));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="token-b" userId="user-b"/>);expect(screen.queryByText('Design proposal')).not.toBeInTheDocument()
  if(timing==='round-trip'){fetcher.mockImplementationOnce(()=>new Promise(()=>{}));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="token-a" userId="user-a"/>)}
  const posted=page({feedback:[{...root,id,body:'Posted across accounts'}]})
  if(timing!=='pending-confirmation'){fetcher.mockImplementationOnce(()=>new Promise(r=>{confirmation=r}));await act(async()=>mutation({ok:true,json:async()=>({feedbackId:id})}))}
  fetcher.mockImplementationOnce(()=>new Promise(r=>{latest=r}));await act(async()=>confirmation({ok:true,json:async()=>posted}));await waitFor(()=>expect(latest).toBeTypeOf('function'))
  if(timing!=='round-trip')expect(screen.queryByText('Design proposal')).not.toBeInTheDocument()
  await act(async()=>latest({ok:true,json:async()=>posted}));await screen.findByText('Design proposal');expect(screen.getByText('Posted across accounts')).toBeInTheDocument();expect(screen.getByLabelText('Leave feedback')).toBeEnabled();expect(screen.queryByText('Log in to CRRT')).not.toBeInTheDocument()
  await act(async()=>stale({ok:true,json:async()=>page()}));expect(screen.getByText('Posted across accounts')).toBeInTheDocument();expect(fetcher.mock.calls.filter(c=>JSON.parse(c[1].body).action==='comment')).toHaveLength(1)
})
it('conceals an already loaded protected document when a refresh rejects the retained token',async()=>{
  fetcher.mockImplementationOnce(()=>response(page({feedback:[root]})));const view=render(<DocumentReader apiBase="/api" shareKey={id} session="old" userId={id}/>);await screen.findByText('Design proposal');fetcher.mockImplementationOnce(()=>response({error:'Unauthorized'},false));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="invalid" userId={id}/>);await screen.findByRole('alert');expect(screen.queryByText('Design proposal')).not.toBeInTheDocument();expect(screen.queryByText('Make this stronger')).not.toBeInTheDocument();expect(screen.getByText('Log in to CRRT')).toBeInTheDocument()
})

it.each(['success','failure','round-trip'])('ignores previous-account pagination %s without suppressing current authorization',async outcome=>{
  fetcher.mockImplementationOnce(()=>response(page({nextOffset:50})));const view=render(<DocumentReader apiBase="/api" shareKey={id} session="token-a" userId="user-a"/>);await screen.findByText('Design proposal')
  let paged!:(v:unknown)=>void,reject!:(e:Error)=>void,current!:(v:unknown)=>void;fetcher.mockImplementationOnce(()=>new Promise((a,b)=>{paged=a;reject=b}));fireEvent.click(screen.getByText('Load more feedback'))
  fetcher.mockImplementationOnce(()=>new Promise(r=>{current=r}));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="token-b" userId="user-b"/>);expect(screen.queryByText('Design proposal')).not.toBeInTheDocument()
  if(outcome==='round-trip'){fetcher.mockImplementationOnce(()=>new Promise(r=>{current=r}));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="token-a" userId="user-a"/>)}
  await act(async()=>{if(outcome==='failure')reject(new DocumentRequestError('Unauthorized'));else paged({ok:true,json:async()=>page({feedback:[{...root,body:'Stale account page'}]})})})
  await act(async()=>current({ok:true,json:async()=>page({feedback:[{...root,body:'Current account feedback'}]})}));await screen.findByText('Design proposal');expect(screen.getByText('Current account feedback')).toBeInTheDocument();expect(screen.queryByText('Stale account page')).not.toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.queryByText('Log in to CRRT')).not.toBeInTheDocument()
})

it.each([
  ['mutation','refresh-first'],['mutation','failure-first'],['confirmation','refresh-first'],['confirmation','failure-first'],['mutation','round-trip']
])('revalidates the active account after a stale %s failure with %s ordering',async(phase,ordering)=>{
  fetcher.mockImplementationOnce(()=>response(page({feedback:[root]})));const view=render(<DocumentReader apiBase="/api" shareKey={id} session="token-a" userId="user-a"/>);await screen.findByText('Design proposal');fireEvent.change(screen.getByLabelText('Your name'),{target:{value:'A'}});fireEvent.change(screen.getByLabelText('Leave feedback'),{target:{value:'Keep my pending note'}})
  let reject!:(error:Error)=>void,current!:(v:unknown)=>void,latest!:(v:unknown)=>void
  if(phase==='confirmation')fetcher.mockImplementationOnce(()=>response({feedbackId:id}));fetcher.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail}));fireEvent.click(screen.getByText('Add feedback'));await waitFor(()=>expect(reject).toBeTypeOf('function'))
  fetcher.mockImplementationOnce(()=>new Promise(r=>{current=r}));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="token-b" userId="user-b"/>);
  if(ordering==='round-trip'){fetcher.mockImplementationOnce(()=>new Promise(r=>{current=r}));view.rerender(<DocumentReader apiBase="/api" shareKey={id} session="token-a" userId="user-a"/>)}
  if(ordering==='refresh-first'){await act(async()=>current({ok:true,json:async()=>page({feedback:[root]})}));await screen.findByText('Design proposal')}
  fetcher.mockImplementationOnce(()=>new Promise(r=>{latest=r}));await act(async()=>reject(new DocumentRequestError(phase==='mutation'?'Unauthorized':'forbidden')));await waitFor(()=>expect(latest).toBeTypeOf('function'));if(ordering==='refresh-first')expect(screen.getByText('Design proposal')).toBeInTheDocument()
  await act(async()=>latest({ok:true,json:async()=>page({feedback:[root]})}));await screen.findByText('Design proposal');expect(screen.getByText('Make this stronger')).toBeInTheDocument();expect(screen.queryByText('Log in to CRRT')).not.toBeInTheDocument();expect(screen.getByLabelText('Leave feedback')).toHaveValue('Keep my pending note');expect(screen.getByText('Discard feedback')).toBeEnabled()
  if(ordering!=='refresh-first')await act(async()=>current({ok:true,json:async()=>page()}));expect(screen.getByText('Make this stronger')).toBeInTheDocument();expect(fetcher.mock.calls.filter(c=>JSON.parse(c[1].body).action==='comment')).toHaveLength(1)
})

it('shows durable block and completion reports in feedback history',()=>{
  const updates=[{operation:'block' as const,summary:'Need the approved copy.',agentId:'writer',createdAt:'2026-11-10T00:00:00Z'},{operation:'complete' as const,summary:'Copy updated; ready for review.',agentId:'writer',createdAt:'2026-11-10T00:01:00Z'}]
  render(<DocumentThreads feedback={[{...root,progress_updates:updates},{...root,id:'empty-updates',progress_updates:[]}]} revision={2} source={doc.body} selection={{quote:'',prefix:'',suffix:''}} onClearSelection={vi.fn()} onComment={vi.fn()} readOnly/>);fireEvent.click(screen.getByText('Work updates'));expect(screen.getByText('Need the approved copy.')).toBeInTheDocument();expect(screen.getByText('Copy updated; ready for review.')).toBeInTheDocument();expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(2);expect(document.querySelector('time')).toHaveAttribute('datetime',updates[0].createdAt)
})
