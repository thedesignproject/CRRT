import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, vi } from 'vitest'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

export const waitForPublication = () => waitFor(() => expect(screen.queryByLabelText('Loading published document')).not.toBeInTheDocument())

/** Drive the real widget menu rather than assuming an always-open document form. */
export function openNote() {
  if (screen.queryByLabelText('Leave feedback') || screen.queryByLabelText('Reply') || screen.queryByRole('dialog', { name: 'Your feedback identity' })) return
  fireEvent.keyDown(document, { key: 'Escape' })
  const launcher = screen.queryByRole('button', { name: 'Open CRRT menu' })
  if (launcher) fireEvent.click(launcher)
  fireEvent.click(screen.getByRole('menuitem', { name: /Add note/ }))
}

export function nameField() {
  openNote()
  if (!screen.queryByLabelText('Your name')) {
    const avatar = document.querySelector<HTMLButtonElement>('button[title^="Signed in as"]')
    if (avatar) fireEvent.click(avatar)
  }
  return screen.getByLabelText('Your name')
}

export function feedbackField() {
  openNote()
  const identity = screen.queryByRole('dialog', { name: 'Your feedback identity' })
  if (identity) fireEvent.click(screen.getByRole('button', { name: /^(Continue|Save)$/ }))
  return screen.getByLabelText('Leave feedback')
}

export function replyField() {
  const identity = screen.queryByRole('dialog', { name: 'Your feedback identity' })
  if (identity) fireEvent.click(screen.getByRole('button', { name: /^(Continue|Save)$/ }))
  return screen.getByLabelText('Reply')
}

export function openFeedbackList() {
  fireEvent.keyDown(document, { key: 'Escape' })
  const launcher = screen.queryByRole('button', { name: 'Open CRRT menu' })
  if (launcher) fireEvent.click(launcher)
  fireEvent.click(screen.getByRole('menuitem', { name: /Open sidebar/ }))
}
