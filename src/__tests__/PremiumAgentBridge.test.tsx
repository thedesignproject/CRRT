/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import type { ComponentProps } from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PremiumAgentBridge } from '../components/PremiumAgentBridge'
import { WidgetRequestError } from '../lib/widgetLogin'

const apiMocks = vi.hoisted(() => ({
  eligibility: vi.fn(),
  createSession: vi.fn(),
  upgrade: vi.fn(),
  prepareExternal: vi.fn(),
  createExternal: vi.fn(),
}))

vi.mock('../components/FeedbackWidget/api', () => ({
  fetchWidgetAgentEligibility: apiMocks.eligibility,
  createWidgetAgentSession: apiMocks.createSession,
  startWidgetAgentUpgrade: apiMocks.upgrade,
  fetchWidgetExternalWorkDraft: apiMocks.prepareExternal,
  createWidgetExternalWork: apiMocks.createExternal,
}))

const API = 'https://api.example.com'
const PAGE = 'https://site.example.com/pricing'
const session = { accessToken: `crrt_widget_${'a'.repeat(43)}`, displayName: 'Ada', expiresAt: '2099-01-01T00:00:00Z' }
const now = '2026-10-06T12:00:00.000Z'
const comments = [
  { id: 'c1', pageUrl: PAGE, selector: '#hero', body: 'Fix the headline', reviewStatus: 'accepted' as const, implementationStatus: 'unassigned' as const, claimedByAgentId: null, createdAt: now, authorName: 'Mina' },
  { id: 'c2', pageUrl: PAGE, selector: '#cta', body: 'Polish the CTA', reviewStatus: 'accepted' as const, implementationStatus: 'in_progress' as const, claimedByAgentId: 'agent-1', createdAt: now, authorName: 'Teo' },
  { id: 'c3', pageUrl: PAGE, selector: '#nav', body: 'Verify the nav', reviewStatus: 'accepted' as const, implementationStatus: 'ready_for_testing' as const, claimedByAgentId: 'agent-2', createdAt: now, authorName: null },
]

function button(label: string) {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.includes(label))
  if (!found) throw new Error(`Button not found: ${label}`)
  return found
}

function checkbox(body: string) {
  const found = document.querySelector<HTMLInputElement>(`input[aria-label="Select feedback: ${body}"]`)
  if (!found) throw new Error(`Checkbox not found: ${body}`)
  return found
}

function renderBridge(overrides: Partial<ComponentProps<typeof PremiumAgentBridge>> = {}) {
  const props: ComponentProps<typeof PremiumAgentBridge> = {
    apiBase: API,
    projectId: 'proj',
    pageUrl: PAGE,
    widgetSession: session,
    onLogin: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    onFeedbackChanged: vi.fn(),
    ...overrides,
  }
  return { ...render(<PremiumAgentBridge {...props} />), props }
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  apiMocks.eligibility.mockReset().mockResolvedValue({ state: 'ready', comments })
  apiMocks.createSession.mockReset().mockResolvedValue({ shareId: 'share-id', slug: 'share-slug', token: 'share-token', tokenUrl: 'https://x', expiresAt: now, commentCount: 1 })
  apiMocks.upgrade.mockReset().mockResolvedValue({ url: 'https://billing.example.com/checkout' })
  apiMocks.prepareExternal.mockReset().mockImplementation(async (_api, id, provider) => ({
    provider, connected: true, destination: 'Product', existing: null,
    draft: { title: `Issue ${id}`, body: `Details ${id}` },
  }))
  apiMocks.createExternal.mockReset().mockImplementation(async (_api, id) => ({ externalUrl: `https://tracker.example/${id}`, created: true }))
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const target = new URL(String(input)).searchParams.get('target')
    return new Response(JSON.stringify({ prompt: `PROMPT ${target}` }), { status: 200 })
  }))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('<PremiumAgentBridge />', () => {
  it('keeps login in place, traps focus, closes with Escape, and restores focus', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const onLogin = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const rendered = renderBridge({ widgetSession: null, onLogin, onClose, loginError: 'Sign in again.' })

    const dialog = document.querySelector<HTMLElement>('[data-fw-agent-dialog="premium"]')!
    await waitFor(() => expect(document.activeElement).toBe(dialog))
    expect(apiMocks.eligibility).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Log in to continue')
    expect(document.body.textContent).toContain('Sign in again.')

    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Close Agent Bridge"]')!
    const login = button('Log in to CRRT')
    close.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(login)
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    dialog.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(dialog)
    await act(async () => { fireEvent.click(login) })
    expect(onLogin).toHaveBeenCalledOnce()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    rendered.unmount()
    await waitFor(() => expect(document.activeElement).toBe(opener))
    opener.remove()
  })

  it('shows the pending sign-in state', async () => {
    renderBridge({ widgetSession: null, loginBusy: true })
    expect(button('Opening sign in…')).toBeDisabled()
  })

  it('defaults safely, preserves an explicit clear during refresh, and never selects terminal work', async () => {
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('1 of 2 selected'))
    expect(checkbox('Fix the headline').checked).toBe(true)
    expect(checkbox('Polish the CTA').checked).toBe(false)
    expect(checkbox('Verify the nav').disabled).toBe(true)

    fireEvent.click(checkbox('Fix the headline'))
    expect(checkbox('Fix the headline').checked).toBe(false)

    fireEvent.click(button('Clear'))
    expect(document.body.textContent).toContain('0 of 2 selected')
    expect(document.querySelector<HTMLButtonElement>('[data-fw-agent-primary]')).toBeDisabled()
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(apiMocks.eligibility).toHaveBeenCalledTimes(2))
    expect(document.body.textContent).toContain('0 of 2 selected')
    expect(document.querySelector<HTMLButtonElement>('[data-fw-agent-primary]')).toBeDisabled()
  })

  it('only shows approved feedback and has no moderation actions', async () => {
    apiMocks.eligibility.mockResolvedValue({
      state: 'ready',
      comments: [...comments, { ...comments[0], id: 'open-comment', body: 'Needs review first', reviewStatus: 'open' }],
    })
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    expect(document.body.textContent).not.toContain('Needs review first')
    expect(document.querySelector('button[aria-label*="Accept"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Reject')
    expect(document.body.textContent).not.toContain('Resolve')
  })

  it('creates one exact handoff, loads prompts only afterward, and copies the chosen prompt', async () => {
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    fireEvent.click(checkbox('Polish the CTA'))
    await act(async () => { fireEvent.click(button('Send to agent')) })

    expect(apiMocks.createSession).toHaveBeenCalledOnce()
    const payload = apiMocks.createSession.mock.calls[0][1]
    expect(payload).toMatchObject({ projectKey: 'proj', pageUrl: PAGE, commentIds: ['c1', 'c2'] })
    expect(payload.idempotencyKey).toMatch(/^widget_[A-Za-z0-9_-]+$/)
    expect(fetch).toHaveBeenCalledTimes(3)
    await waitFor(() => expect(document.body.textContent).toContain('Handoff ready'))

    await act(async () => { fireEvent.click(button('Claude Code')) })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('PROMPT claude-code')
  })

  it('creates one tracker issue per selected comment and remembers the provider', async () => {
    const storage = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0 }
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    fireEvent.click(checkbox('Polish the CTA'))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Choose issue tracker"]')!)
    fireEvent.click(button('GitHub'))
    await act(async () => { fireEvent.click(button('Create 2')) })

    expect(apiMocks.prepareExternal).toHaveBeenCalledTimes(2)
    expect(apiMocks.createExternal).toHaveBeenCalledTimes(2)
    expect(apiMocks.createExternal.mock.calls.map((call) => call[1])).toEqual(['c1', 'c2'])
    expect(apiMocks.createExternal.mock.calls.every((call) => call[2] === 'github')).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith('crrt:external-work:proj', 'github')
    expect(document.body.textContent).toContain('2 GitHub issues ready.')
    expect(document.body.textContent).toContain('Created')
  })

  it('restores Jira as the saved tracker provider', async () => {
    const storage = { getItem: vi.fn().mockReturnValue('jira'), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 1 }
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    renderBridge()
    await waitFor(() => expect(button('Create 1 in Jira')).toBeDefined())
    storage.getItem.mockReturnValue(null)
  })

  it('supports legacy issue URLs returned by a tracker', async () => {
    apiMocks.createExternal.mockResolvedValueOnce({ issueUrl: 'https://tracker.example/legacy', created: true })
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    await act(async () => { fireEvent.click(button('Create 1')) })
    expect(document.querySelector('a[href="https://tracker.example/legacy"]')).not.toBeNull()
  })

  it('returns to authentication when tracker access expires', async () => {
    apiMocks.prepareExternal.mockRejectedValueOnce(new WidgetRequestError(401))
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    await act(async () => { fireEvent.click(button('Create 1')) })
    expect(document.body.textContent).toContain('Log in to continue')
  })

  it('explains when multiple selected items cannot reach the tracker', async () => {
    apiMocks.prepareExternal.mockResolvedValue({ provider: 'jira', connected: false, destination: '', existing: null, draft: { title: 'Draft', body: 'Draft' } })
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    fireEvent.click(checkbox('Polish the CTA'))
    await act(async () => { fireEvent.click(button('Create 2')) })
    expect(document.body.textContent).toContain('2 issues could not be created')
  })

  it('reuses existing tracker work and lets failed items retry', async () => {
    apiMocks.prepareExternal
      .mockResolvedValueOnce({ provider: 'linear', connected: true, destination: 'Product', existing: { externalUrl: 'https://linear.example/existing' }, draft: { title: 'Existing', body: 'Existing' } })
      .mockRejectedValueOnce(new Error('Linear is not connected to this project.'))
      .mockResolvedValueOnce({ provider: 'linear', connected: true, destination: 'Product', existing: null, draft: { title: 'Retry', body: 'Retry' } })
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    fireEvent.click(checkbox('Polish the CTA'))
    await act(async () => { fireEvent.click(button('Create 2')) })
    expect(document.body.textContent).toContain('1 issue could not be created')
    expect(apiMocks.createExternal).not.toHaveBeenCalled()

    await act(async () => { fireEvent.click(button('Create 2')) })
    expect(apiMocks.prepareExternal).toHaveBeenCalledTimes(3)
    expect(apiMocks.createExternal).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('1 Linear issue ready.')
  })

  it('shows a safe issue error when a provider rejects with a non-error value', async () => {
    apiMocks.prepareExternal.mockRejectedValueOnce('offline')
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    await act(async () => { fireEvent.click(button('Create 1')) })
    expect(document.querySelector('[title="Could not create this issue."]')).not.toBeNull()
  })

  it('selects all approved actionable work and starts another handoff', async () => {
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    fireEvent.click(button('Select all'))
    expect(document.body.textContent).toContain('2 of 2 selected')
    await act(async () => { fireEvent.click(button('Send to agent')) })
    await waitFor(() => expect(document.body.textContent).toContain('Handoff ready'))
    await act(async () => { fireEvent.click(button('Start another handoff')) })
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
  })

  it('shows an empty ready state', async () => {
    apiMocks.eligibility.mockResolvedValue({ state: 'ready', comments: [] })
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('No approved feedback'))
  })

  it('handles omitted comments and the accepted unassigned status fallback', async () => {
    apiMocks.eligibility.mockResolvedValueOnce({ state: 'ready' }).mockResolvedValueOnce({
      state: 'ready',
      comments: [{ ...comments[0], id: 'c4', reviewStatus: 'accepted', body: 'Accepted item' }],
    })
    const first = renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('No approved feedback'))
    first.unmount()
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('accepted'))
  })

  it.each([
    [new Response('', { status: 500 }), 'Could not load the Agent prompt.'],
    [new Response(JSON.stringify({ prompt: 42 }), { status: 200 }), 'Could not load the Agent prompt.'],
  ])('reports invalid prompt responses %#', async (response, message) => {
    vi.mocked(fetch).mockResolvedValue(response)
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    await act(async () => { fireEvent.click(button('Send to agent')) })
    expect(document.body.textContent).toContain(message)
  })

  it('uses safe fallback messages for non-Error failures', async () => {
    apiMocks.eligibility.mockRejectedValueOnce('offline')
    const eligibility = renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Agent is temporarily unavailable.'))
    eligibility.unmount()

    apiMocks.createSession.mockRejectedValueOnce('handoff')
    const handoff = renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    await act(async () => { fireEvent.click(button('Send to agent')) })
    expect(document.body.textContent).toContain('Could not create the Agent handoff.')
  })

  it('keeps a generic request failure in the ready view', async () => {
    apiMocks.createSession.mockRejectedValue(new WidgetRequestError(500))
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    await act(async () => { fireEvent.click(button('Send to agent')) })
    expect(document.body.textContent).toContain('Could not save or load feedback. Please try again.')
    expect(document.body.textContent).toContain('Fix the headline')
  })

  it('reuses the idempotency key when the same handoff is retried', async () => {
    apiMocks.createSession.mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce({ shareId: 'share-id', slug: 'share-slug', token: 'share-token', tokenUrl: 'https://x', expiresAt: now, commentCount: 1 })
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    await act(async () => { fireEvent.click(button('Send to agent')) })
    expect(document.body.textContent).toContain('temporary')
    await act(async () => { fireEvent.click(button('Send to agent')) })
    expect(apiMocks.createSession.mock.calls[0][1].idempotencyKey).toBe(apiMocks.createSession.mock.calls[1][1].idempotencyKey)
  })

  it.each([
    [new WidgetRequestError(401), 'Log in to continue'],
    [new WidgetRequestError(402, 'upgrade_required'), 'Agent is a premium feature'],
    [new WidgetRequestError(403, 'owner_upgrade_required'), 'Ask the owner to upgrade'],
    [new WidgetRequestError(409, 'seat_limit_reached'), 'No Agent seats available'],
    [new WidgetRequestError(403, 'forbidden'), 'Agent is unavailable'],
  ])('reconciles a failed handoff against the server state %#', async (failure, heading) => {
    apiMocks.createSession.mockRejectedValue(failure)
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    await act(async () => { fireEvent.click(button('Send to agent')) })
    expect(document.body.textContent).toContain(heading)
  })

  it.each([
    ['owner_upgrade_required', 'Ask the owner to upgrade'],
    ['seat_limit_reached', 'No Agent seats available'],
    ['forbidden', 'Agent is unavailable'],
    ['project_access_denied', 'Agent is unavailable'],
  ])('renders the %s access state without exposing comments', async (state, heading) => {
    apiMocks.eligibility.mockResolvedValue({ state })
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain(heading))
    expect(document.body.textContent).not.toContain('Fix the headline')
  })

  it('opens owner billing in a popup and exposes a fallback link when popups are blocked', async () => {
    apiMocks.eligibility.mockResolvedValue({ state: 'upgrade_required' })
    const popup = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValueOnce(popup as never).mockReturnValueOnce(null)
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Agent is a premium feature'))

    await act(async () => { fireEvent.click(button('Upgrade plan')) })
    expect(popup.location.href).toBe('https://billing.example.com/checkout')
    expect(apiMocks.upgrade).toHaveBeenCalledWith(API, { projectKey: 'proj', pageUrl: PAGE }, session)
    await act(async () => { fireEvent.click(button('Upgrade plan')) })
    expect(document.body.textContent).toContain('blocked the billing window')
    expect(document.querySelector<HTMLAnchorElement>('a[href="https://billing.example.com/checkout"]')).not.toBeNull()
  })

  it('closes a reserved billing popup and reports upgrade failures', async () => {
    apiMocks.eligibility.mockResolvedValue({ state: 'upgrade_required' })
    apiMocks.upgrade.mockRejectedValue(new Error('Billing unavailable'))
    const popup = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(popup as never)
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Agent is a premium feature'))
    await act(async () => { fireEvent.click(button('Upgrade plan')) })
    expect(popup.close).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('Billing unavailable')
  })

  it('uses the safe billing fallback for a non-Error failure', async () => {
    apiMocks.eligibility.mockResolvedValue({ state: 'upgrade_required' })
    apiMocks.upgrade.mockRejectedValue('billing')
    vi.spyOn(window, 'open').mockReturnValue(null)
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Agent is a premium feature'))
    await act(async () => { fireEvent.click(button('Upgrade plan')) })
    expect(document.body.textContent).toContain('Could not open billing.')
  })

  it('keeps a handoff available when clipboard permission is denied', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    await act(async () => { fireEvent.click(button('Send to agent')) })
    await waitFor(() => expect(document.body.textContent).toContain('Handoff ready'))
    await act(async () => { fireEvent.click(button('Claude Code')) })
    expect(document.body.textContent).toContain('Copy failed')
  })

  it('recovers from server errors and treats an expired credential as authentication required', async () => {
    apiMocks.eligibility.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ state: 'ready', comments })
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Agent could not load'))
    await act(async () => { fireEvent.click(button('Retry')) })
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
  })

  it('keeps the ready view stable when a silent refresh fails', async () => {
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
    apiMocks.eligibility.mockRejectedValueOnce(new Error('background offline'))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(apiMocks.eligibility).toHaveBeenCalledTimes(2))
    expect(document.body.textContent).toContain('Fix the headline')
    expect(document.body.textContent).not.toContain('background offline')
  })

  it('returns to login when eligibility receives 401', async () => {
    apiMocks.eligibility.mockRejectedValueOnce(new WidgetRequestError(401))
    renderBridge()
    await waitFor(() => expect(document.body.textContent).toContain('Log in to continue'))
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

it.each(['page', 'project', 'session', 'api', 'unmount'] as const)('discards a delayed handoff after changing %s', async (change) => {
  const pending = deferred<any>()
  apiMocks.createSession.mockReturnValueOnce(pending.promise)
  const view = renderBridge()
  await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
  fireEvent.click(button('Send to agent'))
  if (change === 'unmount') view.unmount()
  else {
    const overrides = change === 'page' ? { pageUrl: PAGE + '/new' } : change === 'project' ? { projectId: 'other' } : change === 'api' ? { apiBase: API + '/new' } : { widgetSession: { ...session, accessToken: 'new-token' } }
    view.rerender(<PremiumAgentBridge {...view.props} {...overrides} />)
    await waitFor(() => expect(button('Send to agent').disabled).toBe(false))
  }
  await act(async () => { pending.resolve({ slug: 'old-share', token: 'old-token' }); await pending.promise })
  expect(fetch).not.toHaveBeenCalled()
  expect(document.body.textContent).not.toContain('Handoff ready')
  expect(view.props.onFeedbackChanged).not.toHaveBeenCalled()
})

it.each(['resolve', 'reject'] as const)('discards %s of delayed prompts after navigation', async (outcome) => {
  const pending = deferred<Response>()
  vi.mocked(fetch).mockImplementation(() => pending.promise.then((response) => response.clone()))
  const view = renderBridge()
  await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
  fireEvent.click(button('Send to agent'))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
  view.rerender(<PremiumAgentBridge {...view.props} pageUrl={PAGE + '/new'} />)
  await waitFor(() => expect(button('Send to agent').disabled).toBe(false))
  await act(async () => {
    if (outcome === 'reject') pending.reject(new WidgetRequestError(401))
    else pending.resolve(new Response(JSON.stringify({ prompt: 'OLD PROMPT' })))
  })
  expect(document.body.textContent).not.toContain('Handoff ready')
  expect(document.body.textContent).not.toContain('Log in to continue')
  expect(view.props.onFeedbackChanged).not.toHaveBeenCalled()
})

it('discards a delayed external-work draft after navigation', async () => {
  const pending = deferred<any>()
  apiMocks.prepareExternal.mockReturnValueOnce(pending.promise)
  const view = renderBridge()
  await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
  fireEvent.click(button('Create 1'))
  view.rerender(<PremiumAgentBridge {...view.props} pageUrl={PAGE + '/new'} />)
  await waitFor(() => expect(button('Create 1').disabled).toBe(false))
  await act(async () => { pending.resolve({ provider: 'linear', connected: true, destination: 'Product', existing: null, draft: { title: 'Old', body: 'Old' } }) })
  expect(apiMocks.createExternal).not.toHaveBeenCalled()
})

it.each(['resolve', 'reject'] as const)('closes a delayed billing popup on context change (%s)', async (outcome) => {
  apiMocks.eligibility.mockResolvedValue({ state: 'upgrade_required' })
  const pending = deferred<any>()
  apiMocks.upgrade.mockReturnValueOnce(pending.promise)
  const popup = { location: { href: '' }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(popup as never)
  const view = renderBridge()
  await waitFor(() => expect(document.body.textContent).toContain('Agent is a premium feature'))
  fireEvent.click(button('Upgrade plan'))
  view.rerender(<PremiumAgentBridge {...view.props} pageUrl={PAGE + '/new'} />)
  await act(async () => { outcome === 'resolve' ? pending.resolve({ url: 'https://old-billing.test' }) : pending.reject(new Error('OLD ERROR')) })
  expect(popup.close).toHaveBeenCalledOnce()
  expect(popup.location.href).toBe('')
  expect(document.body.textContent).not.toContain('OLD ERROR')
})

it('keeps the retry key through a background eligibility refresh, and changes it for a new selection', async () => {
  apiMocks.createSession.mockRejectedValue(new Error('temporary'))
  renderBridge()
  await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
  await act(async () => { fireEvent.click(button('Send to agent')) })
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  await act(async () => { fireEvent.click(button('Send to agent')) })
  expect(apiMocks.createSession.mock.calls[1][1].idempotencyKey).toBe(apiMocks.createSession.mock.calls[0][1].idempotencyKey)
  fireEvent.click(checkbox('Polish the CTA'))
  await act(async () => { fireEvent.click(button('Send to agent')) })
  expect(apiMocks.createSession.mock.calls[2][1].idempotencyKey).not.toBe(apiMocks.createSession.mock.calls[0][1].idempotencyKey)
})


it('creates a fresh key for an explicit new handoff with the same selection', async () => {
  renderBridge()
  await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
  await act(async () => { fireEvent.click(button('Send to agent')) })
  await waitFor(() => expect(document.body.textContent).toContain('Handoff ready'))
  const first = apiMocks.createSession.mock.calls[0][1]
  await act(async () => { fireEvent.click(button('Start another handoff')) })
  await waitFor(() => expect(document.body.textContent).toContain('Fix the headline'))
  await act(async () => { fireEvent.click(button('Send to agent')) })
  await waitFor(() => expect(apiMocks.createSession).toHaveBeenCalledTimes(2))
  const second = apiMocks.createSession.mock.calls[1][1]
  expect(second.commentIds).toEqual(first.commentIds)
  expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
})


it('keeps a completed handoff visible after an upgrade, focus, and polling intervals', async () => {
  apiMocks.eligibility.mockResolvedValue({ state: 'upgrade_required' })
  vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, close: vi.fn() } as never)
  renderBridge()
  await waitFor(() => expect(document.body.textContent).toContain('Agent is a premium feature'))
  vi.useFakeTimers()
  await act(async () => { fireEvent.click(button('Upgrade plan')) })
  apiMocks.eligibility.mockResolvedValue({ state: 'ready', comments })
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(document.body.textContent).toContain('Fix the headline')
  await act(async () => { fireEvent.click(button('Send to agent')) })
  expect(document.body.textContent).toContain('Handoff ready')
  const eligibilityCalls = apiMocks.eligibility.mock.calls.length
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(20000)
  })
  expect(apiMocks.eligibility).toHaveBeenCalledTimes(eligibilityCalls)
  expect(document.body.textContent).toContain('Handoff ready')
  expect(button('Codex').disabled).toBe(false)
  await act(async () => { fireEvent.click(button('Codex')) })
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('PROMPT codex')
})

it('closes the tracker menu during creation and creates later work in the newly chosen tracker', async () => {
 let finish!: (value: any) => void
 apiMocks.createExternal.mockReturnValueOnce(new Promise(resolve => {finish=resolve}))
 renderBridge()
 await waitFor(() => expect(document.body.textContent).toContain('1 of 2 selected'))
 fireEvent.click(document.querySelector('button[aria-label="Choose issue tracker"]')!)
 expect(document.querySelector('[role="menuitemradio"]')).not.toBeNull()
 fireEvent.click(button('Create 1 in Linear'))
 await waitFor(() => expect(apiMocks.createExternal).toHaveBeenCalled())
 expect(document.querySelector('[role="menu"]')).toBeNull()
 expect(document.querySelector('button[aria-label="Choose issue tracker"]')).toBeDisabled()
 await act(async () => finish({externalUrl:'https://linear.example/one',created:true}))
 fireEvent.click(document.querySelector('button[aria-label="Choose issue tracker"]')!)
 fireEvent.click(button('GitHub'))
 await act(async () => fireEvent.click(button('Create 1 in GitHub')))
 expect(apiMocks.createExternal).toHaveBeenLastCalledWith(API,'c1','github',expect.any(Object),session)
 expect(document.body.textContent).toContain('1 GitHub issue ready.')
})
it('disables an open provider menu while an agent prompt is being prepared', async () => {
 let finish!: (value: any) => void
 apiMocks.createSession.mockReturnValueOnce(new Promise(resolve => {finish=resolve}))
 renderBridge()
 await waitFor(() => expect(document.body.textContent).toContain('1 of 2 selected'))
 fireEvent.click(document.querySelector('button[aria-label="Choose issue tracker"]')!)
 fireEvent.click(button('Copy for agent'))
 for(const item of document.querySelectorAll('[role="menuitemradio"]')) expect(item).toBeDisabled()
 await act(async () => finish({slug:'share',token:'token'}))
})
