import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AgentLauncher } from './AgentLauncher'

it('is discoverable with zero selections and announces the current count', () => {
  const onOpen = vi.fn()
  const view = render(<AgentLauncher count={0} open={false} onOpen={onOpen} />)
  const button = screen.getByRole('button', { name: 'Agents, 0 selected comments' })
  fireEvent.click(button)
  expect(onOpen).toHaveBeenCalledOnce()
  expect(button).toHaveAttribute('aria-expanded', 'false')
  expect(button.querySelector('.agent-count-badge')).toBeNull()
  view.rerender(<AgentLauncher count={2} open onOpen={onOpen} />)
  expect(screen.getByRole('button', { name: 'Agents, 2 selected comments' })).toHaveAttribute('aria-expanded', 'true')
  expect(button.querySelector('.agent-count-badge')).toHaveTextContent('2')
  view.rerender(<AgentLauncher count={1} open={false} onOpen={onOpen} />)
  expect(button.querySelector('.agent-count-badge')).toHaveTextContent('1')
  view.rerender(<AgentLauncher count={0} open={false} onOpen={onOpen} />)
  expect(button.querySelector('.agent-count-badge')).toBeNull()
})
