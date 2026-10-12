import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BulkActionBar, BulkDeleteDialog } from './BulkActionBar'

describe('BulkActionBar', () => {
  it('stays hidden without a selection and exposes compact actions when selected', () => {
    const close = vi.fn()
    const view = render(<BulkActionBar selectedCount={0} onClose={close}><button>Move</button></BulkActionBar>)
    expect(screen.queryByRole('toolbar')).toBeNull()
    view.rerender(<BulkActionBar selectedCount={3} onClose={close}><button>Move</button></BulkActionBar>)
    expect(screen.getByRole('toolbar', { name: 'Bulk actions for 3 selected items' })).toBeInTheDocument()
    expect(screen.getByText('3 selected')).toHaveAttribute('aria-live', 'polite')
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(close).toHaveBeenCalledOnce()
    view.rerender(<BulkActionBar selectedCount={1} onClose={close}><button>Move</button></BulkActionBar>)
    expect(screen.getByRole('toolbar', { name: 'Bulk actions for 1 selected item' })).toBeInTheDocument()
    view.rerender(<BulkActionBar selectedCount={3} busy onClose={close}><button>Move</button></BulkActionBar>)
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled()
  })

  it('confirms singular deletion and dismisses only an idle backdrop', () => {
    const cancel = vi.fn()
    const confirm = vi.fn()
    const view = render(<BulkDeleteDialog selectedCount={1} busy={false} onCancel={cancel} onConfirm={confirm} />)
    expect(screen.getByText('This permanently deletes 1 Inbox item and their screenshots.')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('alertdialog').parentElement!)
    expect(cancel).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Delete 1' }))
    expect(confirm).toHaveBeenCalledOnce()
    view.rerender(<BulkDeleteDialog selectedCount={2} busy onCancel={cancel} onConfirm={confirm} />)
    expect(screen.getByText('This permanently deletes 2 Inbox items and their screenshots.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    fireEvent.mouseDown(screen.getByRole('alertdialog').parentElement!)
    expect(cancel).toHaveBeenCalledOnce()
  })
})
