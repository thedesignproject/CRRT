import { expect, it } from 'vitest'
import { render } from './prerender'
import config from './vite.config'

it('renders the shared marketing composition and existing documentation on the server', () => {
  const home = render('/')
  expect(home).toContain('href="/docs"')
  expect(home).toContain('Drop a CRRT on any element')
  const docs = render('/docs/agent-handoff')
  expect(docs).toContain('CRRT developer resources')
  expect(docs).toContain('href="/openapi.json"')
  expect(docs).toContain('Authorization: Bearer')
})

it('loads the canonical design tokens into HTML in development and production', () => {
  const plugin = (config as any).plugins.find((plugin: any) => plugin.name === 'crrt-static-tokens')
  const [style] = plugin.transformIndexHtml()
  expect(style).toMatchObject({ tag: 'style', attrs: { 'data-source': 'crrt-tokens' }, injectTo: 'head-prepend' })
  expect(style.children).toContain('--crrt-carrot:')
})
