import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommentInputPopover } from '../components/FeedbackWidget/pin/CommentInputPopover'
import type { ClickTarget } from '../components/FeedbackWidget/types'

const target: ClickTarget = { selector: 'body', x: 50, y: 50, url: 'http://localhost/' }

function renderPopover(overrides: Partial<Parameters<typeof CommentInputPopover>[0]> = {}) {
  const handlers = {
    target,
    comment: '',
    onCommentChange: vi.fn(),
    sending: false,
    imagePreviewUrl: null as string | null,
    hasImage: false,
    authorName: null as string | null,
    onSend: vi.fn(),
    onCancel: vi.fn(),
    onEditName: vi.fn(),
    onClearImage: vi.fn(),
    textareaRef: createRef<HTMLTextAreaElement>(),
    ...overrides,
  }
  const utils = render(<CommentInputPopover {...handlers} />)
  return { ...utils, ...handlers }
}

describe('<CommentInputPopover />', () => {
  it('scrim click fires onCancel', () => {
    const { container, onCancel } = renderPopover()
    const scrim = Array.from(
      container.querySelectorAll<HTMLDivElement>('div'),
    ).find((d) => (d.getAttribute('style') ?? '').includes('rgba(0, 0, 0, 0.05)'))!
    fireEvent.click(scrim)
    expect(onCancel).toHaveBeenCalled()
  })

  it('avatar click fires onEditName and shows "Signed in as" title when authorName set', () => {
    const { onEditName, container } = renderPopover({ authorName: 'Ada' })
    const avatar = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => (b.title ?? '').startsWith('Signed in as'),
    )!
    fireEvent.click(avatar)
    expect(onEditName).toHaveBeenCalled()
  })

  it('avatar shows "Set your name" title when authorName is null', () => {
    const { container } = renderPopover()
    const avatar = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.title === 'Set your name',
    )
    expect(avatar).toBeDefined()
  })

  it('typing fires onCommentChange', () => {
    const { onCommentChange } = renderPopover()
    const ta = document.querySelector<HTMLTextAreaElement>('textarea')!
    fireEvent.change(ta, { target: { value: 'hello' } })
    expect(onCommentChange).toHaveBeenCalledWith('hello')
  })

  it('Enter triggers onSend when comment is non-empty', () => {
    const { onSend } = renderPopover({ comment: 'hi' })
    const ta = document.querySelector<HTMLTextAreaElement>('textarea')!
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSend).toHaveBeenCalled()
  })

  it('Enter is a no-op when comment is empty', () => {
    const { onSend } = renderPopover({ comment: '' })
    const ta = document.querySelector<HTMLTextAreaElement>('textarea')!
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('Shift+Enter does NOT trigger onSend', () => {
    const { onSend } = renderPopover({ comment: 'hi' })
    const ta = document.querySelector<HTMLTextAreaElement>('textarea')!
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('non-Enter keys are no-ops', () => {
    const { onSend } = renderPopover({ comment: 'hi' })
    const ta = document.querySelector<HTMLTextAreaElement>('textarea')!
    fireEvent.keyDown(ta, { key: 'a' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('expanded layout (typed comment) shows toolbar with Send button + paint handlers', () => {
    const { onSend, container } = renderPopover({ comment: 'typed' })
    const sendBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label="Send"]'))
    // Toolbar Send button is enabled.
    const enabledSend = sendBtns.find((b) => !b.disabled)
    expect(enabledSend).toBeDefined()
    fireEvent.click(enabledSend!)
    expect(onSend).toHaveBeenCalled()

    // Toolbar emoji + mention paint handlers.
    const toolbarBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => b.style.borderRadius === '6px',
    )
    for (const b of toolbarBtns) {
      fireEvent.mouseEnter(b)
      fireEvent.mouseLeave(b)
    }
  })

  it('expanded layout when hasImage is true (no typed comment) renders toolbar', () => {
    const { container } = renderPopover({ hasImage: true })
    const sendBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label="Send"]'))
    expect(sendBtns.length).toBeGreaterThan(0)
  })

  it('Send button is disabled while sending', () => {
    const { container } = renderPopover({ comment: 'hi', sending: true })
    const enabled = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[aria-label="Send"]'),
    ).find((b) => !b.disabled)
    expect(enabled).toBeUndefined()
  })

  it('image preview thumbnail clear button fires onClearImage with paint handlers', () => {
    const { container, onClearImage } = renderPopover({ imagePreviewUrl: 'blob:abc' })
    const img = container.querySelector('img')!
    expect(img.src).toContain('blob:abc')
    // The clear button is the only button with the small "X" svg in the preview row.
    const clear = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => {
      const svg = b.querySelector('svg')
      return svg && svg.querySelector('line[x1="18"]')
    })!
    fireEvent.mouseEnter(clear)
    fireEvent.mouseLeave(clear)
    fireEvent.click(clear)
    expect(onClearImage).toHaveBeenCalled()
  })

  it('renders a new-comment pin marker pinned at the target coords', () => {
    const { container } = renderPopover()
    const pin = Array.from(container.querySelectorAll<HTMLDivElement>('div')).find((d) => /fw-pin-glow-pulse/.test(d.style.animation ?? ''))
    expect(pin).toBeDefined()
  })
})
