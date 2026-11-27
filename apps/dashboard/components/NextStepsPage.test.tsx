import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Comment } from '../lib/types'
import { NextStepsPage } from './NextStepsPage'
import { delivery } from '../hooks/direct-delivery.fixture'

const comment = (id: string, body: string): Comment => ({
  id, projectId: 'p', pageUrl: 'https://example.com', selector: 'h1', x: 0, y: 0, body,
  reviewStatus: 'accepted', implementationStatus: 'unassigned', createdAt: '', updatedAt: '',
  author: 'Ada', authorInitial: 'A', authorColor: '#000', screenshotUrl: null, claimedByAgentId: null, targetType: 'element_point', anchor: null, githubIssue: null,
})

const codex = { id: 'codex', name: 'Codex', hint: '', target: 'codex' as const }

function page(over: Partial<Parameters<typeof NextStepsPage>[0]> = {}) {
  const props = {
    projectName: 'Acme',
    comments: [comment('c1', 'Shorten the headline'), comment('c2', 'Add a date')],
    handoff: { sessionReady: true, selectedAgent: 'codex', setSelectedAgent: vi.fn(), selectedAgentMeta: codex, agentDropdownOpen: false, setAgentDropdownOpen: vi.fn(), copyStatus: 'idle' as const, onCopySessionLink: vi.fn() },
    agentError: null, agentErrorCode: null, agentConnected: false,
    onUpgrade: vi.fn(), onOpenComment: vi.fn(), onOpenRuns: vi.fn(),
    ...over,
  }
  return { props, ui: <NextStepsPage {...props} /> }
}

it('lists ready comments and hands them off in one prompt', () => {
  const { props, ui } = page()
  render(ui)
  expect(screen.getByRole('heading', { name: 'Next steps' })).toBeInTheDocument()
  expect(screen.getByText('2 ready for an agent in Acme.')).toBeInTheDocument()
  const list = screen.getByRole('list', { name: 'Next steps' })
  fireEvent.click(within(list).getByRole('button', { name: 'Add a date' }))
  expect(props.onOpenComment).toHaveBeenCalledWith('c2')
  fireEvent.click(screen.getByRole('button', { name: 'Send 2 crrts to Codex' }))
  expect(props.handoff.onCopySessionLink).toHaveBeenCalledOnce()
  expect(screen.queryByText('Waiting for Codex…')).toBeNull()
})

it('waits after a copy, links to the run once connected, and blocks copy without a session', () => {
  const base = page()
  const view = render(page({ handoff: { ...base.props.handoff, copyStatus: 'copied', sessionReady: false } }).ui)
  expect(screen.getByText('Waiting for Codex…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Paste into Codex' })).toBeDisabled()
  const connected = page({ agentConnected: true })
  view.rerender(connected.ui)
  expect(screen.getByText(/Codex is connected/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'See the run' }))
  expect(connected.props.onOpenRuns).toHaveBeenCalledOnce()
})

it('explains an empty queue and agent errors', () => {
  const view = render(page({ comments: [] }).ui)
  expect(screen.getByText('Nothing ready for an agent in Acme.')).toBeInTheDocument()
  expect(screen.getByText('No next steps yet')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Send/ })).toBeNull()
  const failed = page({ agentError: 'Upgrade', agentErrorCode: 'upgrade_required' })
  view.rerender(failed.ui)
  expect(screen.queryByRole('button', { name: /Send/ })).toBeNull()
  expect(screen.queryByRole('list', { name: 'Next steps' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Upgrade plan' }))
  expect(failed.props.onUpgrade).toHaveBeenCalledOnce()
})

it('sends straight to a listening terminal and shows each delivery', () => {
  const states: Record<string, string> = { c1: 'working', c2: 'completed', c3: 'mystery' }
  const direct = delivery({ stateFor: (id) => states[id] })
  render(page({ comments: [comment('c1', 'One'), comment('c2', 'Two'), comment('c3', 'Three'), comment('c4', 'Four')], direct }).ui)
  expect(screen.queryByRole('button', { name: /to Codex/ })).toBeNull()
  expect(screen.getByText('· Agent working')).toBeInTheDocument()
  expect(screen.getByText('· Ready to test')).toBeInTheDocument()
  expect(screen.getByText('· Checking delivery')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Send 3 crrts to term l1' }))
  expect(direct.send).toHaveBeenCalledWith([expect.objectContaining({ id: 'c2' }), expect.objectContaining({ id: 'c3' }), expect.objectContaining({ id: 'c4' })])
})

it('keeps the prompt handoff when no terminal can take the send or direct send is off', () => {
  const view = render(page({ direct: delivery({ online: false, destination: '' }) }).ui)
  expect(screen.getByRole('button', { name: 'Send 2 crrts' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Send 2 crrts to Codex' })).toBeEnabled()
  view.rerender(page({ direct: delivery({ enabled: false }) }).ui)
  expect(screen.queryByRole('region', { name: 'Send to a terminal' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Send 2 crrts to Codex' })).toBeEnabled()
})
