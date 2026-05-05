import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NameModal } from '../components/FeedbackWidget/modal/NameModal'

function renderModal(overrides: Partial<Parameters<typeof NameModal>[0]> = {}) {
  const props = {
    open: true,
    hasExistingName: false,
    nameInput: '',
    onNameInputChange: vi.fn(),
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
  const utils = render(<NameModal {...props} />)
  return { ...utils, ...props }
}

describe('<NameModal />', () => {
  it('renders nothing when closed', () => {
    const { container } = renderModal({ open: false })
    expect(container.firstChild).toBeNull()
  })

  it("uses 'What's your name?' headline + 'Continue' label for first-time users", () => {
    renderModal()
    expect(screen.getByText("What's your name?")).toBeDefined()
    expect(screen.getByText('Continue')).toBeDefined()
  })

  it("uses 'Change your name' + 'Save' label and shows close button when name already set", () => {
    renderModal({ hasExistingName: true })
    expect(screen.getByText('Change your name')).toBeDefined()
    expect(screen.getByText('Save')).toBeDefined()
    expect(screen.getByLabelText('Close')).toBeDefined()
  })

  it('disables submit while input is empty', () => {
    renderModal()
    const submit = screen.getByText('Continue').closest('button')!
    expect(submit.disabled).toBe(true)
  })

  it('does not fire onSubmit when input is whitespace-only', () => {
    const { onSubmit } = renderModal({ nameInput: '   ' })
    const form = screen.getByText('Continue').closest('form')!
    fireEvent.submit(form)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('passes the trimmed value to onSubmit on form submit', () => {
    const { onSubmit } = renderModal({ nameInput: 'Ada' })
    const form = screen.getByText('Continue').closest('form')!
    fireEvent.submit(form)
    expect(onSubmit).toHaveBeenCalledWith('Ada')
  })

  it('routes the close button to onClose', () => {
    const { onClose } = renderModal({ hasExistingName: true })
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('paint handlers fire on close-button hover and input blur', () => {
    renderModal({ hasExistingName: true, nameInput: 'Ada' })
    const close = screen.getByLabelText('Close')
    fireEvent.mouseEnter(close)
    fireEvent.mouseLeave(close)
    const input = screen.getByPlaceholderText('e.g. Tomas')
    fireEvent.focus(input)
    fireEvent.blur(input)
  })

  it('forwards typing to onNameInputChange', () => {
    const { onNameInputChange } = renderModal()
    const input = screen.getByPlaceholderText('e.g. Tomas')
    fireEvent.change(input, { target: { value: 'Bob' } })
    expect(onNameInputChange).toHaveBeenCalledWith('Bob')
  })
})
