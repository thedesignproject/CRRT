import {act,fireEvent,render,screen} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../api',()=>({restoreInboxComments:vi.fn()}))
import {restoreInboxComments} from '../api'
import {InboxMoveUndo} from './InboxMoveUndo'
const items=Array.from({length:501},(_,i)=>({id:String(i),updatedAt:'2026-10-30T12:00:00Z'}))
beforeEach(()=>vi.resetAllMocks())
it('batches a whole Inbox move and retries only the uncommitted remainder',async()=>{
 vi.mocked(restoreInboxComments).mockResolvedValueOnce({processedIds:[],skipped:[]}).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({processedIds:['500'],skipped:[]})
 const done=vi.fn();render(<InboxMoveUndo apiBase="/api" accessToken="t" projectId="p" items={items} onProgress={vi.fn()} onRestored={done} />)
 fireEvent.click(screen.getByRole('button',{name:'Undo move'}))
 await screen.findByText('Could not finish Undo. Retry restores only the remaining items.')
 fireEvent.click(screen.getByRole('button',{name:'Undo move'}))
 await act(async()=>{})
 expect(restoreInboxComments).toHaveBeenLastCalledWith('/api','t','p',[items[500]])
 expect(done).toHaveBeenCalledOnce()
})
it('reports conflicts without promising full restoration',async()=>{
 vi.mocked(restoreInboxComments).mockResolvedValue({processedIds:[],skipped:[{id:'0',reason:'concurrent_change'}]})
 const done=vi.fn();render(<InboxMoveUndo apiBase="/api" accessToken="t" projectId="p" items={[items[0]]} onProgress={vi.fn()} onRestored={done} />)
 fireEvent.click(screen.getByRole('button',{name:'Undo move'}))
 await screen.findByText('1 items changed or are already in use and were not restored by this request. Review Inbox for the current result.')
 expect(done).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Back to Inbox'}));expect(done).toHaveBeenCalledOnce()
})
it.each(['success','failure'])('ignores a late %s after unmount',async mode=>{
 let resolve!:(value:any)=>void, reject!:(error:Error)=>void
 vi.mocked(restoreInboxComments).mockReturnValue(new Promise((yes,no)=>{resolve=yes;reject=no}))
 const done=vi.fn(),view=render(<InboxMoveUndo apiBase="/api" accessToken="t" projectId="p" items={[items[0]]} onProgress={vi.fn()} onRestored={done} />)
 fireEvent.click(screen.getByRole('button',{name:'Undo move'}));expect(screen.getByRole('button',{name:'Undo move'})).toBeDisabled();view.unmount()
 await act(async()=>{mode==='success'?resolve({processedIds:['0'],skipped:[]}):reject(new Error('offline'))})
 expect(done).not.toHaveBeenCalled()
})

it('refreshes after each committed batch even if the next batch fails',async()=>{
 vi.mocked(restoreInboxComments).mockResolvedValueOnce({processedIds:['0'],skipped:[]}).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({processedIds:[],skipped:[{id:'500',reason:'concurrent_change'}]})
 const progress=vi.fn(),done=vi.fn()
 render(<InboxMoveUndo apiBase="/api" accessToken="t" projectId="p" items={items} onProgress={progress} onRestored={done} />)
 fireEvent.click(screen.getByRole('button',{name:'Undo move'}))
 await screen.findByText('Could not finish Undo. Retry restores only the remaining items.')
 expect(progress).toHaveBeenCalledOnce()
 fireEvent.click(screen.getByRole('button',{name:'Undo move'}))
 await screen.findByText('1 items changed or are already in use and were not restored by this request. Review Inbox for the current result.')
 expect(progress).toHaveBeenCalledTimes(2)
 expect(done).not.toHaveBeenCalled()
 expect(restoreInboxComments).toHaveBeenLastCalledWith('/api','t','p',[items[500]])
})
