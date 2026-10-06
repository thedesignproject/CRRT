import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentLauncher } from './AgentLauncher'

describe('<AgentLauncher />', () => {
  it('opens the live Agent sidebar and announces its queue state', () => {
    const onOpen = vi.fn()
    const view = render(<AgentLauncher readyCount={3} open={false} onOpen={onOpen} />)
    const launcher = screen.getByRole('button', { name: 'Agents, 3 ready' })
    expect(launcher).toHaveAttribute('aria-controls', 'agent-sidebar')
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('3')).toBeInTheDocument()
    fireEvent.click(launcher)
    expect(onOpen).toHaveBeenCalledOnce()

    view.rerender(<AgentLauncher readyCount={0} open onOpen={onOpen} />)
    expect(screen.getByRole('button', { name: 'Agents, 0 ready' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText('3')).toBeNull()
  })

  it('stays visible but inert when Agents are unavailable', () => {
    render(<AgentLauncher readyCount={2} open={false} disabled unavailableReason="Select a project to use Agents." />)
    const launcher = screen.getByRole('button', { name: 'Agents unavailable: Select a project to use Agents.' })
    expect(launcher).toBeDisabled()
    expect(launcher).toHaveAttribute('title', 'Select a project to use Agents.')
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(launcher)
    expect(launcher).toBeDisabled()
  })
})
