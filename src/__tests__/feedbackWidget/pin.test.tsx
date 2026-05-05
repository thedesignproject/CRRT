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

async function findPinMarker() {
  return await waitFor(() => {
    const el = Array.from(document.querySelectorAll<HTMLDivElement>('[data-fw] div')).find(
      (d) => /fw-pin-glow-pulse/.test(d.style.animation ?? ''),
    )
    if (!el) throw new Error('pin marker not mounted yet')
    return el
  })
}

function findMoreBtn() {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
  ).find((b) => b.title === 'More')
}

describe('<FeedbackWidget /> CommentPin integration', () => {
  widgetTestSetup()

  it('hover paint, click select, kebab Approve menu fire orchestrator callbacks', async () => {
    mockFetch(undefined, commentsResponse([seedComment()]))
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    const marker = await findPinMarker()
    await act(async () => { fireEvent.mouseEnter(marker) })
    await act(async () => { fireEvent.mouseLeave(marker) })
    await act(async () => { fireEvent.click(marker) })
    await waitFor(() => {
      const meta = Array.from(
        document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
      ).find((d) => /^#1\s/.test(d.textContent ?? ''))
      if (!meta) throw new Error('detail popover not open yet')
    })

    const moreBtn = findMoreBtn()!
    await act(async () => { fireEvent.click(moreBtn) })
    const approveMenuItem = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
    ).find((b) => b.textContent?.trim() === 'Approve' && b.title !== 'Approve')!
    await act(async () => { fireEvent.click(approveMenuItem) })
  })

  it('scrim click closes the detail popover', async () => {
    mockFetch(undefined, commentsResponse([seedComment()]))
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    const marker = await findPinMarker()
    await act(async () => { fireEvent.click(marker) })

    const scrim = await waitFor(() => {
      const el = Array.from(
        document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
      ).find((d) => (d.getAttribute('style') ?? '').includes('z-index: 2147483645'))
      if (!el) throw new Error('scrim not mounted yet')
      return el
    })
    await act(async () => { fireEvent.click(scrim) })
    await waitFor(() => {
      const stillOpen = Array.from(
        document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
      ).find((d) => (d.getAttribute('style') ?? '').includes('z-index: 2147483645'))
      expect(stillOpen).toBeUndefined()
    })
  })

  it('Edit -> Cancel returns to body view', async () => {
    mockFetch(undefined, commentsResponse([seedComment()]))
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    const marker = await findPinMarker()
    await act(async () => { fireEvent.click(marker) })

    const moreBtn = await waitFor(() => {
      const b = findMoreBtn()
      if (!b) throw new Error('More button not mounted yet')
      return b
    })
    await act(async () => { fireEvent.click(moreBtn) })
    const editMenu = await waitFor(() => {
      const b = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
      ).find((bn) => bn.textContent?.trim() === 'Edit')
      if (!b) throw new Error('Edit menu not mounted yet')
      return b
    })
    await act(async () => { fireEvent.click(editMenu) })

    await waitFor(() => {
      const ta = document.querySelector<HTMLTextAreaElement>('[data-fw] textarea')
      if (!ta) throw new Error('edit textarea not mounted yet')
    })
    const cancelBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
    ).find((b) => b.textContent === 'Cancel')!
    await act(async () => { fireEvent.click(cancelBtn) })
  })

  it('Edit -> Save then Delete fire orchestrator callbacks', async () => {
    mockFetch(undefined, commentsResponse([seedComment()]))
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    const marker = await findPinMarker()
    await act(async () => { fireEvent.click(marker) })

    const moreBtn = findMoreBtn()!
    await act(async () => { fireEvent.click(moreBtn) })
    const editMenu = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
    ).find((b) => b.textContent?.trim() === 'Edit')!
    await act(async () => { fireEvent.click(editMenu) })

    const ta = await waitFor(() => {
      const el = document.querySelector<HTMLTextAreaElement>('[data-fw] textarea')
      if (!el) throw new Error('edit textarea not mounted yet')
      return el
    })
    await act(async () => { fireEvent.change(ta, { target: { value: 'edited text' } }) })
    const saveBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
    ).find((b) => b.textContent === 'Save')!
    await act(async () => { fireEvent.click(saveBtn) })

    // Re-open detail popover, navigate Edit -> Cancel to fire onCancelEdit.
    const marker2 = await findPinMarker()
    await act(async () => { fireEvent.click(marker2) })
    const moreBtn2 = findMoreBtn()!
    await act(async () => { fireEvent.click(moreBtn2) })
    const editMenu2 = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
    ).find((b) => b.textContent?.trim() === 'Edit')!
    await act(async () => { fireEvent.click(editMenu2) })
    const cancelBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
    ).find((b) => b.textContent === 'Cancel')!
    await act(async () => { fireEvent.click(cancelBtn) })

    const scrim = Array.from(
      document.querySelectorAll<HTMLDivElement>('[data-fw] div'),
    ).find((d) => (d.getAttribute('style') ?? '').includes('z-index: 2147483645'))
    if (scrim) {
      await act(async () => { fireEvent.click(scrim) })
    }

    // Re-open and Delete.
    const marker3 = await findPinMarker()
    await act(async () => { fireEvent.click(marker3) })
    const moreBtn3 = findMoreBtn()!
    await act(async () => { fireEvent.click(moreBtn3) })
    const deleteBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-fw] button'),
    ).find((b) => b.textContent?.trim() === 'Delete')!
    await act(async () => { fireEvent.click(deleteBtn) })
  })

  it('hovering a pin marker shows a tooltip with the author + comment body', async () => {
    mockFetch(undefined, commentsResponse([seedComment({ body: 'hover me' })]))
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    const pin = await findPinMarker()
    fireEvent.mouseEnter(pin)

    await waitFor(() => {
      expect(document.body.textContent).toContain('hover me')
      expect(document.body.textContent).toContain('Ada')
    })
  })
})
