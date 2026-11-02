import { act, fireEvent, render as renderUI, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ThemeProvider } from '../../../src/design-system'
import { ResourcesPage } from './ResourcesPage'
import { resourceMinutes, resourcePath, resources } from './content'
import { render as prerender } from '../prerender'

const render = (node: ReactNode) => renderUI(<ThemeProvider defaultTheme="light">{node}</ThemeProvider>)

vi.mock('./ResourceFigure', () => ({ ResourceFigure: ({ track }: { track: string }) => <div data-testid={`figure-${track}`} /> }))

afterEach(() => vi.restoreAllMocks())

it('renders all guides, filters by topic, searches case-insensitively, and clears empty results', () => {
  render(<ResourcesPage pathname="/resources/" />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Build with AI.')
  expect(screen.getByRole('status')).toHaveTextContent(`${resources.length} resources to explore`)
  fireEvent.click(screen.getByRole('button', { name: 'Design systems' }))
  expect(screen.getByRole('status')).toHaveTextContent(`${resources.filter(resource => resource.track === 'design-systems').length} resources to explore`)
  expect(screen.queryByRole('heading', { name: 'Agentic workflows' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing-result' } })
  expect(screen.getByRole('heading', { name: 'No resources found' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByRole('status')).toHaveTextContent(`${resources.length} resources to explore`)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  LoVaBlE  ' } })
  expect(screen.getByRole('status')).toHaveTextContent('1 resource matching “LoVaBlE”')
  expect(screen.getByRole('heading', { name: resources[4].title })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(screen.getByRole('searchbox')).toHaveValue('')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'design systems' } })
  expect(screen.getByRole('status')).toHaveTextContent(`${resources.filter(resource => resource.track === 'design-systems').length} resources matching “design systems”`)
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  fireEvent.click(screen.getByRole('button', { name: 'AI prototyping' }))
  fireEvent.click(screen.getByRole('button', { name: `All resources ${resources.length}` }))
  expect(screen.getByRole('status')).toHaveTextContent(`${resources.length} resources to explore`)
  fireEvent.click(screen.getByRole('button', { name: 'Agentic workflows' }))
  fireEvent.click(screen.getByRole('link', { name: /01 Design systems/ }))
  expect(screen.getByRole('status')).toHaveTextContent(`${resources.length} resources to explore`)
})

it.each(resources)('renders the full $slug guide, visible sources, matching article schema, and valid internal links', resource => {
  const view = render(<ResourcesPage pathname={resourcePath(resource)} article={resource} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(resource.title)
  expect(screen.getByText(resource.answer)).toBeInTheDocument()
  expect(screen.getByText(/Written with AI assistance/)).toBeInTheDocument()
  const article = JSON.parse(view.container.querySelector('script[type="application/ld+json"]')!.textContent!)
  expect(article).toMatchObject({ '@type': 'Article', headline: resource.title, author: { name: 'CRRT' } })
  for (const source of resource.sources) expect(screen.getByRole('link', { name: source.label })).toHaveAttribute('href', source.href)
  for (const link of view.container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) expect(view.container.querySelector(link.getAttribute('href')!)).not.toBeNull()
  expect(within(screen.getByRole('navigation', { name: 'On this page' })).getAllByRole('link')).toHaveLength(resource.sections.length + 3 + Number(Boolean(resource.tool)))
  expect(resourceMinutes(resource)).toBeGreaterThanOrEqual(3)
})

it('supports copy success, unavailable clipboard, and permission failures without losing the template', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<ResourcesPage pathname={resourcePath(resources[0])} article={resources[0]} />)
  const [first, second] = screen.getAllByRole('button', { name: 'Copy template' })
  await act(async () => fireEvent.click(first))
  expect(writeText).toHaveBeenCalledWith(resources[0].sections[1].code)
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  writeText.mockRejectedValueOnce(new Error('Permission denied'))
  await act(async () => fireEvent.click(second))
  expect(screen.getByText(/Couldn’t copy/)).toBeInTheDocument()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  await act(async () => fireEvent.click(first))
  expect(screen.getAllByText(/Couldn’t copy/)).toHaveLength(2)
  expect(document.querySelector('pre code')!.textContent).toBe(resources[0].sections[1].code)
})

it('shows a useful missing-guide page and renders index and articles during prerendering', () => {
  render(<ResourcesPage pathname="/resources/missing" />)
  expect(screen.getByRole('heading', { name: 'Guide not found' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to resources' })).toHaveAttribute('href', '/resources')
  expect(prerender('/resources')).toContain('Build with AI.')
  expect(prerender(resourcePath(resources[0]))).toContain(resources[0].answer)
  expect(prerender('/resources')).toContain('CollectionPage')
})

it('rejects article data for another route and serializes embedded text safely', () => {
  const missing = render(<ResourcesPage pathname="/resources/another-guide" article={resources[0]} />)
  expect(screen.getByRole('heading', { name: 'Guide not found' })).toBeInTheDocument()
  missing.unmount()
  const answer = '</script><script>untrusted()</script>'
  const view = render(<ResourcesPage pathname={resourcePath(resources[0])} article={{ ...resources[0], answer }} />)
  const script = view.container.querySelector('#resource-page-data')!
  expect(script.textContent).toContain('\\u003c/script>')
  expect(JSON.parse(script.textContent!).answer).toBe(answer)
  expect(view.container.querySelector('script:not([type])')).toBeNull()
})
