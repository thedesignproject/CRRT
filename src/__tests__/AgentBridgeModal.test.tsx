import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { AgentBridgeModal } from '../components/AgentBridgeModal'

const API = 'https://api.example.com'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function stateResponse(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  return {
    share: { slug: 's1', scopeType: 'project', revision: 1 },
    project: { publicKey: 'proj', name: 'Acme', repoUrl: null },
    comments: [
      {
        id: 'c1', pageUrl: 'https://x.example/page', selector: '#a', body: 'First note',
        reviewStatus: 'accepted', implementationStatus: 'in_progress',
        claimedByAgentId: 'agent-7', createdAt: now, authorName: 'Dana',
      },
      {
        id: 'c2', pageUrl: 'https://x.example/two', selector: '#b', body: 'Second note',
        reviewStatus: 'accepted', implementationStatus: 'unassigned',
        claimedByAgentId: null, createdAt: now,
      },
      {
        id: 'c3', pageUrl: 'https://x.example/three', selector: '#c', body: 'Open one',
        reviewStatus: 'open', implementationStatus: 'unassigned',
        claimedByAgentId: null, createdAt: now,
      },
    ],
    presence: [
      { agentId: 'agent-7', status: 'working', summary: 'fixing nav', lastSeenAt: now },
      { agentId: 'agent-9', status: 'idle', summary: null, lastSeenAt: now },
    ],
    ...overrides,
  }
}

function mockApi(stateBody: Record<string, unknown> = stateResponse()) {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/v1/public/project')) {
      return jsonResponse({
        projectKey: 'proj', projectName: 'Acme',
        doc: { slug: 's1', token: 't1', docUrl: 'https://x.example/doc', promptUrl: 'https://x.example/p' },
      })
    }
    if (url.includes('/v1/shares/s1/prompt')) {
      const target = new URL(url).searchParams.get('target')
      return jsonResponse({ slug: 's1', target, prompt: `PROMPT ${target}`, docUrl: 'https://x.example/doc' })
    }
    if (url.includes('/v1/agent/shares/s1/state')) {
      return jsonResponse(stateBody)
    }
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', impl)
  return { writeText, impl }
}

const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
const targetButton = (label: string) => buttons().find((b) => b.textContent?.includes(label))!
const commentButton = (body: string) => buttons().find((b) => b.textContent?.includes(body))!

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('<AgentBridgeModal />', () => {
  it('renders presence + accepted comments, toggles selection, hovers, and copies via the gate', async () => {
    const { writeText } = mockApi()
    render(
      <AgentBridgeModal apiBase={API} projectId="proj" onClose={() => {}} onBeforeCopy={async () => true} />,
    )

    await waitFor(() => {
      if (!document.body.textContent?.includes('First note')) throw new Error('comments not loaded')
    })

    // Presence: one entry with a summary, one without (covers the `p.summary &&` arms).
    expect(document.body.textContent).toContain('agent-7')
    expect(document.body.textContent).toContain('fixing nav')
    expect(document.body.textContent).toContain('agent-9')

    // Accepted comments: author + no-author, status pill; the open comment is excluded.
    expect(document.body.textContent).toContain('First note')
    expect(document.body.textContent).toContain('Dana')
    expect(document.body.textContent).toContain('Second note')
    expect(document.body.textContent).toContain('In progress')
    const inProgress = Array.from(document.querySelectorAll<HTMLSpanElement>('span'))
      .find((element) => element.textContent === 'In progress')
    expect(inProgress?.style.color).toBe('var(--fw-info-label)')
    expect(document.body.textContent).not.toContain('Open one')
    // The single open comment surfaces the "waiting on review" footer.
    expect(document.body.textContent).toContain('more comment')

    // Nothing is selected yet → the target is not ready. Hover it in that state.
    await act(async () => { fireEvent.mouseEnter(targetButton('Claude Code')) })
    await act(async () => { fireEvent.mouseLeave(targetButton('Claude Code')) })

    // Select both accepted comments (covers the selected-comment styling + checkmark).
    await act(async () => { fireEvent.click(commentButton('First note')) })
    await act(async () => { fireEvent.click(commentButton('Second note')) })
    await waitFor(() => {
      if (!targetButton('Claude Code').textContent?.includes('Copy Claude Code')) {
        throw new Error('target not ready after selecting all')
      }
    })
    // Both selected → the full "Ready for agent (N)" label.
    expect(document.body.textContent).toContain('Ready for agent (2)')

    // Hover the target while it is ready (hovered && ready arm).
    await act(async () => { fireEvent.mouseEnter(targetButton('Claude Code')) })
    await act(async () => { fireEvent.mouseLeave(targetButton('Claude Code')) })

    // Deselect one → a subset is selected (partial label + custom-prompt path).
    await act(async () => { fireEvent.click(commentButton('Second note')) })
    expect(document.body.textContent).toContain('1/2 selected')

    await act(async () => { fireEvent.click(targetButton('Claude Code')) })
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]![0]).toContain('ACT ONLY ON THESE FEEDBACK ITEMS')
    expect(document.body.textContent).toContain('Copied ✓')
    const copiedLabel = Array.from(document.querySelectorAll<HTMLDivElement>('div'))
      .find((element) => element.childElementCount === 0 && element.textContent === 'Copied ✓')
    expect(copiedLabel?.style.color).toBe('var(--fw-active-label)')

    // After the 1600ms reset `copied` clears but `selected` persists, exposing
    // the selected-target styling.
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('Copied ✓')
    }, { timeout: 2500 })
  })

  it('copies directly (no gate) and shows the empty accepted-comments state', async () => {
    const { writeText } = mockApi(stateResponse({ comments: [], presence: [] }))
    render(<AgentBridgeModal apiBase={API} projectId="proj" onClose={() => {}} />)

    const claude = await waitFor(() => {
      const btn = targetButton('Copy Claude Code')
      if (!btn) throw new Error('prompts not ready')
      return btn
    })
    expect(document.body.textContent).toContain('No accepted comments yet')

    // Close-button hover handlers.
    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
    await act(async () => { fireEvent.mouseEnter(close) })
    await act(async () => { fireEvent.mouseLeave(close) })

    await act(async () => { fireEvent.click(claude) })
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    // With no accepted comments the unmodified prompt is copied verbatim.
    expect(writeText.mock.calls[0]![0]).toBe('PROMPT claude-code')
  })

  it('does not copy when the onBeforeCopy gate denies access', async () => {
    const { writeText } = mockApi(stateResponse({ comments: [], presence: [] }))
    render(
      <AgentBridgeModal apiBase={API} projectId="proj" onClose={() => {}} onBeforeCopy={async () => false} />,
    )

    const claude = await waitFor(() => {
      const btn = targetButton('Copy Claude Code')
      if (!btn) throw new Error('prompts not ready')
      return btn
    })

    await act(async () => { fireEvent.click(claude) })
    await act(async () => { await Promise.resolve() })
    expect(writeText).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Copied ✓')
  })
})
