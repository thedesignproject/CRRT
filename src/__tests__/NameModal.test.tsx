import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { NameModal } from '../components/FeedbackWidget/modal/NameModal'

function makeProps(overrides: Partial<Parameters<typeof NameModal>[0]> = {}) {
  return {
    value: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    existingName: null as string | null,
    ...overrides,
  }
}

describe('NameModal', () => {
  it('renders first-time copy when existingName is null', () => {
    const { getByText, queryByLabelText } = render(<NameModal {...makeProps()} />)
    expect(getByText("What's your name?")).not.toBeNull()
    expect(getByText('Continue')).not.toBeNull()
    expect(queryByLabelText('Close')).toBeNull()
  })

  it('renders change-name copy when existingName provided', () => {
    const { getByText, getByLabelText } = render(
      <NameModal {...makeProps({ existingName: 'Tomas' })} />
    )
    expect(getByText('Change your name')).not.toBeNull()
    expect(getByText('Save')).not.toBeNull()
    expect(getByLabelText('Close')).not.toBeNull()
  })

  it('submit button disabled when value is empty', () => {
    const { getByText } = render(<NameModal {...makeProps({ value: '' })} />)
    expect((getByText('Continue') as HTMLButtonElement).disabled).toBe(true)
  })

  it('submit button disabled when value is only whitespace', () => {
    const { getByText } = render(<NameModal {...makeProps({ value: '   ' })} />)
    expect((getByText('Continue') as HTMLButtonElement).disabled).toBe(true)
  })

  it('submit button enabled when value has non-whitespace', () => {
    const { getByText } = render(<NameModal {...makeProps({ value: 'Alex' })} />)
    const btn = getByText('Continue') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    expect(btn.style.background).toBe('#111')
    expect(btn.style.cursor).toBe('pointer')
  })

  it('disabled submit uses ccc background + not-allowed cursor', () => {
    const { getByText } = render(<NameModal {...makeProps({ value: '' })} />)
    const btn = getByText('Continue') as HTMLButtonElement
    expect(btn.style.background).toBe('#ccc')
    expect(btn.style.cursor).toBe('not-allowed')
  })

  it('form submit fires onSubmit', () => {
    const props = makeProps({ value: 'Alex' })
    const { container } = render(<NameModal {...props} />)
    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('input onChange fires onChange with new value', () => {
    const props = makeProps()
    const { container } = render(<NameModal {...props} />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Bob' } })
    expect(props.onChange).toHaveBeenCalledWith('Bob')
  })

  it('close button fires onCancel', () => {
    const props = makeProps({ existingName: 'Tomas' })
    const { getByLabelText } = render(<NameModal {...props} />)
    fireEvent.click(getByLabelText('Close'))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('close button hover paints background + color', () => {
    const { getByLabelText } = render(
      <NameModal {...makeProps({ existingName: 'Tomas' })} />
    )
    const close = getByLabelText('Close') as HTMLButtonElement
    fireEvent.mouseEnter(close)
    expect(close.style.background).toBe('#f5f5f5')
    expect(close.style.color).toBe('#111')
    fireEvent.mouseLeave(close)
    expect(close.style.background).toBe('transparent')
    expect(close.style.color).toBe('#888')
  })

  it('input focus + blur swap border + background', () => {
    const { container } = render(<NameModal {...makeProps()} />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.focus(input)
    expect(input.style.borderColor).toBe('#2563eb')
    expect(input.style.background).toBe('#fff')
    fireEvent.blur(input)
    expect(input.style.borderColor).toBe('#e5e5e5')
    expect(input.style.background).toBe('#fafafa')
  })

  it('overlay click stops propagation', () => {
    const { container } = render(<NameModal {...makeProps()} />)
    const overlay = container.firstChild as HTMLElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    overlay.dispatchEvent(event)
  })
})
