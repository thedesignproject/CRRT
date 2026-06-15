import { cn } from '../lib/utils'
import { getDisplayStatus, isInactive } from '../lib/comment'
import { timeAgo } from '../lib/format'
import type { Comment, StatusFilter } from '../lib/types'
import { ChatIcon, CheckboxIcon } from './icons'
import { Spinner, StatusBadge } from './primitives'

type Counts = { all: number; open: number; ready: number; done: number; rejected: number }

interface CommentListProps {
  filteredComments: Comment[]
  counts: Counts
  statusFilter: StatusFilter
  selectFilter: (f: StatusFilter) => void
  bulkMode: boolean
  enterBulkMode: () => void
  exitBulkMode: () => void
  bulkSelectedIds: Set<string>
  toggleSelectAllVisible: () => void
  applyBulkAction: (action: 'ready' | 'done' | 'reject') => void
  toggleBulkSelect: (id: string) => void
  commentsLoading: boolean
  commentsError: string | null
  selectedCommentId: string
  setSelectedCommentId: (id: string) => void
}

export function CommentList({
  filteredComments,
  counts,
  statusFilter,
  selectFilter,
  bulkMode,
  enterBulkMode,
  exitBulkMode,
  bulkSelectedIds,
  toggleSelectAllVisible,
  applyBulkAction,
  toggleBulkSelect,
  commentsLoading,
  commentsError,
  selectedCommentId,
  setSelectedCommentId,
}: CommentListProps) {
  return (
    <div className="w-[400px] shrink-0 flex flex-col border-r border-border bg-card">
      <div className="px-4 pt-4 pb-2.5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground tracking-tight">
            {counts.all} Feedback Items
          </h2>
          <button
            onClick={() => bulkMode ? exitBulkMode() : enterBulkMode()}
            className={cn(
              'text-[11px] font-medium transition-colors flex items-center gap-1',
              bulkMode ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CheckboxIcon /> {bulkMode ? 'Cancel' : 'Select'}
          </button>
        </div>
        <div className="flex gap-1">
          {(['all', 'open', 'ready', 'done'] as StatusFilter[]).map((f) => {
            const count = counts[f as keyof Counts] ?? 0
            const label = f === 'all' ? 'All' : f === 'open' ? 'Open' : f === 'ready' ? 'Ready for Agent' : 'Done'
            return (
              <button
                key={f}
                onClick={() => selectFilter(f)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
                  statusFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {label}
                <span className={cn(
                  'ml-1.5 text-[10px] font-bold min-w-[18px] text-center py-0.5 px-1 rounded-full',
                  statusFilter === f
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground/60'
                )}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {bulkMode && (
        <div className="px-4 py-2.5 border-b border-border border-l-2 border-l-primary/40 bg-card flex items-center gap-2 whitespace-nowrap">
          <button
            onClick={toggleSelectAllVisible}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            {filteredComments.length > 0 && filteredComments.every((c) => bulkSelectedIds.has(c.id)) ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {bulkSelectedIds.size} selected
          </span>
          <div className="flex-1" />
          <button
            disabled={bulkSelectedIds.size === 0}
            onClick={() => applyBulkAction('ready')}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-status-accepted-bg text-status-accepted hover:bg-status-accepted hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none whitespace-nowrap"
          >
            Ready
          </button>
          <button
            disabled={bulkSelectedIds.size === 0}
            onClick={() => applyBulkAction('done')}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-status-done-bg text-status-done hover:bg-status-done hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none whitespace-nowrap"
          >
            Done
          </button>
          <button
            disabled={bulkSelectedIds.size === 0}
            onClick={() => applyBulkAction('reject')}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-status-rejected-bg text-status-rejected hover:bg-status-rejected hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none whitespace-nowrap"
          >
            Reject
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {commentsLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3">
            <Spinner />
            <p className="text-xs text-muted-foreground">Loading comments…</p>
          </div>
        ) : commentsError ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <p className="text-sm font-semibold text-status-rejected mb-1">Failed to load</p>
            <p className="text-xs text-muted-foreground">{commentsError}</p>
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <ChatIcon className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No comments</p>
            <p className="text-xs text-muted-foreground">Nothing here yet for this filter.</p>
          </div>
        ) : (
          <div className="animate-stagger">
            {filteredComments.map((comment) => {
              const isActive = comment.id === selectedCommentId
              const isChecked = bulkSelectedIds.has(comment.id)
              const inactive = isInactive(comment)
              const statusBar =
                comment.implementationStatus === 'done' ? 'bg-status-done' :
                comment.reviewStatus === 'accepted' ? 'bg-status-accepted' :
                comment.reviewStatus === 'rejected' ? 'bg-status-rejected' :
                null

              return (
                <button
                  key={comment.id}
                  onClick={() => bulkMode ? toggleBulkSelect(comment.id) : setSelectedCommentId(comment.id)}
                  className={cn(
                    'relative w-full text-left px-4 py-3 border-b border-border/50 border-l-[3px] card-hover',
                    isActive && !bulkMode ? 'border-l-primary bg-white/[0.04] ring-1 ring-inset ring-border' : 'border-l-transparent',
                    bulkMode && isChecked ? 'bg-primary/10' : !isActive && 'hover:bg-white/[0.02]',
                    inactive && !isChecked && 'opacity-50'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {bulkMode ? (
                        <div className={cn(
                          'w-[18px] h-[18px] rounded shrink-0 flex items-center justify-center border-2 transition-colors',
                          isChecked ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                        )}>
                          {isChecked && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      ) : (
                        <div
                          className="w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ background: comment.authorColor }}
                        >
                          {comment.authorInitial}
                        </div>
                      )}
                      <span className="text-[13px] font-bold text-foreground">{comment.author}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60">{timeAgo(comment.createdAt)}</span>
                  </div>

                  <p className={cn(
                    'text-[12px] leading-relaxed mb-2 line-clamp-2 pl-[26px]',
                    inactive
                      ? 'text-muted-foreground/50 line-through'
                      : isActive && !bulkMode
                        ? 'text-foreground/85'
                        : 'text-muted-foreground'
                  )}>
                    {comment.body}
                  </p>

                  <div className="flex items-center gap-1.5 pl-[26px] flex-wrap">
                    <StatusBadge comment={comment} />
                    {comment.claimedByAgentId && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-status-in-progress">
                        <span className="w-1.5 h-1.5 rounded-full bg-status-in-progress animate-pulse-dot" />
                        {comment.claimedByAgentId}
                      </span>
                    )}
                    {comment.targetType === 'text_range' && comment.anchor ? (
                      <span className="text-[10px] text-muted-foreground/60 italic ml-auto truncate max-w-[140px]">
                        &ldquo;{comment.anchor.selectedText}&rdquo;
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40 font-mono ml-auto truncate max-w-[140px]">
                        {comment.selector.split(' > ').pop()}
                      </span>
                    )}
                  </div>

                  {statusBar && (
                    <span
                      aria-hidden="true"
                      className={cn('absolute top-2 bottom-2 right-0 w-[2px] rounded-l-sm', statusBar)}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export type { Counts }
export { getDisplayStatus }
