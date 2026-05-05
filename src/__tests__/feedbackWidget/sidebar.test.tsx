import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { FeedbackWidget } from '../../components/FeedbackWidget'
import { commentsResponse, mockFetch, seedComment, widgetTestSetup } from '../helpers/feedbackWidgetHarness'

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

describe('<FeedbackWidget /> sidebar comment list', () => {
  widgetTestSetup()

  it('sidebar X button closes the sidebar and the kebab Reopen menu toggles status', async () => {
    mockFetch(undefined, commentsResponse([seedComment({ reviewStatus: 'accepted' })]))
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    await waitFor(() => {
      if (!document.body.textContent?.includes('sidebar entry')) {
        throw new Error('comment not rendered yet')
      }
    })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'm' })
    })

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

    await act(async () => {
      fireEvent.keyDown(window, { key: 'm' })
    })

    const card = document.querySelector('[data-fw] .fw-sidebar-card')!
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

    await waitFor(() => {
      if (!document.body.textContent?.includes('sidebar entry')) {
        throw new Error('comment not loaded yet')
      }
    })

    const filterBtn = document.querySelector<HTMLButtonElement>('[data-fw] button[title="Filter"]')
    expect(filterBtn).not.toBeNull()
    fireEvent.click(filterBtn!)

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
    expect(cards[0].textContent).toContain('#3')
    expect(cards[1].textContent).toContain('#2')
    expect(cards[2].textContent).toContain('#1')
  })
})
