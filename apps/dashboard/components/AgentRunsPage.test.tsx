import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ShareEventsResponse } from '../api'
import type { Comment, ImplStatus } from '../lib/types'
import { AgentRunsPage } from './AgentRunsPage'

const comment = (id: string, implementationStatus: ImplStatus): Comment => ({
  id, projectId: 'p', pageUrl: 'https://example.com', selector: 'h1', x: 0, y: 0, body: `Feedback ${id}`,
  reviewStatus: 'accepted', implementationStatus, createdAt: '', updatedAt: '',
  author: 'Ada', authorInitial: 'A', authorColor: '#000', screenshotUrl: null, claimedByAgentId: null, targetType: 'element_point', anchor: null, githubIssue: null,
})

const event = (id: number, eventType: string, createdAt = '2026-11-19T10:05:00Z'): ShareEventsResponse['events'][number] =>
  ({ id, shareId: 's', commentId: 'c1', actorType: 'agent', actorId: 'codex', eventType, payload: {}, createdAt })

function page(over: Partial<Parameters<typeof AgentRunsPage>[0]> = {}) {
  const props = {
    projectName: 'Acme', agentName: 'Codex', connected: true,
    queue: [comment('c1', 'in_progress'), comment('c2', 'done'), comment('c3', 'ready_for_testing')],
    events: Array.from({ length: 10 }, (_, i) => event(i + 1, i === 9 ? 'comment.started' : 'comment.claimed', i === 0 ? 'bad' : undefined)),
    agentError: null, agentErrorCode: null, selectedCommentId: '',
    onUpgrade: vi.fn(), onOpenComment: vi.fn(), onOpenNextSteps: vi.fn(),
    ...over,
  }
  return { props, ui: <AgentRunsPage {...props} /> }
}

it('shows the live run with its latest steps and queue', () => {
  const { props, ui } = page({ notice: '2 selected items copied for Codex.' })
  render(ui)
  expect(screen.getByText('Codex is working in Acme.')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('2 selected items copied for Codex.')
  const card = screen.getByRole('region', { name: 'Codex · Acme run' })
  expect(within(card).getByText('Working through 1 next step.')).toBeInTheDocument()
  const steps = within(card).getAllByRole('listitem').filter((li) => li.closest('ol'))
  expect(steps).toHaveLength(8)
  expect(within(card).getAllByLabelText('running')).toHaveLength(1)
  fireEvent.click(within(screen.getByRole('region', { name: 'Agent queue' })).getAllByRole('button')[0])
  expect(props.onOpenComment).toHaveBeenCalledWith('c1')
})

it('counts open work and leaves the clock blank for unreadable times', () => {
  render(page({ queue: [comment('c1', 'claimed'), comment('c2', 'unassigned')], events: [event(1, 'comment.claimed', 'bad')] }).ui)
  expect(screen.getByText('Working through 2 next steps.')).toBeInTheDocument()
  expect(screen.getByRole('list', { name: 'Agent steps' }).querySelector('span')!.textContent).toBe('')
})

it('points to Next steps when no agent is connected and surfaces errors', () => {
  const idle = page({ connected: false })
  const view = render(idle.ui)
  expect(screen.getByText('No agent is connected to Acme.')).toBeInTheDocument()
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Go to Next steps' }))
  expect(idle.props.onOpenNextSteps).toHaveBeenCalledOnce()
  view.rerender(page({ agentError: 'No seat', agentErrorCode: 'seat_limit_reached' }).ui)
  expect(screen.getByText('No Agent seats are available for this project.')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: /run$/ })).toBeNull()
})
