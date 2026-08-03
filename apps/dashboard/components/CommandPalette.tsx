import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import { truncateUrl } from '../lib/format'
import type { Comment } from '../lib/types'
import { CmdIcon, ReturnIcon, SearchIcon, type CmdIconType } from './icons'
import { Kbd } from './primitives'

type CmdItem = { id: string; type: 'comment' | 'action'; label: string; detail: string; icon: CmdIconType }

const CMD_ACTIONS: CmdItem[] = [
  { id: 'accept', type: 'action', label: 'Toggle Ready for Agent', detail: 'A', icon: 'check' },
  { id: 'done', type: 'action', label: 'Toggle Done', detail: 'M', icon: 'check' },
  { id: 'reject', type: 'action', label: 'Toggle Reject', detail: 'D', icon: 'x' },
  { id: 'toggle-sidebar', type: 'action', label: 'Toggle agent panel', detail: 'S', icon: 'sidebar' },
  { id: 'filter-all', type: 'action', label: 'Filter: All', detail: '', icon: 'filter' },
  { id: 'filter-open', type: 'action', label: 'Filter: Open', detail: '', icon: 'filter' },
  { id: 'filter-ready', type: 'action', label: 'Filter: Ready for Agent', detail: '', icon: 'filter' },
  { id: 'filter-done', type: 'action', label: 'Filter: Done', detail: '', icon: 'filter' },
]

interface CommandPaletteProps {
  onClose: () => void
  comments: Comment[]
  onSelect: (commentId: string) => void
  onAction: (action: string) => void
  selectedCommentId: string
}

export function CommandPalette({ onClose, comments, onSelect, onAction, selectedCommentId }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(h)
  }, [])

  const results = useMemo<CmdItem[]>(() => {
    const q = query.toLowerCase().trim()

    const matchedComments: CmdItem[] = comments
      .filter((c) => {
        if (!q) return true
        return (
          c.body.toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q) ||
          c.selector?.toLowerCase().includes(q) ||
          c.pageUrl?.toLowerCase().includes(q)
        )
      })
      .slice(0, 8)
      .map((c) => ({
        id: c.id,
        type: 'comment',
        label: c.body.length > 80 ? c.body.slice(0, 80) + '…' : c.body,
        detail: c.pageUrl ? `${c.author} · ${truncateUrl(c.pageUrl)}` : c.author,
        icon: 'comment',
      }))

    const matchedActions = q
      ? CMD_ACTIONS.filter((a) => a.label.toLowerCase().includes(q))
      : CMD_ACTIONS

    return q ? [...matchedComments, ...matchedActions] : [...matchedActions, ...matchedComments]
  }, [query, comments])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const el = list.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const handleSelect = useCallback(() => {
    const item = results[activeIdx]
    if (!item) return
    if (item.type === 'comment') onSelect(item.id)
    else onAction(item.id)
  }, [results, activeIdx, onSelect, onAction])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [results.length, handleSelect, onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-[20vh]">
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 bg-background/60 backdrop-blur-sm cmd-backdrop-enter"
        onClick={onClose}
      />
      <div className="relative w-full max-w-[540px] h-fit rounded-xl border border-border bg-card shadow-2xl shadow-black/40 overflow-hidden cmd-modal-enter">
        <div className="flex items-center gap-3 px-4 h-[52px] border-b border-border">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIdx(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search feedback, jump to comment, or run action…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No results for "{query}"</p>
            </div>
          ) : (
            results.map((item, i) => {
              const prevType = results[i - 1]?.type
              const showHeader = i === 0 || item.type !== prevType

              return (
                <div key={`${item.type}-${item.id}`}>
                  {showHeader && (
                    <div className="px-4 pt-2 pb-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        {item.type === 'action' ? 'Actions' : 'Comments'}
                      </span>
                    </div>
                  )}
                  <button
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      i === activeIdx
                        ? 'bg-accent text-foreground'
                        : 'text-foreground/80 hover:bg-accent/50'
                    )}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => {
                      if (item.type === 'comment') onSelect(item.id)
                      else onAction(item.id)
                    }}
                  >
                    <div className={cn(
                      'w-7 h-7 rounded-lg shrink-0 flex items-center justify-center',
                      i === activeIdx ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <CmdIcon type={item.icon} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-[13px] leading-snug truncate',
                        i === activeIdx ? 'text-foreground' : 'text-foreground/80',
                        item.type === 'comment' && item.id === selectedCommentId && 'font-semibold'
                      )}>
                        {item.label}
                      </p>
                      {item.detail && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {item.detail}
                        </p>
                      )}
                    </div>

                    {item.type === 'action' && item.detail ? (
                      <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground shrink-0">
                        {item.detail}
                      </kbd>
                    ) : (
                      i === activeIdx && (
                        <span className="text-muted-foreground shrink-0">
                          <ReturnIcon />
                        </span>
                      )
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-4 px-4 h-[36px] border-t border-border text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> select</span>
          <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
        </div>
      </div>
    </div>
  )
}
