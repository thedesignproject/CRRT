import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { SelectingInstructionBar } from '../components/FeedbackWidget/selecting/SelectingInstructionBar'

describe('SelectingInstructionBar', () => {
  it('renders instruction text and Esc badge', () => {
    const { getByText } = render(<SelectingInstructionBar onCancel={vi.fn()} />)
    expect(getByText('Click any element to leave feedback')).not.toBeNull()
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
    expect(exit.style.color).toBe('#111')
    fireEvent.mouseLeave(exit)
    expect(exit.style.color).toBe('#999')
  })
})
