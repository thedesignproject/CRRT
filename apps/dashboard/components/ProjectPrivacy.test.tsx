import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProjectPrivacy } from './ProjectPrivacy'
const project = { publicKey: 'p', name: 'P', slug: 'p', allowedOrigins: [], createdAt: '', updatedAt: '' }
afterEach(() => vi.unstubAllGlobals())
it('saves privacy and its admin-only audience', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
  const onSaved = vi.fn()
  render(<ProjectPrivacy project={project} apiBase="api" accessToken="token" canEdit onSaved={onSaved} />)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'admins' } })
  await act(async () => fireEvent.click(screen.getByText('Save privacy')))
  expect(fetch).toHaveBeenCalledWith('api/v1/projects/p', expect.objectContaining({ body: JSON.stringify({ widgetPrivate: true, feedbackAccess: 'admins' }) }))
  expect(onSaved).toHaveBeenCalledOnce()
})
it.each([{ error: 'Protection failed' }, {}])('shows a recoverable save failure: %j', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 500 })))
  render(<ProjectPrivacy project={{ ...project, widgetPrivate: true, feedbackAccess: 'admins' }} apiBase="api" accessToken="token" canEdit onSaved={vi.fn()} />)
  await act(async () => fireEvent.click(screen.getByText('Save privacy')))
  expect(screen.getByRole('alert')).toHaveTextContent(body.error ?? 'Could not save privacy settings')
})
it('shows settings read-only to members', () => {
  render(<ProjectPrivacy project={project} apiBase="api" accessToken="token" canEdit={false} onSaved={vi.fn()} />)
  expect(screen.getByRole('checkbox')).toBeDisabled()
  expect(screen.queryByText('Save privacy')).toBeNull()
})
