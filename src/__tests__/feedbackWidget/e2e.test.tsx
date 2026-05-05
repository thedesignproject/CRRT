import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
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

describe('<FeedbackWidget /> end-to-end submit + approve flow', () => {
  widgetTestSetup()

  it('captures a comment, surfaces it in the sidebar, and approves it through the pin detail popover', async () => {
    const calls = mockFetch()
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    const { textarea, getSendButton } = await enterCommentingMode()
    fireEvent.change(textarea, { target: { value: 'e2e bug' } })
    fireEvent.click(getSendButton())

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST')
      expect(post).toBeDefined()
    })

    const card = await waitFor(() => {
      const el = document.querySelector<HTMLDivElement>('[data-fw] .fw-sidebar-card')
      if (!el) throw new Error('sidebar card not mounted yet')
      return el
    })
    expect(card.textContent).toContain('e2e bug')

    fireEvent.click(card)
    const approveBtn = await waitFor(() => {
      const btn = document.querySelector<HTMLButtonElement>('[data-fw] button[title="Approve"]')
      if (!btn) throw new Error('Approve button not mounted yet')
      return btn
    })

    fireEvent.click(approveBtn)
    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH')
      expect(patch).toBeDefined()
      const body = JSON.parse(String(patch?.init?.body))
      expect(body.reviewStatus).toBe('accepted')
    })
  })
})
