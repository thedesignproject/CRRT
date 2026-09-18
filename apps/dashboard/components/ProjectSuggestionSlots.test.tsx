import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AddProjectPopover } from './AddProjectPopover'
import { WelcomeScreen } from './WelcomeScreen'
it('shows suggestions before project creation on the welcome screen and dialog', () => {
  const suggestions = <div>Company project suggestions</div>
  const welcome = render(<WelcomeScreen onCreateProject={vi.fn()} onOpenExtensionComments={vi.fn()} suggestedProjects={suggestions} />)
  expect(screen.getByText('Company project suggestions')).toBeInTheDocument()
  welcome.unmount()
  render(<AddProjectPopover onAdd={vi.fn()} onClose={vi.fn()} checkAvailability={vi.fn()} suggestedProjects={suggestions} />)
  expect(screen.getByRole('dialog')).toContainElement(screen.getByText('Company project suggestions'))
  expect(screen.getByRole('dialog').querySelector('.overflow-y-auto')).toBeTruthy()
})
