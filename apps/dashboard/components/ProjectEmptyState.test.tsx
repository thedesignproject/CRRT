import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectEmptyState } from './ProjectEmptyState'
import { setupPrompt } from '../lib/setup-prompt'

describe('ProjectEmptyState', () => {
  it('gives one setup prompt and keeps Storybook an optional step', () => {
    const onConnectStorybook = vi.fn()
    render(<ProjectEmptyState projectId="project-1" onConnectStorybook={onConnectStorybook} />)
    expect(screen.getByRole('heading', { name: 'Bring feedback into this project' })).toBeInTheDocument()
    expect(document.querySelector('pre')).toHaveTextContent(setupPrompt('project-1').replace(/\s+/g, ' '), { normalizeWhitespace: true })
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText('Install the widget').closest('li')).toHaveAttribute('aria-current', 'step')
    fireEvent.click(screen.getByRole('button', { name: 'Connect Storybook' }))
    expect(onConnectStorybook).toHaveBeenCalledOnce()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('leaves Storybook out for people who cannot manage it', () => {
    render(<ProjectEmptyState projectId="project-1" />)
    expect(screen.queryByText('Connect Storybook')).toBeNull()
  })
})
