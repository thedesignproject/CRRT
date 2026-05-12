import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { PinActionCluster } from '../components/FeedbackWidget/pin/PinActionCluster'

function makeProps(overrides: Partial<Parameters<typeof PinActionCluster>[0]> = {}) {
  return {
    isResolved: false,
    onResolve: vi.fn(),
    onToggleResolve: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
}

describe('PinActionCluster', () => {
  it('shows Approve button when unresolved and fires onResolve', () => {
    const props = makeProps()
    const { getByTitle } = render(<PinActionCluster {...props} />)
    const approve = getByTitle('Approve')
    fireEvent.click(approve)
    expect(props.onResolve).toHaveBeenCalledTimes(1)
  })

  it('hides Approve button when resolved', () => {
    const { queryByTitle } = render(<PinActionCluster {...makeProps({ isResolved: true })} />)
    expect(queryByTitle('Approve')).toBeNull()
  })

  it('toggles kebab menu open and closed', () => {
    const { getByTitle, queryByText } = render(<PinActionCluster {...makeProps()} />)
    expect(queryByText('Edit')).toBeNull()
    fireEvent.click(getByTitle('More'))
    expect(queryByText('Edit')).not.toBeNull()
    fireEvent.click(getByTitle('More'))
    expect(queryByText('Edit')).toBeNull()
  })

  it('renders Reopen when resolved and fires onToggleResolve', () => {
    const props = makeProps({ isResolved: true })
    const { getByTitle, getByText } = render(<PinActionCluster {...props} />)
    fireEvent.click(getByTitle('More'))
    fireEvent.click(getByText('Reopen'))
    expect(props.onToggleResolve).toHaveBeenCalledTimes(1)
  })

  it('renders Approve label in menu when unresolved', () => {
    const { getByTitle, getByText } = render(<PinActionCluster {...makeProps()} />)
    fireEvent.click(getByTitle('More'))
    expect(getByText('Approve', { selector: 'button' })).not.toBeNull()
  })

  it('fires onEdit from menu', () => {
    const props = makeProps()
    const { getByTitle, getByText } = render(<PinActionCluster {...props} />)
    fireEvent.click(getByTitle('More'))
    fireEvent.click(getByText('Edit'))
    expect(props.onEdit).toHaveBeenCalledTimes(1)
  })

  it('fires onDelete from menu', () => {
    const props = makeProps()
    const { getByTitle, getByText } = render(<PinActionCluster {...props} />)
    fireEvent.click(getByTitle('More'))
    fireEvent.click(getByText('Delete'))
    expect(props.onDelete).toHaveBeenCalledTimes(1)
  })

  it('closes menu via backdrop click', () => {
    const { getByTitle, container, queryByText } = render(<PinActionCluster {...makeProps()} />)
    fireEvent.click(getByTitle('More'))
    expect(queryByText('Edit')).not.toBeNull()
    const backdrop = container.querySelector('[style*="position: fixed"]') as HTMLElement
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop)
    expect(queryByText('Edit')).toBeNull()
  })

  it('stops propagation on menu container click', () => {
    const { getByTitle, container } = render(<PinActionCluster {...makeProps()} />)
    fireEvent.click(getByTitle('More'))
    const menu = container.querySelector('[style*="z-index: 99999"]') as HTMLElement
    expect(menu).not.toBeNull()
    fireEvent.click(menu)
  })

  it('paints hover styles on Approve button', () => {
    const { getByTitle } = render(<PinActionCluster {...makeProps()} />)
    const approve = getByTitle('Approve') as HTMLButtonElement
    fireEvent.mouseEnter(approve)
    expect(approve.style.borderColor).toBe('#22c55e')
    expect(approve.style.color).toBe('#22c55e')
    fireEvent.mouseLeave(approve)
    expect(approve.style.borderColor).toBe('#d4d4d4')
    expect(approve.style.color).toBe('#888')
  })

  it('paints hover background on More button when closed', () => {
    const { getByTitle } = render(<PinActionCluster {...makeProps()} />)
    const more = getByTitle('More') as HTMLButtonElement
    fireEvent.mouseEnter(more)
    expect(more.style.background).toBe('#f5f5f5')
    fireEvent.mouseLeave(more)
    expect(more.style.background).toBe('transparent')
  })

  it('skips More hover paint when menu open', () => {
    const { getByTitle } = render(<PinActionCluster {...makeProps()} />)
    const more = getByTitle('More') as HTMLButtonElement
    fireEvent.click(more)
    const bgAfterOpen = more.style.background
    fireEvent.mouseEnter(more)
    expect(more.style.background).toBe(bgAfterOpen)
    fireEvent.mouseLeave(more)
    expect(more.style.background).toBe(bgAfterOpen)
  })

  it('paints hover on Reopen/Edit/Delete menu items', () => {
    const { getByTitle, getByText } = render(<PinActionCluster {...makeProps()} />)
    fireEvent.click(getByTitle('More'))
    const approveItem = getByText('Approve', { selector: 'button' })
    fireEvent.mouseEnter(approveItem)
    expect((approveItem as HTMLElement).style.background).toBe('#f5f5f5')
    fireEvent.mouseLeave(approveItem)
    expect((approveItem as HTMLElement).style.background).toBe('none none')

    const editItem = getByText('Edit')
    fireEvent.mouseEnter(editItem)
    expect((editItem as HTMLElement).style.background).toBe('#f5f5f5')
    fireEvent.mouseLeave(editItem)
    expect((editItem as HTMLElement).style.background).toBe('none none')

    const deleteItem = getByText('Delete')
    fireEvent.mouseEnter(deleteItem)
    expect((deleteItem as HTMLElement).style.background).toBe('#fef2f2')
    fireEvent.mouseLeave(deleteItem)
    expect((deleteItem as HTMLElement).style.background).toBe('none none')
  })
})
