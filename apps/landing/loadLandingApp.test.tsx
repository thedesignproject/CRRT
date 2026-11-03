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

it('uses an embedded catalog instead of loading a development fallback', async () => {
  const script=document.createElement('script')
  script.id='resource-catalog-data';script.type='application/json'
  script.textContent=JSON.stringify([{slug:'example',title:'Example',takeaway:'A task',track:'design-systems',minutes:2,category:0}])
  document.body.append(script)
  try {
    render(await loadLandingApp('/resources'))
    expect(screen.getByText('Resource surface: /resources')).toBeInTheDocument()
    expect(script.textContent).toContain('"slug":"example"')
  } finally { script.remove() }
})
