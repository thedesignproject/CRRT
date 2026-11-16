// @vitest-environment jsdom
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {DocumentView} from '../../../shared/documents'
import {DocumentEditor} from './DocumentEditor'
const id='11111111-1111-4111-8111-111111111111'
const initial:DocumentView={id,accessMode:'private',canComment:true,projectId:'p',title:'Proposal',body:'Original',version:1,publishedRevision:null,shareKey:id,sharing:false,passwordProtected:false,archived:false,updatedAt:'2026-11-06',canEdit:true,canPublish:true,canManage:true}
const onDirty=vi.fn()
beforeEach(()=>onDirty.mockReset())
afterEach(()=>vi.useRealTimers())
const editor=(fields:Partial<DocumentView>={},onSave=vi.fn().mockResolvedValue(true),disabled=false)=>render(<DocumentEditor document={{...initial,...fields}} disabled={disabled} onSave={onSave} onDirty={onDirty}/>)
it('autosaves drafts, guards navigation, and preserves changes when saving fails',async()=>{
  vi.useFakeTimers();const save=vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);editor({},save)
  fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Changed'}});expect(onDirty).toHaveBeenLastCalledWith(true)
  const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true)
  await act(async()=>vi.advanceTimersByTime(1201));expect(save).toHaveBeenCalledWith('Changed','Original');expect(screen.getByRole('status')).toHaveTextContent('Autosave paused')
  fireEvent.click(screen.getByText('Save draft'));await act(async()=>{});expect(save).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByText('Discard changes'));expect(screen.getByLabelText('Title')).toHaveValue('Proposal')
  fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Autosave succeeds'}});await act(async()=>vi.advanceTimersByTime(1201));expect(save).toHaveBeenCalledTimes(3)
})
it('imports Markdown with size/type checks and handles read failures',async()=>{
  editor();const input=screen.getByLabelText('Import Markdown')
  fireEvent.change(input,{target:{files:[]}})
  for(const file of [{name:'bad.pdf',size:10},{name:'huge.md',size:262145}]){fireEvent.change(input,{target:{files:[file]}});expect(screen.getByRole('alert')).toHaveTextContent('256 KiB')}
  fireEvent.change(input,{target:{files:[{name:'file.md',size:10,text:async()=>{throw new Error()}}]}});await screen.findByText('Could not read this file. Try again.')
  fireEvent.change(input,{target:{files:[{name:'file.md',size:10,text:async()=>'Imported content'}]}});await waitFor(()=>expect(screen.getByLabelText('Markdown')).toHaveValue('Imported content'))
})
it('restricts readonly and archived editors and pauses autosave while busy or invalid',async()=>{
  const view=editor({canEdit:false});expect(screen.getByLabelText('Title')).toBeDisabled();expect(screen.queryByText('Save draft')).not.toBeInTheDocument()
  view.rerender(<DocumentEditor document={{...initial,archived:true}} disabled={false} onSave={vi.fn()} onDirty={onDirty}/>);expect(screen.getByLabelText('Markdown')).toBeDisabled()
  view.rerender(<DocumentEditor document={initial} disabled onSave={vi.fn()} onDirty={onDirty}/>);expect(screen.getByRole('status')).toHaveTextContent('Saving')
  fireEvent.change(screen.getByLabelText('Title'),{target:{value:''}});view.rerender(<DocumentEditor document={initial} disabled={false} onSave={vi.fn()} onDirty={onDirty}/>);expect(screen.getByText('Save draft')).toBeDisabled()
})
it('normalizes title whitespace so successful autosaves do not repeat',async()=>{
  vi.useFakeTimers();const save=vi.fn().mockResolvedValue(true),view=editor({},save)
  fireEvent.change(screen.getByLabelText('Title'),{target:{value:'  Changed  '}});await act(async()=>vi.advanceTimersByTime(1201));expect(save).toHaveBeenCalledWith('Changed','Original')
  view.rerender(<DocumentEditor document={{...initial,title:'Changed',version:2}} disabled={false} onSave={save} onDirty={onDirty}/>);await act(async()=>vi.advanceTimersByTime(3000));expect(save).toHaveBeenCalledTimes(1);expect(screen.getByText('All changes saved')).toBeInTheDocument()
})
it('shows refreshed server text, preserves the conflicted draft, and supports explicit discard',async()=>{
  const save=vi.fn().mockResolvedValue(false),discard=vi.fn(),view=editor({},save)
  fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'My draft'}});fireEvent.click(screen.getByText('Save draft'));await act(async()=>{});expect(screen.getByRole('status')).toHaveTextContent('Autosave paused')
  view.rerender(<DocumentEditor document={{...initial,body:'Server text',version:2}} disabled={false} onSave={save} onDirty={onDirty} conflict onDiscard={discard}/>);expect(screen.getByText('Server text')).toBeInTheDocument();expect(screen.getByLabelText('Markdown')).toHaveValue('My draft')
  fireEvent.click(screen.getByText('Discard changes'));expect(discard).toHaveBeenCalled();expect(screen.getByLabelText('Markdown')).toHaveValue('Server text')
})
it('locks the editor only during reloads and preserves its local draft',async()=>{
  vi.useFakeTimers();const save=vi.fn().mockResolvedValue(true),view=editor({},save)
  fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Keep my text'}})
  view.rerender(<DocumentEditor document={initial} disabled={false} loading onSave={save} onDirty={onDirty}/>);expect(screen.getByLabelText('Title')).toBeDisabled();expect(screen.getByLabelText('Markdown')).toBeDisabled();expect(screen.getByText('Save draft')).toBeDisabled();expect(screen.getByRole('status')).toHaveTextContent('Loading latest')
  await act(async()=>vi.advanceTimersByTime(2000));expect(save).not.toHaveBeenCalled();expect(screen.getByLabelText('Markdown')).toHaveValue('Keep my text')
  view.rerender(<DocumentEditor document={initial} disabled={false} onSave={save} onDirty={onDirty}/>);expect(screen.getByLabelText('Markdown')).toBeEnabled();await act(async()=>vi.advanceTimersByTime(1201));expect(save).toHaveBeenCalledWith('Proposal','Keep my text')
})
it.each([false,true])('preserves downgraded drafts as selectable readonly text, archived=%s',async archived=>{
  const save=vi.fn(),view=editor({},save);fireEvent.change(screen.getByLabelText('Title'),{target:{value:'My unsaved title'}});fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'My unsaved draft'}})
  const discard=vi.fn();view.rerender(<DocumentEditor document={{...initial,title:'Published title',body:'Published body',canEdit:archived,archived}} conflict disabled={false} onSave={save} onDirty={onDirty} onDiscard={discard}/>);expect(screen.getByLabelText('Markdown')).toHaveValue('My unsaved draft');expect(screen.getByLabelText('Markdown')).toHaveProperty('readOnly',true);expect(screen.getByLabelText('Markdown')).toBeEnabled();expect(screen.queryByText('Save draft')).not.toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('Copy it or discard');expect(screen.getByText('Current published content').closest('details')).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText('Discard changes'));expect(discard).toHaveBeenCalled();expect(save).not.toHaveBeenCalled()
})
it('preserves later typing when a refreshed readonly response follows a save acknowledgement',()=>{
  const view=editor();fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'Saved checkpoint plus later typing'}});view.rerender(<DocumentEditor document={{...initial,body:'Saved checkpoint',version:2,canEdit:false}} disabled={false} onSave={vi.fn()} onDirty={onDirty}/>);expect(screen.getByLabelText('Markdown')).toHaveValue('Saved checkpoint plus later typing');expect(screen.getByLabelText('Markdown')).toHaveProperty('readOnly',true);expect(screen.getByLabelText('Markdown')).toBeEnabled();expect(screen.getByText('Discard changes')).toBeEnabled()
})

it('caches user edits but never mistakes a server-only refresh for an unsaved recovery draft',async()=>{
  const remember=vi.fn(),save=vi.fn().mockResolvedValue(false),props={disabled:false,onSave:save,onDirty:vi.fn(),onDraftChange:remember},view=render(<DocumentEditor {...props} document={initial}/>);expect(remember).toHaveBeenLastCalledWith(null)
  view.rerender(<DocumentEditor {...props} document={{...initial,body:'Changed on server',version:2}}/>);expect(remember).toHaveBeenLastCalledWith(null);fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'My own edit'}});expect(remember).toHaveBeenLastCalledWith({title:'Proposal',body:'My own edit'})
  view.rerender(<DocumentEditor {...props} document={{...initial,body:'My own edit',version:3}}/>);expect(remember).toHaveBeenLastCalledWith(null);view.rerender(<DocumentEditor {...props} document={{...initial,body:'Another server edit',version:4}}/>);expect(remember).toHaveBeenLastCalledWith(null)
  expect(screen.getByLabelText('Markdown')).toHaveValue('Another server edit');expect(save).not.toHaveBeenCalled();fireEvent.change(screen.getByLabelText('Markdown'),{target:{value:'New local work'}});expect(remember).toHaveBeenLastCalledWith({title:'Proposal',body:'New local work'});fireEvent.click(screen.getByText('Discard changes'));expect(remember).toHaveBeenLastCalledWith(null)
})
