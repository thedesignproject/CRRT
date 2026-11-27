import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { NextStepRecord } from '../api'
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

it('says "your agent" in sentences when the handoff is a plain prompt', () => {
  const base = page()
  const prompt = { ...base.props.handoff, selectedAgent: 'prompt', selectedAgentMeta: { id: 'prompt', name: 'Copy as prompt', hint: '', target: 'generic' as const } }
  try { localStorage.removeItem('crrt:dashboard:handoff-hint-seen') } catch {}
  const view = render(page({ handoff: prompt }).ui)
  expect(screen.getByText(/^Paste into your agent — /)).toBeInTheDocument()
  view.rerender(page({ handoff: { ...prompt, copyStatus: 'copied' } }).ui)
  expect(screen.getByText('Waiting for your agent…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Paste into your agent' })).toBeInTheDocument()
  view.rerender(page({ handoff: prompt, agentConnected: true }).ui)
  expect(screen.getByText(/^Your agent is connected\./)).toBeInTheDocument()
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

const step = (id: string, commentIds: string[], over: Partial<NextStepRecord> = {}): NextStepRecord => ({
  id, title: `Step ${id}`, tag: 'copy', status: 'open', createdAt: '',
  comments: commentIds.map((c) => ({ id: c, body: c, authorName: 'Ada' })), requesters: ['Ada', 'Bo'],
  citations: [{ ruleId: 'r1', title: 'Short headlines' }], conflict: null, ...over,
})
const steps = (list: NextStepRecord[] | null, error: string | null = null) => ({ steps: list, error, onAnswer: vi.fn(async () => {}) })

it('lists one row per step with its tag, requesters, comments and rule, plus comments no step covers', () => {
  const states: Record<string, string> = { c2: 'working' }
  const { props, ui } = page({
    comments: [comment('c1', 'One'), comment('c2', 'Two'), comment('c3', 'Three')],
    nextSteps: steps([step('s1', ['c1', 'c2']), step('s2', ['other'])]),
    direct: delivery({ stateFor: (id) => states[id] }),
  })
  render(ui)
  expect(screen.getByText('3 ready for an agent in Acme.')).toBeInTheDocument()
  const rows = within(screen.getByRole('list', { name: 'Next steps' })).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByText('copy')).toBeInTheDocument()
  expect(within(rows[0]).getByText('2 comments')).toBeInTheDocument()
  expect(within(rows[0]).getByText('Bo')).toBeInTheDocument()
  expect(within(rows[0]).getByText('· Follows: Short headlines')).toBeInTheDocument()
  expect(within(rows[0]).getByText('· Agent working')).toBeInTheDocument()
  expect(within(rows[1]).getByText('1 comment')).toBeInTheDocument()
  fireEvent.click(within(rows[0]).getByRole('button', { name: 'Step s1' }))
  expect(props.onOpenComment).toHaveBeenCalledWith('c1')
  fireEvent.click(within(rows[1]).getByRole('button', { name: 'Three' }))
  expect(props.onOpenComment).toHaveBeenLastCalledWith('c3')
  fireEvent.click(screen.getByRole('button', { name: 'Send 2 crrts to term l1' }))
  expect(props.direct!.send).toHaveBeenCalledWith([expect.objectContaining({ id: 'c1' }), expect.objectContaining({ id: 'c3' })])
})

it('keeps per-comment rows while steps load and says when grouping fails', () => {
  const view = render(page({ nextSteps: steps(null) }).ui)
  expect(within(screen.getByRole('list', { name: 'Next steps' })).getAllByRole('listitem')).toHaveLength(2)
  expect(screen.queryByRole('alert')).toBeNull()
  view.rerender(page({ nextSteps: steps(null, 'Offline') }).ui)
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t group next steps: Offline')
  expect(screen.getByRole('button', { name: 'Add a date' })).toBeInTheDocument()
})

it('asks to keep or update the rule a paused step conflicts with', async () => {
  const conflict = { ruleId: 'r1', ruleTitle: 'Short headlines', question: 'The new headline has 12 words. Keep the rule?', decision: null }
  const paused = steps([step('s1', ['c1'], { status: 'paused', conflict }), step('s2', ['c2'], { conflict: { ...conflict, ruleTitle: null, decision: 'keep_rule' } })])
  paused.onAnswer.mockRejectedValueOnce(new Error('This step is not waiting for an answer'))
  render(page({ nextSteps: paused }).ui)
  const group = screen.getByRole('group', { name: 'Rule conflict' })
  expect(screen.getAllByRole('group', { name: 'Rule conflict' })).toHaveLength(1)
  expect(group).toHaveTextContent('Paused · needs you · Short headlines')
  expect(group).toHaveTextContent('The new headline has 12 words. Keep the rule?')
  fireEvent.click(within(group).getByRole('button', { name: 'Keep rule' }))
  expect(within(group).getByRole('button', { name: 'Update rule' })).toBeDisabled()
  expect(await within(group).findByRole('alert')).toHaveTextContent('This step is not waiting for an answer')
  expect(paused.onAnswer).toHaveBeenCalledWith('s1', 'keep_rule')
  fireEvent.click(within(group).getByRole('button', { name: 'Update rule' }))
  await waitFor(() => expect(within(group).queryByRole('alert')).toBeNull())
  expect(paused.onAnswer).toHaveBeenLastCalledWith('s1', 'update_rule')
  expect(within(group).getByRole('button', { name: 'Keep rule' })).toBeEnabled()
})

it('names a conflict without a rule title', () => {
  render(page({ nextSteps: steps([step('s1', ['c1'], { status: 'paused', conflict: { ruleId: null, ruleTitle: null, question: 'Why?', decision: null } })]) }).ui)
  expect(screen.getByText('Paused · needs you')).toBeInTheDocument()
})
