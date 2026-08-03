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
    const { getByLabelText } = render(<PinActionCluster {...props} />)
    const approve = getByLabelText('Approve')
    fireEvent.click(approve)
    expect(props.onResolve).toHaveBeenCalledTimes(1)
  })

  it('hides Approve button when resolved', () => {
    const { queryByLabelText } = render(<PinActionCluster {...makeProps({ isResolved: true })} />)
    expect(queryByLabelText('Approve')).toBeNull()
  })

  it('toggles kebab menu open and closed', () => {
    const { getByLabelText, queryByText } = render(<PinActionCluster {...makeProps()} />)
    expect(queryByText('Edit')).toBeNull()
    fireEvent.click(getByLabelText('More options'))
    expect(queryByText('Edit')).not.toBeNull()
    fireEvent.click(getByLabelText('More options'))
    expect(queryByText('Edit')).toBeNull()
  })

  it('renders Reopen when resolved and fires onToggleResolve', () => {
    const props = makeProps({ isResolved: true })
    const { getByLabelText, getByText } = render(<PinActionCluster {...props} />)
    fireEvent.click(getByLabelText('More options'))
    fireEvent.click(getByText('Reopen'))
    expect(props.onToggleResolve).toHaveBeenCalledTimes(1)
  })

  it('renders Approve label in menu when unresolved', () => {
    const { getByLabelText, getByText } = render(<PinActionCluster {...makeProps()} />)
    fireEvent.click(getByLabelText('More options'))
    expect(getByText('Approve', { selector: 'button' })).not.toBeNull()
  })

  it('fires onEdit from menu', () => {
    const props = makeProps()
    const { getByLabelText, getByText } = render(<PinActionCluster {...props} />)
    fireEvent.click(getByLabelText('More options'))
    fireEvent.click(getByText('Edit'))
    expect(props.onEdit).toHaveBeenCalledTimes(1)
  })

  it('fires onDelete from menu', () => {
    const props = makeProps()
    const { getByLabelText, getByText } = render(<PinActionCluster {...props} />)
    fireEvent.click(getByLabelText('More options'))
    fireEvent.click(getByText('Delete'))
    expect(props.onDelete).toHaveBeenCalledTimes(1)
  })

  it('closes menu via backdrop click', () => {
    const { getByLabelText, container, queryByText } = render(<PinActionCluster {...makeProps()} />)
    fireEvent.click(getByLabelText('More options'))
    expect(queryByText('Edit')).not.toBeNull()
    const backdrop = container.querySelector('[style*="position: fixed"]') as HTMLElement
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop)
    expect(queryByText('Edit')).toBeNull()
  })

  it('stops propagation on menu container click', () => {
    const { getByLabelText, container } = render(<PinActionCluster {...makeProps()} />)
    fireEvent.click(getByLabelText('More options'))
    const menu = container.querySelector('[style*="z-index: 99999"]') as HTMLElement
    expect(menu).not.toBeNull()
    fireEvent.click(menu)
  })

  it('paints hover styles on Approve button', () => {
    const { getByLabelText } = render(<PinActionCluster {...makeProps()} />)
    const approve = getByLabelText('Approve') as HTMLButtonElement
    fireEvent.mouseEnter(approve)
    expect(approve.style.borderColor).toBe('#22c55e')
    expect(approve.style.color).toBe('#22c55e')
    fireEvent.mouseLeave(approve)
    expect(approve.style.borderColor).toBe('rgba(255, 255, 255, 0.1)')
    expect(approve.style.color).toBe('#6B6560')
  })

  it('paints hover background on More button when closed', () => {
    const { getByLabelText } = render(<PinActionCluster {...makeProps()} />)
    const more = getByLabelText('More options') as HTMLButtonElement
    fireEvent.mouseEnter(more)
    expect(more.style.background).toBe('rgba(255, 255, 255, 0.04)')
    fireEvent.mouseLeave(more)
    expect(more.style.background).toBe('transparent')
  })

  it('skips More hover paint when menu open', () => {
    const { getByLabelText } = render(<PinActionCluster {...makeProps()} />)
    const more = getByLabelText('More options') as HTMLButtonElement
    fireEvent.click(more)
    const bgAfterOpen = more.style.background
    fireEvent.mouseEnter(more)
    expect(more.style.background).toBe(bgAfterOpen)
    fireEvent.mouseLeave(more)
    expect(more.style.background).toBe(bgAfterOpen)
  })

  it('paints hover on menu items', () => {
    const { getByLabelText, getByText } = render(<PinActionCluster {...makeProps()} />)
    fireEvent.click(getByLabelText('More options'))
    const approveItem = getByText('Approve', { selector: 'button' })
    fireEvent.mouseEnter(approveItem)
    expect((approveItem as HTMLElement).style.background).toBe('rgba(255, 255, 255, 0.04)')
    fireEvent.mouseLeave(approveItem)
    expect((approveItem as HTMLElement).style.background).toBe('none none')

    const editItem = getByText('Edit')
    fireEvent.mouseEnter(editItem)
    expect((editItem as HTMLElement).style.background).toBe('rgba(255, 255, 255, 0.04)')
    fireEvent.mouseLeave(editItem)
    expect((editItem as HTMLElement).style.background).toBe('none none')

    const deleteItem = getByText('Delete')
    fireEvent.mouseEnter(deleteItem)
    expect((deleteItem as HTMLElement).style.background).toBe('rgba(239, 68, 68, 0.08)')
    fireEvent.mouseLeave(deleteItem)
    expect((deleteItem as HTMLElement).style.background).toBe('none none')
  })

  it('omits the View list item when onViewList is not provided', () => {
    const { getByLabelText, queryByText } = render(<PinActionCluster {...makeProps()} />)
    fireEvent.click(getByLabelText('More options'))
    expect(queryByText('View list')).toBeNull()
  })

  it('renders View list when onViewList is provided and fires the callback + hover paints', () => {
    const onViewList = vi.fn()
    const { getByLabelText, getByText, queryByText } = render(
      <PinActionCluster {...makeProps({ onViewList })} />,
    )
    fireEvent.click(getByLabelText('More options'))
    const viewList = getByText('View list') as HTMLButtonElement
    fireEvent.mouseEnter(viewList)
    expect(viewList.style.background).toBe('rgba(255, 255, 255, 0.04)')
    fireEvent.mouseLeave(viewList)
    expect(viewList.style.background).toBe('none none')
    fireEvent.click(viewList)
    expect(onViewList).toHaveBeenCalledTimes(1)
    // Menu closes after click.
    expect(queryByText('View list')).toBeNull()
  })
})
