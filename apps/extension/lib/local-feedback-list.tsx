import { useState } from 'react'
import { Check, RotateCcw, Trash2 } from 'lucide-react'
import type { Comment } from '../../../src/components/FeedbackWidget/types'

export function LocalFeedbackList({ comments, busy, onResolve, onDelete }: { comments: Comment[]; busy: boolean; onResolve: (comment: Comment) => void; onDelete: (id: string) => void }) {
  const [visibleCount, setVisibleCount] = useState(3)
  return <>
    <div className="local-comments">
      {[...comments].reverse().slice(0, visibleCount).map(comment => <article key={comment.id} className="local-comment">
        <div className="local-comment-body"><p>{comment.body}</p><span className="local-status">{comment.reviewStatus === 'accepted' ? 'Resolved' : 'Open'}</span></div>
        <div className="local-comment-actions">
          <button className="local-action" disabled={busy} onClick={() => { onResolve(comment) }}>{comment.reviewStatus === 'accepted' ? <RotateCcw size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}{comment.reviewStatus === 'accepted' ? 'Reopen' : 'Resolve'}</button>
          <button className="local-action local-delete" aria-label="Delete local feedback" title="Delete local feedback" disabled={busy} onClick={() => { onDelete(comment.id) }}><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      </article>)}
    </div>
    <div className="local-list-controls">
      {comments.length > visibleCount && <button className="link" onClick={() => setVisibleCount(count => count + 10)}>Show more ({comments.length - visibleCount} remaining)</button>}
      {visibleCount > 3 && <button className="link" onClick={() => setVisibleCount(3)}>Show less</button>}
    </div>
  </>
}
