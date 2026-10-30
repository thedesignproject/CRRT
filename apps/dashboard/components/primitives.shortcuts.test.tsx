import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ActionBtn } from './primitives'
it('hides disabled shortcut hints without disabling the action', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'disabled' })
  try {
    const click = vi.fn()
    render(<ActionBtn variant="accept" shortcut="A" onClick={click}>Accept</ActionBtn>)
    expect(screen.getByRole('button', { name: 'Accept' })).not.toHaveAttribute('title')
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(click).toHaveBeenCalledOnce()
  } finally { vi.unstubAllGlobals() }
})
