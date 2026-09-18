import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WelcomeScreen } from './WelcomeScreen'

describe('WelcomeScreen extension access', () => {
  it('opens personal extension comments without creating a project', () => {
    const open = vi.fn()
    render(<WelcomeScreen onCreateProject={vi.fn()} onOpenExtensionComments={open} />)
    fireEvent.click(screen.getByRole('button', { name: /view my extension comments/i }))
    expect(open).toHaveBeenCalled()
  })
})
