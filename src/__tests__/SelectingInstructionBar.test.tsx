import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { SelectingInstructionBar } from '../components/FeedbackWidget/selecting/SelectingInstructionBar'

describe('SelectingInstructionBar', () => {
  it('renders instruction text and Esc badge', () => {
    const { getByText } = render(<SelectingInstructionBar onCancel={vi.fn()} />)
    expect(getByText('Click an element or select text to leave feedback')).not.toBeNull()
    expect(getByText('Esc')).not.toBeNull()
    expect(getByText('exit')).not.toBeNull()
  })

  it('clicking exit fires onCancel', () => {
    const onCancel = vi.fn()
    const { getByText } = render(<SelectingInstructionBar onCancel={onCancel} />)
    fireEvent.click(getByText('exit'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('exit hover swaps color back and forth', () => {
    const { getByText } = render(<SelectingInstructionBar onCancel={vi.fn()} />)
    const exit = getByText('exit') as HTMLElement
    fireEvent.mouseEnter(exit)
    expect(exit.style.color).toBe('#FFFFFF')
    fireEvent.mouseLeave(exit)
    expect(exit.style.color).toBe('#6B6560')
  })

  it('renders the success tone with custom message and labels', () => {
    const { getByText, container } = render(
      <SelectingInstructionBar
        onCancel={vi.fn()}
        message="Saved. Drop another or review comments."
        keyLabel="F"
        actionLabel="review"
        tone="success"
      />,
    )
    expect(getByText('Saved. Drop another or review comments.')).not.toBeNull()
    expect(getByText('F')).not.toBeNull()
    expect(getByText('review')).not.toBeNull()
    // Success tone paints the status dot with the accent colour.
    const dot = container.querySelector<HTMLSpanElement>('.fw-rec-dot')!
    expect(dot.style.background).toBe('#E8853D')
  })
})
