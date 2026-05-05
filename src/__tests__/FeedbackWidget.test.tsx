import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { FeedbackWidget } from '../components/FeedbackWidget'

// useScreenshotCapture defers to html2canvas which can't run in happy-dom.
// Replace the hook with a minimal in-test version so the screenshot preview
// path (`imagePreviewUrl &&`) actually mounts when capture() fires.
vi.mock('../lib/screenshotCapture', async () => {
  const actual = await vi.importActual<typeof import('../lib/screenshotCapture')>(
    '../lib/screenshotCapture',
  )
  const React = await import('react')
  return {
    ...actual,
    useScreenshotCapture: () => {
      const [image, setImage] = React.useState<Blob | null>(null)
      return {
        image,
        previewUrl: image ? 'blob:mock' : null,
        capture: () => setImage(new Blob(['x'], { type: 'image/png' })),
        clear: () => setImage(null),
        toBase64: async () =>
          image ? { base64: 'eA==', mimeType: image.type } : null,
      }
    },
  }
})

interface FetchCall {
  url: string
  init?: RequestInit
}

function mockFetch(
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

async function enterCommentingMode() {
  // render's auto-cleanup removes the widget root but not nodes we appended.
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

  // First click in a fresh session opens the name modal — fill it before
  // we can reach the comment textarea.
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

  // The widget renders two Send buttons (disabled collapsed / enabled expanded)
  // conditionally on comment text — re-query after typing, don't snapshot.
  const getSendButton = () => {
    const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Send"]')
    if (!btn) throw new Error('Send button not found')
    return btn
  }

  return { textarea, getSendButton, targetNode }
}

describe('<FeedbackWidget />', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' })
    // happy-dom's URL implementation lacks createObjectURL; the screenshot
    // preview hook calls it whenever a blob is set.
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

  it('fetches existing comments for the configured projectId on mount', async () => {
    const calls = mockFetch()
    render(<FeedbackWidget projectId="my-site" apiBase="https://x.example/api" />)

    await waitFor(() => {
      const getCall = calls.find((c) => !c.init || c.init.method === undefined)
      expect(getCall?.url).toBe('https://x.example/api/v1/public/comments?projectKey=my-site')
    })
  })

  it('URL-encodes projectId with special characters', async () => {
    const calls = mockFetch()
    render(<FeedbackWidget projectId="acme/internal" apiBase="https://x.example/api" />)

    await waitFor(() => {
      expect(calls[0]?.url).toBe('https://x.example/api/v1/public/comments?projectKey=acme%2Finternal')
    })
  })

  it('renders a widget-scoped DOM root with the data-fw marker', () => {
    mockFetch()
    render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)
    const roots = document.querySelectorAll('[data-fw]')
    expect(roots.length).toBeGreaterThan(0)
  })

  it('does not crash when the GET endpoint is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    // Should mount cleanly even if the API is offline — sidebar just stays empty.
    expect(() =>
      render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />),
    ).not.toThrow()
  })

  it('rerenders and refetches when projectId changes', async () => {
    const calls = mockFetch()
    const { rerender } = render(
      <FeedbackWidget projectId="first" apiBase="https://x.example/api" />,
    )
    await waitFor(() => expect(calls.some((c) => c.url.includes('projectKey=first'))).toBe(true))

    rerender(<FeedbackWidget projectId="second" apiBase="https://x.example/api" />)
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes('projectKey=second'))).toBe(true),
    )
  })

  it('PATCHes review status through the public comments endpoint', async () => {
    const pageUrl = window.location.href.split('#')[0]
    const calls = mockFetch(undefined, () => new Response(JSON.stringify([
      {
        id: 'comment-1',
        projectId: 'proj',
        pageUrl,
        x: 20,
        y: 30,
        selector: 'body',
        body: 'resolve me',
        reviewStatus: 'open',
        createdAt: '2026-04-22T00:00:00Z',
      },
    ]), { status: 200 }))

    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    await waitFor(() => expect(document.body.textContent).toContain('resolve me'))
    const resolveButton = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>('button[title="Approve"]')
      if (!button) throw new Error('resolve button not mounted yet')
      return button
    })
    fireEvent.click(resolveButton)

    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH')
      expect(patch?.url).toBe('https://x.example/api/v1/public/comments')
      expect(JSON.parse(String(patch?.init?.body))).toEqual({
        id: 'comment-1',
        reviewStatus: 'accepted',
      })
    })
  })

  describe('submit flow', () => {
    it('POSTs the comment with projectId + url + selector and shows it in the sidebar', async () => {
      const calls = mockFetch()
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      const { textarea, getSendButton } = await enterCommentingMode()
      fireEvent.change(textarea, { target: { value: 'bug here' } })
      fireEvent.click(getSendButton())

      await waitFor(() => {
        const post = calls.find((c) => c.init?.method === 'POST')
        expect(post).toBeDefined()
        expect(post?.url).toBe('https://x.example/api/v1/public/comments')
        const body = JSON.parse(String(post?.init?.body))
        expect(body.projectKey).toBe('proj')
        expect(body.body).toBe('bug here')
        expect(typeof body.selector).toBe('string')
        expect(body.selector.length).toBeGreaterThan(0)
      })

      await waitFor(() => {
        expect(document.body.textContent).toContain('bug here')
      })
    })

    it('duplicate Send clicks in the same tick produce exactly one POST', async () => {
      const calls = mockFetch(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(
              () =>
                resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
              30,
            ),
          ),
      )
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      const { textarea, getSendButton } = await enterCommentingMode()
      fireEvent.change(textarea, { target: { value: 'rapid' } })

      const sendButton = getSendButton()
      fireEvent.click(sendButton)
      fireEvent.click(sendButton)
      fireEvent.click(sendButton)

      await waitFor(() => {
        const posts = calls.filter((c) => c.init?.method === 'POST')
        expect(posts.length).toBe(1)
      })
    })

    it('renders the screenshot-captured preview after clicking a target', async () => {
      mockFetch()
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      const { textarea } = await enterCommentingMode()
      // Trigger the popover-expanded layout so the preview row mounts.
      fireEvent.change(textarea, { target: { value: 'check screenshot' } })

      await waitFor(() => {
        expect(document.body.textContent).toContain('Screenshot captured')
      })
    })

    it('opens the name editor from the popover avatar and closes it via the X button', async () => {
      mockFetch()
      try { localStorage.setItem('fw-author-name', 'Existing User') } catch {}
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      // With a stored name, enterCommentingMode does NOT pop the name modal,
      // so we drive a fresh selection inline here and click the avatar.
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
      await act(async () => {
        targetNode.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 80, clientY: 80 }))
      })

      // Avatar button has the "Signed in as ..." title.
      const avatar = await waitFor(() => {
        const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-fw] button')).find(
          (b) => (b.title || '').startsWith('Signed in as'),
        )
        if (!btn) throw new Error('avatar not mounted yet')
        return btn
      })
      await act(async () => {
        fireEvent.click(avatar)
      })

      const closeBtn = await waitFor(() => {
        const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
        if (!btn) throw new Error('close button not mounted yet')
        return btn
      })
      await act(async () => {
        fireEvent.click(closeBtn)
      })

      await waitFor(() => {
        expect(document.querySelector('button[aria-label="Close"]')).toBeNull()
      })
    })

    it('clicking the popover scrim cancels and returns to selecting mode', async () => {
      mockFetch()
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      const { textarea } = await enterCommentingMode()
      fireEvent.change(textarea, { target: { value: 'never sent' } })

      // The scrim is the fixed-inset div behind the popover with the dim background.
      const scrim = Array.from(
        document.querySelectorAll<HTMLDivElement>('[data-fw]'),
      ).find((el) => el.style.background?.includes('rgba(0, 0, 0, 0.05)'))
      expect(scrim).toBeDefined()
      await act(async () => {
        fireEvent.click(scrim!)
      })

      await waitFor(() => {
        expect(document.querySelector<HTMLTextAreaElement>('[data-fw] textarea')).toBeNull()
      })
    })

    it('a failed POST does not add a ghost comment to the sidebar', async () => {
      const calls = mockFetch(
        () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
      )
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)
      // Suppress the component's warn-log for the expected failure.
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { textarea, getSendButton } = await enterCommentingMode()
      fireEvent.change(textarea, { target: { value: 'should not appear' } })
      fireEvent.click(getSendButton())

      await waitFor(() => {
        const posts = calls.filter((c) => c.init?.method === 'POST')
        expect(posts.length).toBe(1)
      })

      await new Promise((r) => setTimeout(r, 20))

      // Textarea still holds the draft, so body.textContent would false-match.
      // The sidebar empty-state is the real signal that state wasn't mutated.
      const sidebarEmpty = Array.from(
        document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
      ).some((el) => el.textContent === 'No comments yet')
      expect(sidebarEmpty).toBe(true)

      expect(console.warn).toHaveBeenCalled()
    })
  })

  describe('selecting mode', () => {
    it('renders the instruction bar with the Esc keybind hint', async () => {
      mockFetch()
      render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)

      await waitFor(() => {
        if (document.querySelectorAll('[data-fw]').length === 0) {
          throw new Error('widget root not mounted yet')
        }
      })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'c' })
      })

      await waitFor(() => {
        expect(document.body.textContent).toContain('Click any element to leave feedback')
      })
      // The Esc badge styling is the line we're guarding here — assert the
      // dedicated badge node, not just a substring of the whole document.
      const badge = Array.from(
        document.querySelectorAll<HTMLSpanElement>('[data-fw] span'),
      ).find((el) => el.textContent === 'Esc')
      expect(badge).toBeDefined()
    })
  })

  describe('sidebar comment list', () => {
    function commentsResponse(comments: unknown[]) {
      return () => new Response(JSON.stringify(comments), { status: 200 })
    }

    function seedComment(overrides: Record<string, unknown> = {}) {
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

    it('sidebar X button closes the sidebar and the kebab Reopen menu toggles status', async () => {
      mockFetch(undefined, commentsResponse([seedComment({ reviewStatus: 'accepted' })]))
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      await waitFor(() => {
        if (!document.body.textContent?.includes('sidebar entry')) {
          throw new Error('comment not rendered yet')
        }
      })

      // Open sidebar via shortcut.
      await act(async () => {
        fireEvent.keyDown(window, { key: 'm' })
      })

      // Click the X close button in the sidebar header. It's the second
      // button right after the filter button in the header.
      const closeBtn = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
      ).find((b) => {
        const svg = b.querySelector('svg')
        return svg && svg.querySelector('line') && b.title === ''
      })
      expect(closeBtn).toBeDefined()
      await act(async () => {
        fireEvent.click(closeBtn!)
      })

      // Re-open and click the kebab Reopen menu (status=accepted).
      await act(async () => {
        fireEvent.keyDown(window, { key: 'm' })
      })

      const card = document.querySelector('[data-fw] .fw-sidebar-card')!
      // Hover reveals the action buttons; the kebab "More" is the second one.
      const moreBtn = card.querySelector<HTMLButtonElement>('button[title="More"]')!
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const reopen = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
      ).find((b) => b.textContent?.trim() === 'Reopen')
      expect(reopen).toBeDefined()
      await act(async () => {
        fireEvent.click(reopen!)
      })
    })

    it('clicking a card body switches to inline edit mode and Save updates the comment text', async () => {
      mockFetch(undefined, commentsResponse([seedComment()]))
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      // Wait for the comment to land in the DOM, then locate the inner text
      // div by its cursor:text style — that's the inline-edit trigger.
      await waitFor(() => {
        if (!document.body.textContent?.includes('sidebar entry')) {
          throw new Error('comment body not rendered yet')
        }
      })
      const bodyDiv = Array.from(
        document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
      ).find(
        (el) =>
          /cursor:\s*text/.test(el.getAttribute('style') ?? '') &&
          el.textContent === 'sidebar entry',
      )
      expect(bodyDiv).toBeDefined()

      fireEvent.click(bodyDiv!)

      const editArea = await waitFor(() => {
        const ta = document.querySelector<HTMLTextAreaElement>('[data-fw] textarea')
        if (!ta) throw new Error('edit textarea not mounted yet')
        return ta
      })

      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-fw] button'))
      const cancel = buttons.find((b) => b.textContent === 'Cancel')
      const save = buttons.find((b) => b.textContent === 'Save')
      expect(cancel).toBeDefined()
      expect(save).toBeDefined()

      // saveEdit is local-only: it mutates the in-memory comment state and
      // exits edit mode. The text node should reflect the new body.
      fireEvent.change(editArea, { target: { value: 'edited body' } })
      fireEvent.click(save!)

      await waitFor(() => {
        if (document.querySelector('[data-fw] textarea')) {
          throw new Error('still in edit mode')
        }
      })
      expect(document.body.textContent).toContain('edited body')
      expect(document.body.textContent).not.toContain('sidebar entry')
    })

    it('Cancel exits inline edit without dispatching a PATCH', async () => {
      const calls = mockFetch(undefined, commentsResponse([seedComment()]))
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      await waitFor(() => {
        if (!document.body.textContent?.includes('sidebar entry')) {
          throw new Error('comment body not rendered yet')
        }
      })
      const bodyDiv = Array.from(
        document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
      ).find(
        (el) =>
          /cursor:\s*text/.test(el.getAttribute('style') ?? '') &&
          el.textContent === 'sidebar entry',
      )
      expect(bodyDiv).toBeDefined()
      fireEvent.click(bodyDiv!)

      const cancel = await waitFor(() => {
        const btn = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
        ).find((b) => b.textContent === 'Cancel')
        if (!btn) throw new Error('Cancel button not mounted yet')
        return btn
      })
      fireEvent.click(cancel)

      await waitFor(() => {
        expect(document.querySelector('[data-fw] textarea')).toBeNull()
      })
      expect(calls.find((c) => c.init?.method === 'PATCH')).toBeUndefined()
    })

    it('clicking the card surface opens the pin detail popover with the meta line', async () => {
      mockFetch(undefined, commentsResponse([seedComment()]))
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      const card = await waitFor(() => {
        const el = document.querySelector<HTMLDivElement>('[data-fw] .fw-sidebar-card')
        if (!el) throw new Error('sidebar card not mounted yet')
        return el
      })
      fireEvent.click(card)

      // The detail popover meta line is "#<n> · <timeAgo>" — the middot is
      // unique to that popover and a stable signal that line 1190 mounted.
      await waitFor(() => {
        const meta = Array.from(
          document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
        ).find((el) => /#1\s*·/.test(el.textContent ?? ''))
        if (!meta) throw new Error('pin detail meta line not rendered yet')
      })
    })

    it('renders empty-state copy when no comments are loaded', async () => {
      mockFetch(undefined, commentsResponse([]))
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)
      await waitFor(() => {
        expect(document.body.textContent).toContain('No comments yet')
      })
    })

    it('renders the filter-mismatch copy when comments exist but the active filter excludes them all', async () => {
      mockFetch(undefined, commentsResponse([seedComment({ reviewStatus: 'accepted' })]))
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      // Wait until the comment lands so the empty-but-filtered branch is real.
      await waitFor(() => {
        if (!document.body.textContent?.includes('sidebar entry')) {
          throw new Error('comment not loaded yet')
        }
      })

      // Open the filter menu via the title="Filter" button.
      const filterBtn = document.querySelector<HTMLButtonElement>('[data-fw] button[title="Filter"]')
      expect(filterBtn).not.toBeNull()
      fireEvent.click(filterBtn!)

      // Click the "Open" option — only accepted exists, so the list goes empty.
      const openOption = await waitFor(() => {
        const btn = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
        ).find((b) => b.textContent?.trim() === 'Open')
        if (!btn) throw new Error('Open filter option not mounted yet')
        return btn
      })
      fireEvent.click(openOption)

      await waitFor(() => {
        expect(document.body.textContent).toContain('No comments match this filter')
      })
    })

    it('hovering a pin marker shows a tooltip with the author + comment body', async () => {
      mockFetch(undefined, commentsResponse([seedComment({ body: 'hover me' })]))
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      // Pin markers render in the absolute layer — pick the wrapper whose
      // onMouseEnter triggers the hovered state. Identify it by its
      // animation: fw-pin-glow-pulse style which is unique to pin markers.
      const pin = await waitFor(() => {
        const el = Array.from(
          document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
        ).find((d) => /fw-pin-glow-pulse/.test(d.getAttribute('style') ?? ''))
        if (!el) throw new Error('pin marker not rendered yet')
        return el
      })
      fireEvent.mouseEnter(pin)

      await waitFor(() => {
        expect(document.body.textContent).toContain('hover me')
        // Author shows as 'Ada' inside the tooltip layer alongside the body.
        expect(document.body.textContent).toContain('Ada')
      })
    })

    it('numbers pins descending so the newest comment is #N for N comments', async () => {
      mockFetch(undefined, commentsResponse([
        seedComment({ id: 'c1', body: 'first', createdAt: '2026-04-22T00:00:00Z' }),
        seedComment({ id: 'c2', body: 'second', createdAt: '2026-04-23T00:00:00Z' }),
        seedComment({ id: 'c3', body: 'third', createdAt: '2026-04-24T00:00:00Z' }),
      ]))
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      await waitFor(() => {
        if (!document.body.textContent?.includes('third')) {
          throw new Error('comments not loaded yet')
        }
      })

      const cards = Array.from(
        document.querySelectorAll<HTMLDivElement>('[data-fw] .fw-sidebar-card'),
      )
      expect(cards.length).toBe(3)
      // Cards render in API-supplied order; pin number = total - index, so
      // the first card gets the highest number.
      expect(cards[0].textContent).toContain('#3')
      expect(cards[1].textContent).toContain('#2')
      expect(cards[2].textContent).toContain('#1')
    })
  })

  describe('keyboard shortcuts', () => {
    it('"s" enters feedback (selecting) mode', async () => {
      mockFetch()
      render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)
      await waitFor(() => {
        if (document.querySelectorAll('[data-fw]').length === 0) {
          throw new Error('not mounted')
        }
      })
      await act(async () => {
        fireEvent.keyDown(window, { key: 's' })
      })
      await waitFor(() => {
        expect(document.body.textContent).toContain('Click any element to leave feedback')
      })
    })

    it('Escape exits selecting mode and clears the instruction bar', async () => {
      mockFetch()
      render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)
      await waitFor(() => {
        if (document.querySelectorAll('[data-fw]').length === 0) {
          throw new Error('not mounted')
        }
      })
      await act(async () => {
        fireEvent.keyDown(window, { key: 'c' })
      })
      await waitFor(() => {
        expect(document.body.textContent).toContain('Click any element to leave feedback')
      })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' })
      })
      await waitFor(() => {
        expect(document.body.textContent).not.toContain('Click any element to leave feedback')
      })
    })

    it('"m" toggles sidebar visibility (transform flips between hidden/shown)', async () => {
      mockFetch()
      render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)
      await waitFor(() => {
        if (document.querySelectorAll('[data-fw]').length === 0) {
          throw new Error('not mounted')
        }
      })

      // The sidebar is always rendered; only its transform changes. Find the
      // single root-level sidebar by its width: 340px footprint.
      const findSidebar = () =>
        Array.from(document.querySelectorAll<HTMLDivElement>('[data-fw] div')).find(
          (el) => /width:\s*340px/.test(el.getAttribute('style') ?? ''),
        )

      expect(findSidebar()?.getAttribute('style')).toMatch(/translateX\(100%\)/)

      await act(async () => {
        fireEvent.keyDown(window, { key: 'm' })
      })
      await waitFor(() => {
        expect(findSidebar()?.getAttribute('style')).toMatch(/translateX\(0/)
      })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'm' })
      })
      await waitFor(() => {
        expect(findSidebar()?.getAttribute('style')).toMatch(/translateX\(100%\)/)
      })
    })
  })

  describe('end-to-end submit + approve flow', () => {
    it('captures a comment, surfaces it in the sidebar, and approves it through the pin detail popover', async () => {
      const calls = mockFetch()
      render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

      // 1. Enter selecting mode, click a target, fill the name modal, type,
      //    and send. The submit-flow describe already exercises this — we
      //    re-walk it here so the assertion below is end-to-end.
      const { textarea, getSendButton } = await enterCommentingMode()
      fireEvent.change(textarea, { target: { value: 'e2e bug' } })
      fireEvent.click(getSendButton())

      await waitFor(() => {
        const post = calls.find((c) => c.init?.method === 'POST')
        expect(post).toBeDefined()
      })

      // 2. The optimistic insert lands the comment in the sidebar.
      const card = await waitFor(() => {
        const el = document.querySelector<HTMLDivElement>('[data-fw] .fw-sidebar-card')
        if (!el) throw new Error('sidebar card not mounted yet')
        return el
      })
      expect(card.textContent).toContain('e2e bug')

      // 3. Clicking the card opens the pin detail popover.
      fireEvent.click(card)
      const approveBtn = await waitFor(() => {
        const btn = document.querySelector<HTMLButtonElement>('[data-fw] button[title="Approve"]')
        if (!btn) throw new Error('Approve button not mounted yet')
        return btn
      })

      // 4. Approve issues a PATCH to the public endpoint with reviewStatus=accepted.
      fireEvent.click(approveBtn)
      await waitFor(() => {
        const patch = calls.find((c) => c.init?.method === 'PATCH')
        expect(patch).toBeDefined()
        const body = JSON.parse(String(patch?.init?.body))
        expect(body.reviewStatus).toBe('accepted')
      })
    })
  })
})
