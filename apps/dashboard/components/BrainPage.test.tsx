import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: false, list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('../api', () => ({ listRules: mocks.list, createRule: mocks.create, updateRule: mocks.update, deleteRule: mocks.remove }))
vi.mock('../lib/mocks', () => ({ get mocksEnabled() { return mocks.enabled }, getMockRules: () => [rule({ id: 'mock', title: 'Mock rule' })] }))
import type { BrainRule, Project } from '../api'
import { BrainPage } from './BrainPage'

function rule(over: Partial<BrainRule>): BrainRule {
  return { id: 'r1', title: 'Short headlines', body: 'Under 8 words.', projectKey: null, createdAt: '', updatedAt: '', mine: true, citations: 2, ...over }
}
const project = (publicKey: string, name: string, capabilities: Project['capabilities']): Project =>
  ({ publicKey, name, slug: publicKey, allowedOrigins: [], createdAt: '', updatedAt: '', capabilities })
const projects = [project('acme', 'Acme', ['project:manage']), project('beta', 'Beta', ['feedback:read'])]
const forbidden = () => Object.assign(new Error('Forbidden'), { status: 403 })

beforeEach(() => {
  mocks.enabled = false
  for (const fn of [mocks.list, mocks.create, mocks.update, mocks.remove]) fn.mockReset().mockResolvedValue(undefined)
})

const page = () => render(<BrainPage apiBase="/api" accessToken="token" projects={projects} />)

it('lists rules with their scope and citations, and edit controls only where allowed', async () => {
  mocks.list.mockResolvedValue([
    rule({}),
    rule({ id: 'r2', title: 'AA contrast', projectKey: 'acme', citations: 0 }),
    rule({ id: 'r3', title: 'Beta tone', projectKey: 'beta' }),
    rule({ id: 'r4', title: 'Gone project', projectKey: 'gone' }),
    rule({ id: 'r5', title: 'Owner rule', mine: false }),
  ])
  page()
  expect(screen.getByRole('status')).toHaveTextContent('Loading rules…')
  const list = await screen.findByRole('list', { name: 'Rules' })
  expect(mocks.list).toHaveBeenCalledWith('/api', 'token')
  const items = within(list).getAllByRole('listitem')
  expect(items.map((li) => within(li).getByText(/ · cited /).textContent)).toEqual(['Workspace · cited 2×', 'Acme · cited 0×', 'Beta · cited 2×', 'gone · cited 2×', 'Workspace · cited 2×'])
  expect(within(items[0]).getByRole('button', { name: 'Edit Short headlines' })).toBeInTheDocument()
  expect(within(items[1]).getByRole('button', { name: 'Delete AA contrast' })).toBeInTheDocument()
  expect(within(items[2]).queryByRole('button')).toBeNull()
  expect(within(items[3]).queryByRole('button')).toBeNull()
  // Another owner's workspace rule that this user's projects follow: shown, read-only.
  expect(within(items[4]).queryByRole('button')).toBeNull()
  expect(screen.queryByText('No rules yet')).toBeNull()
})

it('shows the empty state only when there are no rules, and load errors plainly', async () => {
  mocks.list.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Offline'))
  page()
  expect(await screen.findByText('No rules yet')).toBeInTheDocument()
  act(() => { window.dispatchEvent(new Event('focus')) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
})

it('adds a workspace or project rule, offering only projects you manage', async () => {
  mocks.list.mockResolvedValue([])
  page()
  fireEvent.click(await screen.findByRole('button', { name: 'New rule' }))
  expect(screen.queryByText('No rules yet')).toBeNull()
  const form = screen.getByRole('form', { name: 'New rule' })
  const scope = within(form).getByRole('combobox', { name: 'Applies to' })
  expect(within(scope).getAllByRole('option').map((o) => o.textContent)).toEqual(['Workspace', 'Acme'])
  expect(within(form).getByRole('button', { name: 'Add rule' })).toBeDisabled()
  fireEvent.change(within(form).getByRole('textbox', { name: 'Title' }), { target: { value: ' Plain words ' } })
  fireEvent.change(within(form).getByRole('textbox', { name: 'Rule' }), { target: { value: 'No jargon.' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Add rule' }))
  await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
  expect(mocks.create).toHaveBeenCalledWith('/api', 'token', { title: 'Plain words', body: 'No jargon.', projectKey: null })

  fireEvent.click(screen.getByRole('button', { name: 'New rule' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'T' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Rule' }), { target: { value: 'B' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Applies to' }), { target: { value: 'acme' } })
  mocks.create.mockRejectedValueOnce(forbidden())
  fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Only people who manage this project can change its rules.')
  expect(mocks.create).toHaveBeenLastCalledWith('/api', 'token', { title: 'T', body: 'B', projectKey: 'acme' })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('form')).toBeNull()
})

it('edits a rule in place and surfaces other errors as they are', async () => {
  mocks.list.mockResolvedValue([rule({})])
  page()
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Short headlines' }))
  const form = screen.getByRole('form', { name: 'Edit rule' })
  expect(within(form).queryByRole('combobox')).toBeNull()
  expect(screen.queryByRole('button', { name: 'New rule' })).toBeNull()
  fireEvent.change(within(form).getByRole('textbox', { name: 'Title' }), { target: { value: 'Shorter headlines' } })
  mocks.update.mockRejectedValueOnce(new Error('Server down'))
  fireEvent.click(within(form).getByRole('button', { name: 'Save rule' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Server down')
  fireEvent.click(within(form).getByRole('button', { name: 'Save rule' }))
  await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
  expect(mocks.update).toHaveBeenLastCalledWith('/api', 'token', 'r1', { title: 'Shorter headlines', body: 'Under 8 words.' })
})

it('deletes a rule after a second click and can keep it instead', async () => {
  mocks.list.mockResolvedValue([rule({})])
  page()
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Short headlines' }))
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
  expect(mocks.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete Short headlines' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete rule' }))
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('/api', 'token', 'r1'))
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))
  mocks.remove.mockRejectedValueOnce(forbidden())
  fireEvent.click(screen.getByRole('button', { name: 'Delete Short headlines' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete rule' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Only people who manage this project')
})

it('reads mock rules in preview mode', async () => {
  mocks.enabled = true
  page()
  expect(await screen.findByText('Mock rule')).toBeInTheDocument()
  expect(mocks.list).not.toHaveBeenCalled()
})
