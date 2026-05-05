import { afterEach, beforeEach, vi } from 'vitest'
import { act, fireEvent, waitFor } from '@testing-library/react'

export interface FetchCall {
  url: string
  init?: RequestInit
}

export function mockFetch(
  postResponder?: (init?: RequestInit) => Response | Promise<Response>,
  getResponder?: () => Response | Promise<Response>,
) {
  const calls: FetchCall[] = []
  const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (init?.method === 'POST') {
      return postResponder
        ? postResponder(init)
        : new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    if (init?.method === 'PATCH') {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    if (init?.method === 'DELETE') {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    return getResponder ? getResponder() : new Response('[]', { status: 200 })
  })
  vi.stubGlobal('fetch', impl)
  return calls
}

export function commentsResponse(comments: unknown[]) {
  return () => new Response(JSON.stringify(comments), { status: 200 })
}

export function seedComment(overrides: Record<string, unknown> = {}) {
  const pageUrl = window.location.href.split('#')[0]
  return {
    id: 'c1',
    projectId: 'proj',
    pageUrl,
    x: 20,
    y: 30,
    selector: 'body',
    body: 'sidebar entry',
    authorName: 'Ada',
    reviewStatus: 'open',
    createdAt: '2026-04-22T00:00:00Z',
    ...overrides,
  }
}

export function widgetTestSetup() {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' })
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = () => 'blob:mock'
      URL.revokeObjectURL = () => {}
    }
    try { localStorage.clear() } catch {}
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
}

export async function enterCommentingMode() {
  document.querySelectorAll('[data-test-target]').forEach((n) => n.remove())

  const targetNode = document.createElement('article')
  targetNode.setAttribute('data-test-target', '')
  document.body.appendChild(targetNode)

  await waitFor(() => {
    if (document.querySelectorAll('[data-fw]').length === 0) {
      throw new Error('widget root not mounted yet')
    }
  })

  await act(async () => {
    fireEvent.keyDown(window, { key: 'c' })
  })

  const evt = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: 120,
    clientY: 200,
  })
  await act(async () => {
    targetNode.dispatchEvent(evt)
  })

  const nameInput = await waitFor(() => {
    const el = document.querySelector<HTMLInputElement>('input[placeholder^="e.g."]')
    if (!el) throw new Error('name input not mounted yet')
    return el
  })
  await act(async () => {
    fireEvent.change(nameInput, { target: { value: 'Test User' } })
  })
  await act(async () => {
    fireEvent.submit(nameInput.closest('form')!)
  })

  const textarea = await waitFor(() => {
    const el = document.querySelector<HTMLTextAreaElement>('textarea')
    if (!el) throw new Error('textarea not mounted yet')
    return el
  })

  const getSendButton = () => {
    const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Send"]')
    if (!btn) throw new Error('Send button not found')
    return btn
  }

  return { textarea, getSendButton, targetNode }
}
