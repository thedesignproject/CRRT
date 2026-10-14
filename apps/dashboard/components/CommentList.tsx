import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { getDisplayStatus, isInactive } from '../lib/comment'
import { timeAgo } from '../lib/format'
import type { Comment, StatusFilter } from '../lib/types'
import { ChatIcon, CheckboxIcon } from './icons'
import { Spinner, StatusBadge } from './primitives'

type Counts = { all: number; open: number; ready: number; ready_for_testing: number; done: number; rejected: number }

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  open: 'Open',
  ready: 'Agent',
  ready_for_testing: 'Testing',
  done: 'Done',
}

interface CommentListProps {
  personal?: false
  readOnly?: boolean
  filteredComments: Comment[]
  counts: Counts
  statusFilter: StatusFilter
  selectFilter: (f: StatusFilter) => void
  bulkMode: boolean
  enterBulkMode: () => void
  exitBulkMode: () => void
  bulkSelectedIds: Set<string>
  toggleSelectAllVisible: () => void
  toggleBulkSelect: (id: string) => void
  commentsLoading: boolean
  commentsError: string | null
  selectedCommentId: string
  setSelectedCommentId: (id: string) => void
}

type PersonalBulkControls = {
  bulkMode: boolean
  enterBulkMode: () => void
  exitBulkMode: () => void
  selectedCount: number
  isSelected: (id: string) => boolean
  toggleBulkSelect: (id: string) => void
  toggleSelectAllVisible: () => void
  allVisibleSelected: boolean
  allMatchingSelected: boolean
  canSelectAllMatching: boolean
  selectAllMatching: () => void
  clearSelection: () => void
}

type PersonalListProps = Pick<CommentListProps, 'filteredComments' | 'counts' | 'commentsLoading' | 'commentsError' | 'selectedCommentId' | 'setSelectedCommentId'> & {
  personal: true
  footer?: ReactNode
  bulkControls?: PersonalBulkControls
}
const EMPTY_SELECTION = new Set<string>()

export function CommentList(props: CommentListProps | PersonalListProps) {
  const { filteredComments, counts, commentsLoading, commentsError, selectedCommentId, setSelectedCommentId } = props
  const controls = props.personal || props.readOnly ? null : props
  const personalBulk = props.personal ? props.bulkControls : null
  const bulkMode = controls?.bulkMode ?? personalBulk?.bulkMode ?? false
  const bulkSelectedIds = controls?.bulkSelectedIds ?? EMPTY_SELECTION
  return (
    <div className={cn('dashboard-comment-list w-full shrink-0 flex flex-col border-r border-border bg-card', props.personal && 'h-[38vh] md:h-auto')}>
      <div className="px-4 pt-4 pb-2.5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium text-foreground tracking-tight">
            {counts.all} {props.personal ? 'Inbox Items' : 'Feedback Items'}
          </h2>
          {(controls || personalBulk) && <button
            type="button"
            aria-pressed={bulkMode}
            onClick={() => bulkMode
              ? (controls?.exitBulkMode ?? personalBulk?.exitBulkMode)?.()
              : (controls?.enterBulkMode ?? personalBulk?.enterBulkMode)?.()}
            className={cn(
              'text-[11px] font-medium transition-colors flex items-center gap-1',
              bulkMode ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CheckboxIcon /> {bulkMode ? 'Cancel' : 'Select'}
          </button>}
        </div>
        {controls && <div className="grid grid-cols-5 gap-1 pb-1">
          {(['all', 'open', 'ready', 'ready_for_testing', 'done'] as StatusFilter[]).map((f) => {
            const count = counts[f as keyof Counts] ?? 0
            return (
              <button
                type="button"
                key={f}
                aria-pressed={controls.statusFilter === f}
                onClick={() => controls.selectFilter(f)}
                className={cn(
                  'min-w-0 px-0.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-all',
                  controls.statusFilter === f
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {FILTER_LABELS[f]}
                <span className={cn(
                  'ml-1.5 text-[10px] font-medium min-w-[18px] text-center py-0.5 px-1 rounded-full',
                  controls.statusFilter === f
                    ? 'bg-muted text-foreground'
                    : 'bg-muted text-muted-foreground'
                )}>{count}</span>
              </button>
            )
          })}
        </div>}
      </div>

      {controls && bulkMode && (
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
          <button
            type="button"
            onClick={controls.toggleSelectAllVisible}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {filteredComments.length > 0 && filteredComments.every((c) => bulkSelectedIds.has(c.id)) ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-[11px] text-muted-foreground">
            {bulkSelectedIds.size} selected
          </span>
        </div>
      )}

      {personalBulk && bulkMode && (
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
          <button type="button" onClick={personalBulk.toggleSelectAllVisible}
            className="text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
            {personalBulk.allVisibleSelected ? 'Deselect page' : 'Select page'}
          </button>
          <span className="text-[11px] text-muted-foreground">{personalBulk.selectedCount} selected</span>
        </div>
      )}

      {personalBulk && bulkMode && (personalBulk.canSelectAllMatching || personalBulk.allMatchingSelected) && (
        <div className="border-b border-border bg-muted/35 px-4 py-2 text-center text-[11px] text-muted-foreground" role="status">
          {personalBulk.allMatchingSelected ? <>
            All {counts.all} Inbox items are selected.{' '}
            <button type="button" onClick={personalBulk.clearSelection} className="font-semibold text-foreground hover:underline">Clear selection</button>
          </> : <>
            All {filteredComments.length} items on this page are selected.{' '}
            <button type="button" onClick={personalBulk.selectAllMatching} className="font-semibold text-foreground hover:underline">Select all {counts.all} in Inbox</button>
          </>}
        </div>
      )}

      <div className={cn('flex-1 overflow-y-auto', bulkMode && 'pb-24 dashboard-bulk-scroll')}>
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
            <p className="text-xs text-muted-foreground">{props.personal ? 'Your Inbox is empty.' : 'Nothing here yet for this filter.'}</p>
          </div>
        ) : (
          <div className="animate-stagger">
            {filteredComments.map((comment) => {
              const isActive = comment.id === selectedCommentId
              const isChecked = personalBulk?.isSelected(comment.id) ?? bulkSelectedIds.has(comment.id)
              const inactive = isInactive(comment)

              return (
                <button
                  type="button"
                  key={comment.id}
                  aria-pressed={bulkMode ? isChecked : isActive}
                  onClick={() => bulkMode
                    ? (controls?.toggleBulkSelect ?? personalBulk?.toggleBulkSelect)?.(comment.id)
                    : setSelectedCommentId(comment.id)}
                  className={cn(
                    'relative w-full text-left px-4 py-3 border-b border-border/50 card-hover transition-colors',
                    isActive && !bulkMode && 'bg-accent',
                    bulkMode && isChecked ? 'bg-muted' : !isActive && 'hover:bg-accent/70',
                    inactive && !isChecked && 'bg-muted/30'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {bulkMode ? (
                        <div className={cn(
                          'w-[18px] h-[18px] rounded shrink-0 flex items-center justify-center border-2 transition-colors',
                          isChecked ? 'bg-foreground border-foreground text-background' : 'border-muted-foreground/40'
                        )} aria-hidden="true">
                          {isChecked && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      ) : (
                        <div
                          className="w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center text-[8px] font-medium text-white"
                          style={{ background: comment.authorColor }}
                          aria-hidden="true"
                        >
                          {comment.authorInitial}
                        </div>
                      )}
                      <span className="text-[13px] font-medium text-foreground">{comment.author}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                  </div>

                  <p className={cn(
                    'text-sm leading-relaxed mb-2 line-clamp-2 pl-[26px] break-words',
                    inactive
                      ? 'text-muted-foreground'
                      : isActive && !bulkMode
                        ? 'text-foreground/85'
                        : 'text-muted-foreground'
                  )}>
                    {comment.body}
                  </p>

                  <div className="flex items-center gap-1.5 pl-[26px] flex-wrap">
                    {!props.personal && <StatusBadge comment={comment} />}
                    {!props.personal && (
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
                        comment.visibility === 'internal'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        {comment.visibility ?? 'shared'}
                      </span>
                    )}
                    {props.personal && <span className="text-[10px] text-muted-foreground truncate" title={comment.pageUrl ?? ''}>{comment.pageUrl}</span>}
                    {comment.claimedByAgentId && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-status-in-progress">
                        <span className="w-1.5 h-1.5 rounded-full bg-status-in-progress animate-pulse-dot" />
                        {comment.claimedByAgentId}
                      </span>
                    )}
                    {comment.targetType === 'text_range' && comment.anchor ? (
                      <span className="text-[10px] text-muted-foreground italic ml-auto truncate max-w-[140px]">
                        &ldquo;{comment.anchor.selectedText}&rdquo;
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-mono ml-auto truncate max-w-[140px]">
                        {comment.selector?.split(' > ').pop() || 'No page context'}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {props.personal && props.footer}
    </div>
  )
}

export type { Counts }
export { getDisplayStatus }
