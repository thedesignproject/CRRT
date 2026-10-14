import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./StorybookIntegrationSettings', () => ({
  StorybookIntegrationSettings: (props: Record<string, unknown>) => (
    <div data-testid="storybook-settings">{JSON.stringify(props)}</div>
  ),
}))

import { ProjectEmptyState } from './ProjectEmptyState'

describe('ProjectEmptyState', () => {
  it('switches from the website instructions to the integrated Storybook setup', () => {
    render(<ProjectEmptyState projectId="project-1" apiBase="/api" accessToken="session" canManage={false} />)

    expect(screen.getByText('pnpm add @thedesignproject/crrt')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Website / App' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Storybook' }))

    expect(screen.queryByText('pnpm add @thedesignproject/crrt')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Storybook' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('storybook-settings')).toHaveTextContent('"appearance":"setup"')
    expect(screen.getByTestId('storybook-settings')).toHaveTextContent('"projectKey":"project-1"')
    expect(screen.getByTestId('storybook-settings')).toHaveTextContent('"canManage":false')

    fireEvent.click(screen.getByRole('tab', { name: 'Website / App' }))
    expect(screen.getByText('pnpm add @thedesignproject/crrt')).toBeInTheDocument()
  })
})
