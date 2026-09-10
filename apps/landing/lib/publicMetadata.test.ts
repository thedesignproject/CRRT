import { afterEach, expect, it } from 'vitest'
import { updatePublicMetadata } from './publicMetadata'

afterEach(() => { document.head.innerHTML = '' })
it('updates canonical identity, social metadata and Markdown links during client navigation', () => {
  document.head.innerHTML = '<link rel="canonical"><link rel="alternate" type="text/markdown"><meta name="description"><meta property="og:title"><meta property="og:description"><meta property="og:url"><meta name="twitter:title"><meta name="twitter:description">'
  updatePublicMetadata('/docs/agent-handoff/')
  expect(document.title).toBe('CRRT Agent API — Authentication and developer guide')
  expect(document.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe('https://crrt.ai/docs/agent-handoff')
  expect(document.querySelector('link[rel="alternate"]')!.getAttribute('href')).toBe('/docs/agent-handoff.md')
  expect(document.querySelector('meta[property="og:url"]')!.getAttribute('content')).toBe('https://crrt.ai/docs/agent-handoff')
  updatePublicMetadata('/')
  expect(document.querySelector('link[rel="alternate"]')!.getAttribute('href')).toBe('/index.md')
})
it('handles the dev shell without metadata and leaves unknown routes alone', () => {
  document.head.innerHTML = ''
  updatePublicMetadata('/docs')
  expect(document.title).toContain('CRRT documentation')
  updatePublicMetadata('/docs/missing')
  expect(document.title).toContain('CRRT documentation')
})
