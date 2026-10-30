import { useEffect, useRef, useState } from 'react'
import { restoreInboxComments, type InboxUndoItem } from '../api'

export function InboxMoveUndo({ apiBase, accessToken, projectId, items, onRestored }: {
  apiBase:string; accessToken:string; projectId:string; items:InboxUndoItem[]; onRestored:()=>void
}) {
  const [remaining,setRemaining]=useState(items)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [skipped,setSkipped]=useState(0)
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  async function undo(){
    setBusy(true);setMessage('')
    let pending=remaining, conflicts=skipped
    try {
      while(pending.length){
        const result=await restoreInboxComments(apiBase,accessToken,projectId,pending.slice(0,500))
        if(!mounted.current)return
        conflicts+=result.skipped.length
        pending=pending.slice(500)
        setRemaining(pending);setSkipped(conflicts)
      }
      if(conflicts)setMessage(`${conflicts} items changed or are already in use and were not restored by this request. Review Inbox for the current result.`)
      else onRestored()
    }catch{if(mounted.current)setMessage('Could not finish Undo. Retry restores only the remaining items.')}
    finally{if(mounted.current)setBusy(false)}
  }
  return <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
    <span>{message || `${remaining.length} Inbox items moved.`}</span>
    {remaining.length>0 ? <button type="button" className="dashboard-bulk-secondary" disabled={busy} onClick={()=>{void undo()}}>Undo move</button>
      : <button type="button" className="dashboard-bulk-secondary" onClick={onRestored}>Back to Inbox</button>}
  </div>
}
