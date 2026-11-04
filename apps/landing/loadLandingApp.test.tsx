import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { resources, resourcePath } from './resources/content'

vi.mock('./App', () => ({ App: () => <main>Application surface</main> }))
vi.mock('./resources/ResourcesPage', () => ({ ResourcesPage: ({ pathname, children }: { pathname: string; children?: ReactNode }) => <div>Resource surface: {pathname}{children}</div> }))
import { loadLandingApp } from './loadLandingApp'

afterEach(() => document.getElementById('resource-page-data')?.remove())

it.each(resources.filter(resource => resource.tool))('hydrates the prerendered $slug tool with working controls', async resource => {
  const data = document.createElement('script')
  data.id = 'resource-page-data'
  data.type = 'application/json'
  data.textContent = JSON.stringify(resource)
  document.body.append(data)
  render(await loadLandingApp(resourcePath(resource)))
  expect(screen.getByRole('region', { name: 'Interactive tool' })).toBeInTheDocument()
  expect(screen.queryAllByRole('textbox').length + screen.queryAllByRole('spinbutton').length).toBeGreaterThan(0)
})

it.each(['/resources', '/resources/', '/resources/design-tokens-for-ai-prototypes'])('loads only the resource surface for %s', async path => {
  render(await loadLandingApp(path))
  expect(screen.getByText(`Resource surface: ${path}`)).toBeInTheDocument()
  expect(screen.queryByText('Application surface')).not.toBeInTheDocument()
})

it.each(['/', '/docs/install', '/dashboard', '/resources-other'])('preserves the existing application entry for %s', async path => {
  render(await loadLandingApp(path))
  expect(screen.getByText('Application surface')).toBeInTheDocument()
})
