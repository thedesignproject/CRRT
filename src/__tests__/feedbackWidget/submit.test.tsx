import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { FeedbackWidget } from '../../components/FeedbackWidget'
import { enterCommentingMode, mockFetch, widgetTestSetup } from '../helpers/feedbackWidgetHarness'

vi.mock('../../lib/screenshotCapture', async () => {
  const actual = await vi.importActual<typeof import('../../lib/screenshotCapture')>(
    '../../lib/screenshotCapture',
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

describe('<FeedbackWidget /> submit flow', () => {
  widgetTestSetup()

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
    fireEvent.change(textarea, { target: { value: 'check screenshot' } })

    await waitFor(() => {
      expect(document.body.textContent).toContain('Screenshot captured')
    })
  })

  it('opens the name editor from the popover avatar and closes it via the X button', async () => {
    mockFetch()
    try { localStorage.setItem('fw-author-name', 'Existing User') } catch {}
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

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

  it('a network error during POST is caught and logged without throwing', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      if (init?.method === 'POST') throw new Error('network down')
      return new Response('[]', { status: 200 })
    })
    vi.stubGlobal('fetch', impl)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    const { textarea, getSendButton } = await enterCommentingMode()
    fireEvent.change(textarea, { target: { value: 'will throw' } })
    fireEvent.click(getSendButton())

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith('[FeedbackWidget] API error:', expect.any(Error))
    })
  })

  it('a failed POST does not add a ghost comment to the sidebar', async () => {
    const calls = mockFetch(
      () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    )
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { textarea, getSendButton } = await enterCommentingMode()
    fireEvent.change(textarea, { target: { value: 'should not appear' } })
    fireEvent.click(getSendButton())

    await waitFor(() => {
      const posts = calls.filter((c) => c.init?.method === 'POST')
      expect(posts.length).toBe(1)
    })

    await new Promise((r) => setTimeout(r, 20))

    const sidebarEmpty = Array.from(
      document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
    ).some((el) => el.textContent === 'No comments yet')
    expect(sidebarEmpty).toBe(true)

    expect(console.warn).toHaveBeenCalled()
  })
})
