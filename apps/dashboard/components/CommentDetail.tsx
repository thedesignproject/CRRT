import { cn } from '../lib/utils'
import { getDisplayStatus } from '../lib/comment'
import { timeAgo, truncateUrl } from '../lib/format'
import { DISPLAY_STATUS_LABELS, type Comment } from '../lib/types'
import {
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CursorIcon,
  DoneIcon,
  ExternalLinkIcon,
  ImageOffIcon,
  SelectorIcon,
  XIcon,
} from './icons'
import { ActionBtn, Kbd } from './primitives'
import { ProjectEmptyState } from './ProjectEmptyState'

interface CommentDetailProps {
  selectedComment: Comment | null
  selectedProject: string
  apiBase: string
  commentsLoading: boolean
  commentsError: string | null
  projectComments: Comment[]
  filteredComments: Comment[]
  selectedIdx: number
  goPrev: () => void
  goNext: () => void
  toggleReview: (c: Comment, target: 'accepted' | 'rejected') => void
  handleToggleDone: (id: string) => void
}

export function CommentDetail({
  selectedComment,
  selectedProject,
  apiBase,
  commentsLoading,
  commentsError,
  projectComments,
  filteredComments,
  selectedIdx,
  goPrev,
  goNext,
  toggleReview,
  handleToggleDone,
}: CommentDetailProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {selectedComment ? (
        <>
          <div className="flex items-center justify-between px-6 h-[44px] shrink-0 border-b border-border bg-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono font-medium">#{selectedComment.id}</span>
              <span>·</span>
              <span className="font-mono">{truncateUrl(selectedComment.pageUrl)}</span>
              <span>·</span>
              {(() => {
                const ds = getDisplayStatus(selectedComment)
                return (
                  <span className={cn(
                    'font-semibold',
                    ds === 'ready' && 'text-status-accepted',
                    ds === 'rejected' && 'text-status-rejected',
                    ds === 'done' && 'text-status-done',
                    ds === 'open' && 'text-muted-foreground',
                  )}>
                    {DISPLAY_STATUS_LABELS[ds]}
                  </span>
                )
              })()}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div key={selectedComment.id} className="max-w-2xl mx-auto px-8 py-8 detail-enter">
              {selectedComment.screenshotUrl ? (
                <div className="rounded-xl border border-border overflow-hidden mb-6 bg-muted/40 flex items-center justify-center">
                  <a
                    href={selectedComment.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={selectedComment.screenshotUrl}
                      alt={`Screenshot of ${selectedComment.pageUrl}`}
                      className="max-w-full max-h-[520px] w-auto h-auto object-contain"
                      draggable={false}
                    />
                  </a>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-5 mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                      <ImageOffIcon size={16} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">No screenshot captured</p>
                      <p className="text-[11px] text-muted-foreground">Pin placed at ({selectedComment.x}, {selectedComment.y})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/60 border border-border">
                    <SelectorIcon size={12} />
                    <code className="text-[12px] font-mono text-foreground/70 break-all">{selectedComment.selector}</code>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 mb-8">
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: selectedComment.authorColor }}
                >
                  {selectedComment.authorInitial}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground">{selectedComment.author}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(selectedComment.createdAt)}</span>
                  </div>
                  <p className="text-[15px] leading-relaxed text-foreground">
                    {selectedComment.body}
                  </p>
                  {selectedComment.targetType === 'text_range' && selectedComment.anchor ? (
                    <div className="mt-3">
                      <p className="text-[13px] leading-relaxed border-l-2 border-primary bg-muted/60 px-3 py-2 rounded-md">
                        <span className="text-muted-foreground">{selectedComment.anchor.prefix}</span>
                        <span className="text-foreground font-medium">{selectedComment.anchor.selectedText}</span>
                        <span className="text-muted-foreground">{selectedComment.anchor.suffix}</span>
                      </p>
                      <div className="mt-2 text-xs font-mono text-muted-foreground">
                        {selectedComment.anchor.containerSelector} · chars {selectedComment.anchor.startOffset}–{selectedComment.anchor.endOffset}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs font-mono text-muted-foreground">
                      {selectedComment.selector}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-border bg-card px-6 py-3">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <ActionBtn
                active={selectedComment.reviewStatus === 'accepted' && selectedComment.implementationStatus !== 'done'}
                variant="accept"
                onClick={() => toggleReview(selectedComment, 'accepted')}
                shortcut="A"
              >
                <BotIcon size={14} /> Ready for Agent
              </ActionBtn>
              <ActionBtn
                active={selectedComment.implementationStatus === 'done'}
                variant="done"
                onClick={() => handleToggleDone(selectedComment.id)}
                shortcut="M"
              >
                <DoneIcon size={14} /> {selectedComment.implementationStatus === 'done' ? 'Done' : 'Mark Done'}
              </ActionBtn>
              <ActionBtn
                active={selectedComment.reviewStatus === 'rejected'}
                variant="reject"
                onClick={() => toggleReview(selectedComment, 'rejected')}
                shortcut="D"
              >
                <XIcon size={14} /> Reject
              </ActionBtn>

              <div className="w-px h-5 bg-border mx-1" />

              <ActionBtn variant="neutral" onClick={() => window.open(selectedComment.pageUrl, '_blank')}>
                <ExternalLinkIcon size={13} /> Open page
              </ActionBtn>

              <div className="flex-1" />

              <button
                onClick={goPrev}
                disabled={selectedIdx <= 0}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeftIcon size={16} />
              </button>
              <span className="text-xs font-mono text-muted-foreground tabular-nums">
                {selectedIdx + 1}/{filteredComments.length}
              </span>
              <button
                onClick={goNext}
                disabled={selectedIdx >= filteredComments.length - 1}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          </div>
        </>
      ) : selectedProject && !commentsLoading && !commentsError && projectComments.length === 0 ? (
        <ProjectEmptyState projectId={selectedProject} apiBase={apiBase} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <CursorIcon className="text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-foreground mb-1">Select a comment</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Pick a feedback item from the list to see the full context, screenshot, and actions.
          </p>
          <div className="flex gap-3 mt-6 text-xs text-muted-foreground font-mono">
            <Kbd>J</Kbd><Kbd>K</Kbd> navigate
            <span className="mx-1">·</span>
            <Kbd>A</Kbd> ready
            <span className="mx-1">·</span>
            <Kbd>D</Kbd> reject
          </div>
        </div>
      )}
    </div>
  )
}
