import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('./App', () => ({ App: () => <main>Application surface</main> }))
vi.mock('./resources/ResourcesPage', () => ({ ResourcesPage: ({ pathname }: { pathname: string }) => <main>Resource surface: {pathname}</main> }))
import { loadLandingApp } from './loadLandingApp'

it.each(['/resources', '/resources/', '/resources/design-tokens-for-ai-prototypes'])('loads only the resource surface for %s', async path => {
  render(await loadLandingApp(path))
  expect(screen.getByText(`Resource surface: ${path}`)).toBeInTheDocument()
  expect(screen.queryByText('Application surface')).not.toBeInTheDocument()
})

it.each(['/', '/docs/install', '/dashboard', '/resources-other'])('preserves the existing application entry for %s', async path => {
  render(await loadLandingApp(path))
  expect(screen.getByText('Application surface')).toBeInTheDocument()
})

it('preloads the interactive module for extended utilities while retaining resource routing', async () => {
  render(await loadLandingApp('/resources/hex-rgb-converter'))
  expect(screen.getByText('Resource surface: /resources/hex-rgb-converter')).toBeInTheDocument()
})

it('loads the basic calculator without requesting the extended tool surface', async () => {
  render(await loadLandingApp('/resources/text-contrast-checker'))
  expect(screen.getByText('Resource surface: /resources/text-contrast-checker')).toBeInTheDocument()
})
