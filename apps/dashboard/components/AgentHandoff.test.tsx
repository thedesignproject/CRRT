import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Comment, ImplStatus } from '../lib/types'
import { AgentError, FirstTimeHint, HandoffCTA, LiveQueue, WaitingForAgent } from './AgentHandoff'

function comment(id: string, implementationStatus: ImplStatus): Comment {
  return {
    id,
    projectId: 'project-1',
    pageUrl: 'https://example.com',
    selector: '#hero',
    x: 10,
    y: 20,
    body: `Feedback ${id}`,
    reviewStatus: 'accepted',
    implementationStatus,
    claimedByAgentId: 'codex-local',
    createdAt: '2026-09-11T00:00:00Z',
    updatedAt: '2026-09-11T00:00:00Z',
    author: 'Ada',
    authorInitial: 'A',
    authorColor: '#6366F1',
    screenshotUrl: null,
    targetType: 'element_point',
    anchor: null,
    githubIssue: null,
  }
}

const codex = { id: 'codex', name: 'Codex', hint: 'Paste prompt in prompt', target: 'codex' as const }

describe('agent handoff pieces', () => {
  it('places ready-for-testing work between the agent queue and Done', () => {
    const onSelect = vi.fn()
    render(<LiveQueue
      projectComments={[
        comment('done', 'done'),
        comment('testing', 'ready_for_testing'),
        comment('ready', 'unassigned'),
        { ...comment('rejected', 'unassigned'), reviewStatus: 'rejected' },
      ]}
      events={[
        { id: 1, shareId: 's', commentId: 'ready', actorType: 'agent', actorId: 'codex', eventType: 'comment.claimed', payload: {}, createdAt: '' },
        { id: 3, shareId: 's', commentId: 'ready', actorType: 'agent', actorId: 'codex', eventType: 'comment.started', payload: {}, createdAt: '' },
        { id: 2, shareId: 's', commentId: 'ready', actorType: 'agent', actorId: 'codex', eventType: 'comment.claimed', payload: {}, createdAt: '' },
        { id: 4, shareId: 's', commentId: null, actorType: 'agent', actorId: 'codex', eventType: 'presence.updated', payload: {}, createdAt: '' },
      ]}
      selectedCommentId="ready"
      onSelectComment={onSelect}
    />)

    const queue = screen.getByRole('region', { name: 'Agent queue' })
    const queueItems = within(queue).getAllByRole('button')
    expect(queueItems.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Ready'),
      expect.stringContaining('Testing'),
      expect.stringContaining('Done'),
    ])
    expect(queueItems[0]).toHaveTextContent('codex started')
    expect(within(queue).getByText('Testing')).toHaveClass('text-status-ready-for-testing')
    const active = within(queue).getByRole('button', { current: true })
    expect(active).toHaveClass('bg-accent')
    fireEvent.click(queueItems[1])
    expect(onSelect).toHaveBeenCalledWith('testing')
  })

  it('says when the queue is empty and waits for the agent only after a copy', () => {
    const view = render(<LiveQueue projectComments={[]} events={[]} selectedCommentId="" onSelectComment={vi.fn()} />)
    expect(screen.getByText('Queue is empty.')).toBeInTheDocument()
    view.rerender(<WaitingForAgent agentName="Codex" active={false} />)
    expect(screen.queryByText('Waiting for Codex…')).toBeNull()
    view.rerender(<WaitingForAgent agentName="Codex" active />)
    expect(screen.getByText('Waiting for Codex…')).toBeInTheDocument()
  })

  it('copies the handoff prompt and switches agents', () => {
    const copy = vi.fn()
    const setAgent = vi.fn()
    const setOpen = vi.fn()
    const props = { selectedAgent: 'codex', setSelectedAgent: setAgent, selectedAgentMeta: codex, agentDropdownOpen: false, setAgentDropdownOpen: setOpen, copyStatus: 'idle' as const, onCopySessionLink: copy, disabled: false, count: 2 }
    const view = render(<HandoffCTA {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send 2 crrts to Codex' }))
    expect(copy).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Choose agent' }))
    expect(setOpen).toHaveBeenCalled()
    view.rerender(<HandoffCTA {...props} count={1} agentDropdownOpen />)
    expect(screen.getByRole('button', { name: 'Send 1 crrt to Codex' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Claude Code' }))
    expect(setAgent).toHaveBeenCalledWith('claude-code')
    expect(setOpen).toHaveBeenCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Close agent selector' }))
    for (const [status, label] of [['copying', 'Copying…'], ['copied', 'Paste into Codex'], ['error', 'Copy failed — try again']] as const) {
      view.rerender(<HandoffCTA {...props} copyStatus={status} />)
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    view.rerender(<HandoffCTA {...props} disabled />)
    expect(screen.getByRole('button', { name: 'Send 2 crrts to Codex' })).toBeDisabled()
  })

  it('shows the first-time hint until a copy', () => {
    const view = render(<FirstTimeHint agentName="Codex" dismissed={false} />)
    expect(screen.getByText(/Paste into Codex/)).toBeInTheDocument()
    view.rerender(<FirstTimeHint agentName="Codex" dismissed />)
    expect(screen.queryByText(/Paste into Codex/)).toBeNull()
    expect(localStorage.getItem('crrt:dashboard:handoff-hint-seen')).toBe('1')
    view.unmount()
    render(<FirstTimeHint agentName="Codex" dismissed={false} />)
    expect(screen.queryByText(/Paste into Codex/)).toBeNull()
    localStorage.removeItem('crrt:dashboard:handoff-hint-seen')
  })

  it('offers checkout only to an owner who can upgrade the project', () => {
    const upgrade = vi.fn()
    const view = render(<AgentError message="Upgrade the plan" code="upgrade_required" onUpgrade={upgrade} />)
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade plan' }))
    expect(upgrade).toHaveBeenCalledOnce()

    view.rerender(<AgentError message="Ask the owner" code="owner_upgrade_required" onUpgrade={upgrade} />)
    expect(screen.getByText('Ask the project owner to upgrade the plan.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upgrade plan' })).toBeNull()

    view.rerender(<AgentError message="No seat" code="seat_limit_reached" onUpgrade={upgrade} />)
    expect(screen.getByText('No Agent seats are available for this project.')).toBeInTheDocument()

    view.rerender(<AgentError message="Project not found" code={null} onUpgrade={upgrade} />)
    expect(screen.getByText("Couldn't open a session for this project.")).toBeInTheDocument()
    expect(screen.queryByText(/Switch projects/)).toBeNull()

    view.rerender(<AgentError message="Lost connection" code={null} onUpgrade={upgrade} />)
    expect(screen.getByText('Lost connection to the agent session.')).toBeInTheDocument()

    view.rerender(<AgentError message="Network down" code={null} onUpgrade={upgrade} />)
    expect(screen.getByText("Couldn't open a session.")).toBeInTheDocument()
  })

  it('retries in place unless access or billing blocks the session', () => {
    const retry = vi.fn()
    const view = render(<AgentError message="Share could not be created" code={null} onUpgrade={vi.fn()} onRetry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()

    view.rerender(<AgentError message="Feedback changed. Review the selection and retry." code="invalid_selection" onUpgrade={vi.fn()} onRetry={retry} />)
    expect(screen.getByText('Feedback changed while the session was opening.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    view.rerender(<AgentError message="Select up to 500 ready comments in the feedback list to send to Agent." code={null} onUpgrade={vi.fn()} onRetry={retry} />)
    expect(screen.getByText('Select up to 500 ready comments in the feedback list to send to Agent.')).toBeInTheDocument()

    for (const code of ['forbidden', 'project_access_denied']) {
      view.rerender(<AgentError message="Agent is unavailable for this project" code={code} onUpgrade={vi.fn()} onRetry={retry} />)
      expect(screen.getByText('Agent is unavailable for your project role.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    }

    view.rerender(<AgentError message="Network down" code={null} onUpgrade={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
