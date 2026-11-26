import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('../lib/billing-availability', () => ({ billingAvailabilityOnce: async () => false }))
import { UserMenu } from './UserMenu'

const onRename = vi.fn()
const menu = (name: string | null = 'Acme') => <UserMenu apiBase="/api" accessToken="t" user={{ id: 'u', email: 'me@example.com' } as User} onSignOut={vi.fn()} workspace={{ name, onRename }} />
const open = async () => { await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))) }

beforeEach(() => onRename.mockReset().mockResolvedValue(undefined))

it('renames the workspace from the account menu', async () => {
  render(menu())
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Rename workspace' }))
  const input = screen.getByRole('textbox', { name: 'Workspace name' })
  expect(input).toHaveValue('Acme')
  expect(input).toHaveAttribute('maxLength', '60')
  fireEvent.change(input, { target: { value: '  ' } })
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.change(input, { target: { value: ' Acme Studio ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  expect(onRename).toHaveBeenCalledWith('Acme Studio')
  expect(screen.getByRole('button', { name: 'Rename workspace' })).toBeInTheDocument()
})

it('shows why a rename failed and can cancel', async () => {
  onRename.mockRejectedValueOnce(new Error('Workspace name must be 1 to 60 characters'))
  render(menu(null))
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Rename workspace' }))
  expect(screen.getByRole('textbox', { name: 'Workspace name' })).toHaveValue('')
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'X' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Workspace name must be 1 to 60 characters')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
})

it('starts over when the menu is opened again, and has no rename without a workspace', async () => {
  const view = render(menu())
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Rename workspace' }))
  await open()
  await open()
  expect(screen.queryByRole('textbox')).toBeNull()
  view.rerender(<UserMenu apiBase="/api" accessToken="t" user={{ id: 'u', email: 'me@example.com' } as User} onSignOut={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Rename workspace' })).toBeNull()
})
