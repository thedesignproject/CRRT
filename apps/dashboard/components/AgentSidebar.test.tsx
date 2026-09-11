import { render, screen, within } from '@testing-library/react'
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
      selectedCommentId=""
      onSelectComment={vi.fn()}
      agentSession={{ slug: 'share', token: 'token', docUrl: 'https://example.com/share' }}
      agentEvents={[]}
      agentError={null}
      agentConnected
      selectedAgent="codex"
      setSelectedAgent={vi.fn()}
      selectedAgentMeta={{ id: 'codex', name: 'Codex', hint: 'Paste prompt in prompt', target: 'codex' }}
      agentDropdownOpen={false}
      setAgentDropdownOpen={vi.fn()}
      copyStatus="idle"
      onCopySessionLink={vi.fn()}
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
  })
})
