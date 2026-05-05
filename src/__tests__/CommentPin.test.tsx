import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommentPin } from '../components/FeedbackWidget/pin/CommentPin'
import type { Comment } from '../components/FeedbackWidget/types'

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    projectId: 'p',
    pageUrl: 'http://localhost/',
    x: 50,
    y: 50,
    selector: 'body',
    body: 'pin body',
    reviewStatus: 'open',
    createdAt: '2026-04-22T00:00:00Z',
    authorName: 'Ada',
    ...overrides,
  }
}

function renderPin(overrides: Partial<Parameters<typeof CommentPin>[0]> = {}) {
  const handlers = {
    comment: comment(),
    pinNumber: 1,
    isSelected: false,
    isHovered: false,
    isEditing: false,
    editText: '',
    onSelect: vi.fn(),
    onClearSelection: vi.fn(),
    onHoverEnter: vi.fn(),
    onHoverLeave: vi.fn(),
    onApprove: vi.fn(),
    onToggleResolve: vi.fn(),
    onStartEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onEditTextChange: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  const utils = render(<CommentPin {...handlers} />)
  return { ...utils, ...handlers }
}

describe('<CommentPin />', () => {
  it('marker click fires onSelect, hover fires hover handlers', () => {
    const { container, onSelect, onHoverEnter, onHoverLeave } = renderPin()
    const marker = container.querySelector<HTMLDivElement>('div[style*="bottom left"]')!
    fireEvent.mouseEnter(marker)
    fireEvent.mouseLeave(marker)
    fireEvent.click(marker)
    expect(onHoverEnter).toHaveBeenCalled()
    expect(onHoverLeave).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalled()
  })

  it('renders the hover tooltip with author and body when isHovered', () => {
    renderPin({ isHovered: true })
    expect(screen.getByText('Ada')).toBeDefined()
    expect(screen.getByText('pin body')).toBeDefined()
  })

  it('falls back to first-letter avatar when no authorName + no initials', () => {
    renderPin({ isSelected: true, comment: comment({ authorName: undefined }) })
    expect(screen.getByText(/^P$/)).toBeDefined()
  })

  it('detail popover scrim click fires onClearSelection', () => {
    const { container, onClearSelection } = renderPin({ isSelected: true })
    const scrim = container.querySelector<HTMLDivElement>('div[style*="z-index: 2147483645"]')!
    fireEvent.click(scrim)
    expect(onClearSelection).toHaveBeenCalled()
  })

  it('detail popover with imageUrl renders image and click opens new window', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPin({ isSelected: true, comment: comment({ imageUrl: 'http://x/a.png' }) })
    const img = document.querySelector<HTMLImageElement>('img')!
    fireEvent.click(img)
    expect(openSpy).toHaveBeenCalledWith('http://x/a.png', '_blank')
    openSpy.mockRestore()
  })

  it('detail popover edit textarea: change, focus/blur paint, Enter saves, Escape cancels', () => {
    const { onEditTextChange, onSaveEdit, onCancelEdit } = renderPin({ isSelected: true, isEditing: true, editText: 'draft' })
    const ta = document.querySelector<HTMLTextAreaElement>('textarea')!
    fireEvent.change(ta, { target: { value: 'updated' } })
    expect(onEditTextChange).toHaveBeenCalledWith('updated')

    fireEvent.focus(ta)
    fireEvent.blur(ta)

    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSaveEdit).toHaveBeenCalled()
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(onCancelEdit).toHaveBeenCalled()
    // Shift+Enter should NOT save
    onSaveEdit.mockClear()
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onSaveEdit).not.toHaveBeenCalled()
  })

  it('Cancel and Save buttons fire callbacks', () => {
    const { onCancelEdit, onSaveEdit } = renderPin({ isSelected: true, isEditing: true, editText: 'x' })
    fireEvent.click(screen.getByText('Cancel'))
    fireEvent.click(screen.getByText('Save'))
    expect(onCancelEdit).toHaveBeenCalled()
    expect(onSaveEdit).toHaveBeenCalled()
  })

  it('PinActionCluster routes Approve, Reopen, Edit, Delete to parent callbacks', () => {
    const { onApprove, onToggleResolve, onStartEdit, onDelete, getByTitle, container } = renderPin({ isSelected: true })
    fireEvent.click(getByTitle('Approve'))
    expect(onApprove).toHaveBeenCalled()

    fireEvent.click(getByTitle('More'))
    fireEvent.click(screen.getByText('Approve'))
    expect(onToggleResolve).toHaveBeenCalled()

    fireEvent.click(getByTitle('More'))
    fireEvent.click(screen.getByText('Edit'))
    expect(onStartEdit).toHaveBeenCalled()

    fireEvent.click(getByTitle('More'))
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalled()

    expect(container).toBeDefined()
  })

  it('resolved pin shows dimmed opacity unless selected/hovered', () => {
    const { container } = renderPin({ comment: comment({ reviewStatus: 'accepted' }) })
    const marker = container.querySelector<HTMLDivElement>('div[style*="bottom left"]')!
    expect(marker.style.opacity).toBe('0.4')
  })
})
