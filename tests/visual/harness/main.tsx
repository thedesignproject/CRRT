import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/latin.css'
import '@fontsource/jetbrains-mono/latin.css'
import '@fontsource-variable/figtree/wght.css'
import '@fontsource/vt323/latin.css'
import '../../../src/design-system/styles.css'
import '../../../apps/landing/landing-shell.css'
import './freeze-hero.css'
import tokens from '../../../branding/crrt/tokens.css?raw'
const style = document.createElement('style')
style.textContent = tokens.replace(/@import\s+url\([^)]*\)\s*;/g, '')
document.head.prepend(style)
const theme = new URLSearchParams(location.search).get('theme') ?? 'dark'
document.documentElement.dataset.theme = theme
localStorage.setItem('dashboard-theme', theme)
localStorage.setItem('crrt-landing-theme', theme)
const path = location.pathname
if (path.startsWith('/widget-agent')) {
  const { WidgetAgentHarness } = await import('./widget-agent')
  createRoot(document.getElementById('root')!).render(<WidgetAgentHarness />)
} else if (path.startsWith('/widget')) {
  document.body.style.cssText = `margin:0;background:${theme === 'dark' ? '#151512' : '#fffcf6'};color:${theme === 'dark' ? '#fffcf6' : '#151512'}`
  const { WidgetHarness } = await import('./widget')
  createRoot(document.getElementById('root')!).render(<WidgetHarness />)
} else if (path.startsWith('/extension')) {
  await import('../../../apps/extension/entrypoints/popup/main')
} else if (path.startsWith('/dashboard')) {
  await import('../../../apps/dashboard/main')
} else if (path.startsWith('/addon')) {
  const { Panel } = await import('../../../packages/crrt-storybook/src/components/Panel')
  createRoot(document.getElementById('root')!).render(<Panel />)
} else {
  if (path.startsWith('/resources/')) {
    const { resources } = await import('../../../apps/landing/resources/content')
    const resource = resources.find(r => `/resources/${r.slug}` === path)
    const data = document.createElement('script'); data.id = 'resource-page-data'; data.type = 'application/json'; data.textContent = JSON.stringify(resource); document.head.append(data)
  }
  const { App } = await import('../../../apps/landing/App')
  createRoot(document.getElementById('root')!).render(<App />)
}
document.documentElement.dataset.visualReady = 'true'
