import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ session: null, user: null, loading: false, signOut: vi.fn() }) }))
vi.mock('./lib/supabase', () => ({ supabase: {} }))
vi.mock('./components/LoginPage', () => ({
  LoginPage: ({ initialMode, continuationPath }: { initialMode?: string; continuationPath?: string }) => <div>Login {initialMode ?? 'default'} → {continuationPath ?? 'home'}</div>,
}))
import { App } from './App'
import { route } from './lib/routes'
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })

it('sends logged-out AppSumo buyers to sign up and back to the redeem field', () => {
  window.history.replaceState({}, '', `${route('/billing')}?appsumo=1&auth=signup`)
  render(<App />)
  expect(screen.getByText(`Login signup → ${route('/billing')}?appsumo=1`)).toBeInTheDocument()
})

it('lets returning buyers log in and keeps the redeem redirect', () => {
  window.history.replaceState({}, '', `${route('/billing')}?appsumo=1`)
  render(<App />)
  expect(screen.getByText(`Login default → ${route('/billing')}?appsumo=1`)).toBeInTheDocument()
})

it('keeps the billing path when there is no query and leaves other login routes unchanged', () => {
  window.history.replaceState({}, '', route('/billing'))
  const view = render(<App />)
  expect(screen.getByText(`Login default → ${route('/billing')}`)).toBeInTheDocument()
  view.unmount()
  window.history.replaceState({}, '', `${route('/documents')}?id=1`)
  const documents = render(<App />)
  expect(screen.getByText(`Login default → ${route('/documents')}?id=1`)).toBeInTheDocument()
  documents.unmount()
  window.history.replaceState({}, '', route('/'))
  render(<App />)
  expect(screen.getByText('Login default → home')).toBeInTheDocument()
})
