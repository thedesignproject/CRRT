import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Comment, ImplStatus } from '../lib/types'
import { AgentSidebar } from './AgentSidebar'

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

describe('<AgentSidebar /> testing queue', () => {
  it('places ready-for-testing work between the agent queue and Done', () => {
    render(<AgentSidebar
      selectedProject="project-1"
      projectComments={[
        comment('done', 'done'),
        comment('testing', 'ready_for_testing'),
        comment('ready', 'unassigned'),
      ]}
      readyCount={1}
      filtered={false}
      selectedCommentId="ready"
      onSelectComment={vi.fn()}
      agentSession={{ shareId: 'share-id', slug: 'share', token: 'token', docUrl: 'https://example.com/share' }}
      agentEvents={[]}
      agentError={null}
      agentErrorCode={null}
      agentConnected
      selectedAgent="codex"
      setSelectedAgent={vi.fn()}
      selectedAgentMeta={{ id: 'codex', name: 'Codex', hint: 'Paste prompt in prompt', target: 'codex' }}
      agentDropdownOpen={false}
      setAgentDropdownOpen={vi.fn()}
      copyStatus="idle"
      onCopySessionLink={vi.fn()}
      onUpgrade={vi.fn()}
      onClose={vi.fn()}
    />)

    const queue = screen.getByRole('region', { name: 'Agent queue' })
    const queueItems = within(queue).getAllByRole('button')
    expect(queueItems.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Ready'),
      expect.stringContaining('Ready for testing'),
      expect.stringContaining('Done'),
    ])
    expect(within(queue).getByText('Ready for testing')).toHaveClass('text-status-ready-for-testing')
    const active = within(queue).getByRole('button', { current: true })
    expect(active).toHaveClass('bg-accent')
    expect(active.className).not.toContain('border-l')
  })

  it('offers checkout only to an owner who can upgrade the project', () => {
    const upgrade = vi.fn()
    const props = {
      selectedProject: 'project-1', projectComments: [], readyCount: 0, filtered: false,
      selectedCommentId: '', onSelectComment: vi.fn(), agentSession: null, agentEvents: [],
      agentConnected: false, selectedAgent: 'codex', setSelectedAgent: vi.fn(),
      selectedAgentMeta: { id: 'codex', name: 'Codex', hint: 'Paste prompt in prompt', target: 'codex' as const },
      agentDropdownOpen: false, setAgentDropdownOpen: vi.fn(), copyStatus: 'idle' as const,
      onCopySessionLink: vi.fn(), onUpgrade: upgrade, onClose: vi.fn(),
    }
    const view = render(<AgentSidebar {...props} agentError="Upgrade the plan" agentErrorCode="upgrade_required" />)
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade plan' }))
    expect(upgrade).toHaveBeenCalledOnce()

    view.rerender(<AgentSidebar {...props} agentError="Ask the owner" agentErrorCode="owner_upgrade_required" />)
    expect(screen.getByText('Ask the project owner to upgrade the plan.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upgrade plan' })).toBeNull()

    view.rerender(<AgentSidebar {...props} agentError="No seat" agentErrorCode="seat_limit_reached" />)
    expect(screen.getByText('No Agent seats are available for this project.')).toBeInTheDocument()

    view.rerender(<AgentSidebar {...props} agentError="Project not found" agentErrorCode={null} />)
    expect(screen.getByText("Couldn't open a session for this project.")).toBeInTheDocument()
    expect(screen.getByText(/Switch projects and come back/)).toBeInTheDocument()

    view.rerender(<AgentSidebar {...props} agentError="Lost connection" agentErrorCode={null} />)
    expect(screen.getByText('Lost connection to the agent session.')).toBeInTheDocument()

    view.rerender(<AgentSidebar {...props} agentError="Network down" agentErrorCode={null} />)
    expect(screen.getByText("Couldn't open a session.")).toBeInTheDocument()
  })
})
