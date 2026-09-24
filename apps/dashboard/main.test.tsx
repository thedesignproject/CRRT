import { expect, it, vi } from 'vitest'
const { render, createRoot, applyTheme } = vi.hoisted(() => {
  const render = vi.fn()
  return { render, createRoot: vi.fn(() => ({ render })), applyTheme: vi.fn() }
})
vi.mock('react-dom/client', () => ({ default: { createRoot } }))
vi.mock('./App', () => ({ App: () => null }))
vi.mock('../../branding/crrt/tokens.css?raw', () => ({ default: '/* dashboard tokens */' }))
vi.mock('./lib/theme', () => ({ getDashboardTheme: () => 'light', applyDashboardTheme: applyTheme }))
it('loads the dashboard with its tokens and saved theme before rendering', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  await import('./main')
  expect(applyTheme).toHaveBeenCalledWith('light')
  expect(createRoot).toHaveBeenCalledWith(document.getElementById('root'))
  expect(render).toHaveBeenCalledOnce()
  expect(document.head.querySelector('style')?.textContent).toContain('dashboard tokens')
})
