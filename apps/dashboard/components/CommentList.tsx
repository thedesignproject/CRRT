import { useRef, type ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'
import { EmptyState, FilterTabs, Initials } from '@crrt/ui/crrt'
import { cn } from '../lib/utils'
import { getDisplayStatus, isInactive } from '../lib/comment'
import { timeAgo } from '../lib/format'
import type { Comment, StatusFilter } from '../lib/types'
import { CheckboxIcon } from './icons'
import { Spinner, StatusBadge } from './primitives'

type Counts = { all: number; open: number; ready: number; ready_for_testing: number; done: number; rejected: number }

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  open: 'Open',
  ready: 'Agent',
  ready_for_testing: 'Testing',
  done: 'Done',
}
const FILTERS: StatusFilter[] = ['all', 'open', 'ready', 'ready_for_testing', 'done']
const REDIRECT_ORDER: Exclude<StatusFilter, 'all'>[] = ['ready_for_testing', 'ready', 'open', 'done']

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
  toggleBulkSelect: (id: string, range?: string[]) => void
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
  toggleBulkSelect: (id: string, range?: string[]) => void
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
  const selectionAnchor = useRef<string | null>(null)
  function selectItem(id: string, extend: boolean, toggle: (id: string, range?: string[]) => void) {
    const start = filteredComments.findIndex(c => c.id === selectionAnchor.current)
    const end = filteredComments.findIndex(c => c.id === id)
    const range = extend && start >= 0
      ? filteredComments.slice(Math.min(start, end), Math.max(start, end) + 1).map(c => c.id)
      : undefined
    selectionAnchor.current = id
    toggle(id, range)
  }
  const filter = controls?.statusFilter ?? 'all'
  // Where the work is when the current filter is empty, so the empty state can point at it.
  const busiest = REDIRECT_ORDER.find((f) => f !== filter && counts[f] > 0)
  return (
    <div className={cn('dashboard-comment-list w-full shrink-0 flex flex-col border-r border-sidebar-border bg-surface-1', props.personal && 'h-[38vh] md:h-auto')}>
      <div className="flex flex-col gap-3 border-b border-sidebar-border px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-text-strong">
            {props.personal ? 'Inbox' : 'Feedback'} <span className="font-mono text-xs font-normal text-text-subtle">{counts.all}</span>
          </h2>
          {(controls || personalBulk) && <button
            type="button"
            aria-pressed={bulkMode}
            onClick={() => bulkMode
              ? (controls?.exitBulkMode ?? personalBulk?.exitBulkMode)?.()
              : (controls?.enterBulkMode ?? personalBulk?.enterBulkMode)?.()}
            className={cn(
              'flex items-center gap-1 text-xs font-medium transition-colors',
              bulkMode ? 'text-text-strong' : 'text-text-subtle hover:text-text-strong'
            )}
          >
            <CheckboxIcon /> {bulkMode ? 'Cancel' : 'Select'}
          </button>}
        </div>
        {controls && <FilterTabs
          label="Status"
          value={controls.statusFilter}
          onChange={controls.selectFilter}
          options={FILTERS.map((f) => ({ id: f, label: FILTER_LABELS[f], count: counts[f] }))}
        />}
      </div>

      {(controls || personalBulk) && (
        <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-2.5 text-xs">
          <button
            type="button"
            onClick={(controls ?? personalBulk)!.toggleSelectAllVisible}
            className="font-medium text-text-subtle transition-colors hover:text-text-strong"
          >
            {personalBulk
              ? personalBulk.allVisibleSelected ? 'Deselect page' : 'Select page'
              : filteredComments.length > 0 && filteredComments.every((c) => bulkSelectedIds.has(c.id)) ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-text-subtle">{personalBulk?.selectedCount ?? bulkSelectedIds.size} selected</span>
        </div>
      )}

      {personalBulk && (personalBulk.canSelectAllMatching || personalBulk.allMatchingSelected) && (
        <div className="border-b border-sidebar-border bg-surface-2 px-4 py-2 text-center text-xs text-text-subtle" role="status">
          {personalBulk.allMatchingSelected ? <>
            All {counts.all} Inbox items are selected.{' '}
            <button type="button" onClick={personalBulk.clearSelection} className="font-medium text-text-strong hover:underline">Clear selection</button>
          </> : <button type="button" onClick={personalBulk.selectAllMatching} className="font-medium text-text-strong hover:underline">Select all {counts.all} in Inbox</button>}
        </div>
      )}

      <div className={cn('flex-1 overflow-y-auto', bulkMode && !props.personal && 'pb-24 dashboard-bulk-scroll')}>
        {commentsLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <Spinner />
            <p className="text-xs text-text-subtle">Loading comments…</p>
          </div>
        ) : commentsError ? (
          <EmptyState icon={<MessageSquare />} title="Failed to load">{commentsError}</EmptyState>
        ) : filteredComments.length === 0 ? (
          props.personal ? (
            <EmptyState icon={<MessageSquare />} title="Your Inbox is empty">Comments you leave with the browser extension land here.</EmptyState>
          ) : (
            <EmptyState
              icon={<MessageSquare />}
              title={filter === 'all' ? 'No feedback yet' : `Nothing in ${FILTER_LABELS[filter]} yet`}
              action={controls && busiest && (
                <button type="button" onClick={() => controls.selectFilter(busiest)} className="inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium text-text-strong ring-1 ring-border hover:bg-surface-3">
                  Show {counts[busiest]} in {FILTER_LABELS[busiest]}
                </button>
              )}
            >
              {busiest ? 'The work is somewhere else right now.' : 'Share a review link and comments land here.'}
            </EmptyState>
          )
        ) : (
          <div className="animate-stagger">
            {filteredComments.map((comment) => {
              const isActive = comment.id === selectedCommentId
              const isChecked = personalBulk?.isSelected(comment.id) ?? bulkSelectedIds.has(comment.id)
              const inactive = isInactive(comment)

              return (
                <div key={comment.id} className="relative flex items-start border-b border-sidebar-border">
                  {(controls || personalBulk) && <input
                    type="checkbox"
                    aria-label={`Select feedback: ${comment.body}`}
                    title="Shift-click to select a range"
                    checked={isChecked}
                    onChange={event => selectItem(comment.id, (event.nativeEvent as MouseEvent).shiftKey, (controls ?? personalBulk)!.toggleBulkSelect)}
                    className="mt-4 ml-4 shrink-0 accent-foreground"
                  />}
                <button
                  type="button"
                  aria-pressed={bulkMode ? isChecked : isActive}
                  onClick={() => bulkMode
                    ? (controls?.toggleBulkSelect ?? personalBulk?.toggleBulkSelect)?.(comment.id)
                    : setSelectedCommentId(comment.id)}
                  className={cn(
                    'flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
                    bulkMode ? isChecked && 'bg-surface-4' : isActive && 'bg-surface-4 shadow-[inset_2px_0_0_var(--carrot)]',
                    !(bulkMode ? isChecked : isActive) && 'hover:bg-surface-3',
                  )}
                >
                  <Initials name={comment.author} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-baseline gap-2">
                      <span className="font-medium text-text-strong">{comment.author}</span>
                      <span className="text-xs text-text-subtle">{timeAgo(comment.createdAt)}</span>
                      {!props.personal && <StatusBadge comment={comment} className="ml-auto" />}
                    </span>
                    <span className={cn('line-clamp-2 break-words', inactive ? 'text-text-subtle' : 'text-text-body')}>{comment.body}</span>
                    <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-text-subtle">
                      {comment.claimedByAgentId && (
                        <span className="inline-flex shrink-0 items-center gap-1 font-sans font-medium text-status-agent-fg">
                          <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-agent-working motion-reduce:animate-none" />
                          {comment.claimedByAgentId}
                        </span>
                      )}
                      {!props.personal && comment.visibility === 'internal' && <span className="shrink-0 font-sans">Internal ·</span>}
                      <span className="truncate" title={location(comment)}>{location(comment)}</span>
                    </span>
                  </span>
                </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {props.personal && props.footer}
    </div>
  )
}

/** Where the comment sits: quoted text for text ranges, else the page and the element. */
function location(comment: Comment) {
  if (comment.targetType === 'text_range' && comment.anchor) return `“${comment.anchor.selectedText}”`
  const element = comment.selector?.split(' > ').pop()
  const page = comment.pageUrl ? pagePath(comment.pageUrl) : null
  return [page, element].filter(Boolean).join(' · ') || 'No page context'
}

function pagePath(url: string) {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

export type { Counts }
export { getDisplayStatus }
