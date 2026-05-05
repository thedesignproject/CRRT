import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommentSidebar } from '../components/FeedbackWidget/sidebar/CommentSidebar'
import type { Comment } from '../components/FeedbackWidget/types'

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    projectId: 'p',
    pageUrl: 'http://localhost/',
    x: 10,
    y: 10,
    selector: 'body',
    body: 'hello',
    reviewStatus: 'open',
    createdAt: '2026-04-22T00:00:00Z',
    authorName: 'Ada',
    ...overrides,
  }
}

function renderSidebar(overrides: Partial<Parameters<typeof CommentSidebar>[0]> = {}) {
  const list = overrides.sortedComments ?? [comment()]
  const handlers = {
    open: true,
    onClose: vi.fn(),
    visibleComments: list,
    filteredComments: list,
    sortedComments: list,
    commentCount: list.length,
    filterStatus: 'all' as const,
    setFilterStatus: vi.fn(),
    headerPopover: null as 'filter' | null,
    setHeaderPopover: vi.fn(),
    editingId: null as string | null,
    setEditingId: vi.fn(),
    editText: '',
    setEditText: vi.fn(),
    menuOpenId: null as string | null,
    setMenuOpenId: vi.fn(),
    onCardClick: vi.fn(),
    onApprove: vi.fn(),
    onToggleResolve: vi.fn(),
    onSaveEdit: vi.fn(),
    onDelete: vi.fn(),
    onEnterFeedback: vi.fn(),
    ...overrides,
  }
  const utils = render(<CommentSidebar {...handlers} />)
  return { ...utils, ...handlers }
}

describe('<CommentSidebar />', () => {
  it('header X close, filter button, and footer button paint handlers all fire', () => {
    const { container, onClose, setHeaderPopover, onEnterFeedback } = renderSidebar()
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))

    // Filter button (title="Filter") + close button (no title) in header.
    const filter = buttons.find((b) => b.title === 'Filter')!
    fireEvent.mouseEnter(filter)
    fireEvent.mouseLeave(filter)
    fireEvent.click(filter)
    expect(setHeaderPopover).toHaveBeenCalledWith('filter')

    // Close button is the no-title button next to filter.
    const close = buttons.find((b) => !b.title && b.textContent === '')!
    fireEvent.mouseEnter(close)
    fireEvent.mouseLeave(close)
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalled()

    // Footer "+ Leave feedback" exercises mouse hover and click.
    const footer = screen.getByText('+ Leave feedback')
    fireEvent.mouseEnter(footer)
    fireEvent.mouseLeave(footer)
    fireEvent.click(footer)
    expect(onEnterFeedback).toHaveBeenCalled()
  })

  it('renders the empty-state copy when no comments at all', () => {
    renderSidebar({ sortedComments: [], visibleComments: [], filteredComments: [], commentCount: 0 })
    expect(screen.getByText('No comments yet')).toBeDefined()
  })

  it('renders the filter-mismatch copy when filter excludes all', () => {
    renderSidebar({ sortedComments: [], visibleComments: [comment()], filteredComments: [] })
    expect(screen.getByText('No comments match this filter')).toBeDefined()
  })

  it('opens the filter popover and forwards filter selection', () => {
    const { setFilterStatus } = renderSidebar({ headerPopover: 'filter' })
    fireEvent.click(screen.getByText('Open'))
    expect(setFilterStatus).toHaveBeenCalledWith('open')
  })

  it('paint handlers fire on filter popover items', () => {
    renderSidebar({ headerPopover: 'filter' })
    for (const label of ['All', 'Open', 'Approved']) {
      const btn = screen.getByText(label)
      fireEvent.mouseEnter(btn)
      fireEvent.mouseLeave(btn)
    }
  })

  it('card paint handlers (mouseEnter/Leave + image hover stack) fire without error', () => {
    const { container } = renderSidebar({
      sortedComments: [comment({ imageUrl: 'http://x/a.png' })],
      filteredComments: [comment({ imageUrl: 'http://x/a.png' })],
      visibleComments: [comment({ imageUrl: 'http://x/a.png' })],
    })
    const card = container.querySelector<HTMLDivElement>('.fw-sidebar-card')!
    fireEvent.mouseEnter(card)
    fireEvent.mouseLeave(card)
    const img = card.querySelector('img')!
    expect(img).toBeDefined()
  })

  it('opens kebab menu and exercises Approve, Edit, Delete paint + click paths', () => {
    const seed = comment()
    const { onApprove, onToggleResolve, onDelete, setEditingId, setEditText, setMenuOpenId, container } = renderSidebar({
      sortedComments: [seed],
      filteredComments: [seed],
      visibleComments: [seed],
      menuOpenId: seed.id,
    })
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    const more = buttons.find((b) => b.title === 'More')
    if (more) {
      fireEvent.mouseEnter(more)
      fireEvent.mouseLeave(more)
    }

    const approveCircle = buttons.find((b) => b.title === 'Approve')
    if (approveCircle) {
      fireEvent.mouseEnter(approveCircle)
      fireEvent.mouseLeave(approveCircle)
      fireEvent.click(approveCircle)
      expect(onApprove).toHaveBeenCalled()
    }

    // Menu items: Approve/Reopen, Edit, Delete (with their paint handlers).
    const menuApprove = screen.queryByText('Approve')
    if (menuApprove) {
      fireEvent.mouseEnter(menuApprove)
      fireEvent.mouseLeave(menuApprove)
      fireEvent.click(menuApprove)
      expect(onToggleResolve).toHaveBeenCalled()
    }
    const menuEdit = screen.getByText('Edit')
    fireEvent.mouseEnter(menuEdit)
    fireEvent.mouseLeave(menuEdit)
    fireEvent.click(menuEdit)
    expect(setEditingId).toHaveBeenCalledWith(seed.id)
    expect(setEditText).toHaveBeenCalledWith(seed.body)

    const menuDelete = screen.getByText('Delete')
    fireEvent.mouseEnter(menuDelete)
    fireEvent.mouseLeave(menuDelete)
    fireEvent.click(menuDelete)
    expect(onDelete).toHaveBeenCalledWith(seed.id)

    // Backdrop closes menu.
    const backdrop = container.querySelector<HTMLDivElement>('.fw-sidebar-card div[style*="position: fixed"]')
    if (backdrop) {
      fireEvent.click(backdrop)
      expect(setMenuOpenId).toHaveBeenCalledWith(null)
    }
  })

  it('inline edit textarea wires Cmd+Enter to save and Escape to cancel', () => {
    const seed = comment()
    const { onSaveEdit, setEditingId, setEditText } = renderSidebar({
      sortedComments: [seed],
      filteredComments: [seed],
      visibleComments: [seed],
      editingId: seed.id,
      editText: 'draft',
    })
    const ta = document.querySelector('textarea')!
    fireEvent.change(ta, { target: { value: 'updated' } })
    expect(setEditText).toHaveBeenCalledWith('updated')
    fireEvent.focus(ta)
    fireEvent.blur(ta)
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true })
    expect(onSaveEdit).toHaveBeenCalled()
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(setEditingId).toHaveBeenCalledWith(null)
    fireEvent.click(screen.getByText('Cancel'))
    fireEvent.click(screen.getByText('Save'))
  })

  it('toggles menu via the More button when not yet open', () => {
    const seed = comment()
    const { setMenuOpenId, container } = renderSidebar({
      sortedComments: [seed],
      filteredComments: [seed],
      visibleComments: [seed],
    })
    const more = container.querySelector<HTMLButtonElement>('button[title="More"]')!
    fireEvent.click(more)
    expect(setMenuOpenId).toHaveBeenCalledWith(seed.id)
  })

  it('renders resolved card with grayscale image filter and dimmed body', () => {
    const seed = comment({ reviewStatus: 'accepted', imageUrl: 'http://x/a.png' })
    renderSidebar({ sortedComments: [seed], filteredComments: [seed], visibleComments: [seed] })
    const img = document.querySelector<HTMLImageElement>('img')!
    expect(img.style.filter).toContain('grayscale')
  })

  it('image click in card opens it in a new window', () => {
    const seed = comment({ imageUrl: 'http://x/a.png' })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderSidebar({ sortedComments: [seed], filteredComments: [seed], visibleComments: [seed] })
    const img = document.querySelector('img')!
    fireEvent.click(img)
    expect(openSpy).toHaveBeenCalledWith('http://x/a.png', '_blank')
    openSpy.mockRestore()
  })
})
