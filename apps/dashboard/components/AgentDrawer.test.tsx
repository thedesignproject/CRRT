import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentDrawer, buildSelectedPrompt } from './AgentDrawer'
import type { Comment } from '../lib/types'

const comment: Comment = { id: 'one', projectId: 'project', body: 'Fix headline', author: 'Reviewer', authorInitial: 'R', authorColor: 'grey', createdAt: '', updatedAt: '', pageUrl: 'https://example.com', selector: 'h1', x: 1, y: 2, screenshotUrl: null, reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null, targetType: 'element_point', anchor: null, githubIssue: null }
const writeText = vi.fn()
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  writeText.mockReset().mockResolvedValue(undefined)
})
describe('selected agent drawer', () => {
  it('exports exactly selected feedback regardless of review state', async () => {
    const remove = vi.fn(), close = vi.fn()
    const props = { project: 'Project', comments: [comment], onRemove: remove, onClose: close }
    const view = render(<AgentDrawer {...props} />)
    fireEvent.change(screen.getByLabelText('Your agent'), { target: { value: 'Codex' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy instructions' }))
    await screen.findByText('Copied. Paste into Codex to start.')
    expect(writeText).toHaveBeenCalledWith(buildSelectedPrompt('Project', [comment]))
    expect(comment.reviewStatus).toBe('open')
    fireEvent.click(screen.getByRole('button', { name: 'Remove: Fix headline' }))
    expect(remove).toHaveBeenCalledWith('one')
    fireEvent.click(screen.getByText('Selected comments (1)'))
    expect(close).not.toHaveBeenCalled()
    view.rerender(<AgentDrawer {...props} comments={[]} />)
    expect(screen.getByRole('button', { name: 'Copy instructions' })).toBeDisabled()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Close agent panel' }))
    fireEvent.click(screen.getByRole('dialog'))
    expect(close).toHaveBeenCalledTimes(3)
  })
  it('handles pending clipboard writes and retry after failure', async () => {
    let reject!: (error: Error) => void
    writeText.mockImplementationOnce(() => new Promise((_, r) => { reject = r }))
    render(<AgentDrawer project="Project" comments={[comment]} onRemove={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy instructions' }))
    expect(screen.getByRole('button', { name: 'Copying…' })).toBeDisabled()
    reject(new Error('denied'))
    await screen.findByText('Clipboard unavailable. Try copying again.')
    fireEvent.click(screen.getByRole('button', { name: 'Copy instructions' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied.'))
  })
})
