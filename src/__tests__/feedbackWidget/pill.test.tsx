import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
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

describe('<FeedbackWidget /> floating pill buttons', () => {
  widgetTestSetup()

  it('pill buttons toggle mode, pins, sidebar (and agent when revealed)', async () => {
    mockFetch()
    render(<FeedbackWidget projectId="proj" apiBase="https://x.example/api" />)

    const pill = await waitFor(() => {
      const node = Array.from(document.querySelectorAll<HTMLDivElement>('[data-fw]')).find(
        (el) => /cursor:\s*grab/.test(el.getAttribute('style') ?? ''),
      )
      if (!node) throw new Error('pill not mounted yet')
      return node
    })
    const buttons = Array.from(pill.querySelectorAll<HTMLButtonElement>('button'))
    expect(buttons.length).toBeGreaterThanOrEqual(3)

    await act(async () => {
      fireEvent.click(buttons[0]!)
    })
    await waitFor(() => {
      expect(document.body.textContent).toContain('Click any element to leave feedback')
    })

    await act(async () => {
      fireEvent.click(buttons[1]!)
    })
    await act(async () => {
      fireEvent.click(buttons[2]!)
    })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'A', shiftKey: true })
    })
    const refreshed = Array.from(pill.querySelectorAll<HTMLButtonElement>('button'))
    expect(refreshed.length).toBe(4)
    await act(async () => {
      fireEvent.click(refreshed[2]!)
    })
    await waitFor(() => {
      const modal = Array.from(document.querySelectorAll<HTMLElement>('[data-fw]')).find(
        (el) => el.textContent?.includes('agent') || el.textContent?.includes('Agent'),
      )
      expect(modal).toBeDefined()
    })
  })
})
