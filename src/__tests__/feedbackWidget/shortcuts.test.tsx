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

describe('<FeedbackWidget /> keyboard shortcuts', () => {
  widgetTestSetup()

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

  it('"h" toggles pins visibility', async () => {
    mockFetch()
    render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)
    await act(async () => { fireEvent.keyDown(window, { key: 'h' }) })
    await act(async () => { fireEvent.keyDown(window, { key: 'h' }) })
  })

  it('Escape closes the name modal when it is open', async () => {
    mockFetch()
    try { localStorage.setItem('fw-author-name', 'Ada') } catch {}
    render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)
    const target = document.createElement('article')
    document.body.appendChild(target)
    await act(async () => { fireEvent.keyDown(window, { key: 'c' }) })
    await act(async () => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const avatar = await waitFor(() => {
      const b = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-fw] button')).find(
        (bn) => (bn.title || '').startsWith('Signed in as'),
      )
      if (!b) throw new Error('avatar not mounted yet')
      return b
    })
    await act(async () => { fireEvent.click(avatar) })
    await waitFor(() => {
      expect(document.querySelector('button[aria-label="Close"]')).not.toBeNull()
    })
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    await waitFor(() => {
      expect(document.querySelector('button[aria-label="Close"]')).toBeNull()
    })
  })

  it('Escape clears selectedPin when a pin is open', async () => {
    mockFetch(undefined, () => new Response(JSON.stringify([{
      id: 'cE',
      projectId: 'p',
      pageUrl: window.location.href.split('#')[0],
      x: 20,
      y: 30,
      selector: 'body',
      body: 'pin escape',
      reviewStatus: 'open',
      createdAt: '2026-04-22T00:00:00Z',
    }]), { status: 200 }))
    render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)
    const marker = await waitFor(() => {
      const el = Array.from(document.querySelectorAll<HTMLDivElement>('[data-fw] div')).find(
        (d) => /fw-pin-glow-pulse/.test(d.style.animation ?? ''),
      )
      if (!el) throw new Error('pin not mounted yet')
      return el
    })
    await act(async () => { fireEvent.click(marker) })
    await waitFor(() => {
      const scrim = Array.from(document.querySelectorAll<HTMLDivElement>('[data-fw] div')).find(
        (d) => (d.getAttribute('style') ?? '').includes('z-index: 2147483645'),
      )
      if (!scrim) throw new Error('scrim not mounted yet')
    })
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    await waitFor(() => {
      const scrim = Array.from(document.querySelectorAll<HTMLDivElement>('[data-fw] div')).find(
        (d) => (d.getAttribute('style') ?? '').includes('z-index: 2147483645'),
      )
      expect(scrim).toBeUndefined()
    })
  })

  it('Escape closes the sidebar when it is the only thing open', async () => {
    mockFetch()
    render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)
    await act(async () => { fireEvent.keyDown(window, { key: 'm' }) })
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
  })

  it('Escape from commenting mode returns to selecting and clears the draft', async () => {
    mockFetch()
    render(<FeedbackWidget projectId="p" apiBase="https://x.example/api" />)
    const target = document.createElement('article')
    document.body.appendChild(target)
    await act(async () => { fireEvent.keyDown(window, { key: 'c' }) })
    await act(async () => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const nameInput = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[placeholder^="e.g."]')
      if (!el) throw new Error('name input not mounted yet')
      return el
    })
    await act(async () => { fireEvent.change(nameInput, { target: { value: 'X' } }) })
    await act(async () => { fireEvent.submit(nameInput.closest('form')!) })
    await waitFor(() => {
      expect(document.querySelector<HTMLTextAreaElement>('[data-fw] textarea')).not.toBeNull()
    })
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    await waitFor(() => {
      expect(document.querySelector<HTMLTextAreaElement>('[data-fw] textarea')).toBeNull()
    })
  })
})
