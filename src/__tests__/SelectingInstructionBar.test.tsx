import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SelectingInstructionBar } from '../components/FeedbackWidget/modal/SelectingInstructionBar'

describe('<SelectingInstructionBar />', () => {
  it('routes the exit click to onExit', () => {
    const onExit = vi.fn()
    render(<SelectingInstructionBar onExit={onExit} />)
    fireEvent.click(screen.getByText('exit'))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('mouse handlers paint exit text without throwing', () => {
    render(<SelectingInstructionBar onExit={() => {}} />)
    const exit = screen.getByText('exit')
    fireEvent.mouseEnter(exit)
    fireEvent.mouseLeave(exit)
  })
})
