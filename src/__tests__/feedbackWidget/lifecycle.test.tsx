import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { FeedbackWidget } from '../../components/FeedbackWidget'
import { mockFetch, widgetTestSetup } from '../helpers/feedbackWidgetHarness'

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

describe('<FeedbackWidget /> lifecycle', () => {
  widgetTestSetup()

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

  it('renders the instruction bar with the Esc keybind hint', async () => {
    const { act } = await import('@testing-library/react')
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
    const badge = Array.from(
      document.querySelectorAll<HTMLSpanElement>('[data-fw] span'),
    ).find((el) => el.textContent === 'Esc')
    expect(badge).toBeDefined()
  })
})
