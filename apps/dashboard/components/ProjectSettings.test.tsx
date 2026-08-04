import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project, ProjectMember } from '../api'

vi.mock('../hooks/useProjectSettings', () => ({ useProjectSettings: vi.fn() }))
vi.mock('./GitHubRepositorySettings', () => ({ GitHubRepositorySettings: () => null }))

import { useProjectSettings } from '../hooks/useProjectSettings'
import { ProjectSettings } from './ProjectSettings'

const project: Project = {
  publicKey: 'demo', slug: 'demo', name: 'Demo', allowedOrigins: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

const owner: ProjectMember = {
  userId: 'owner', email: 'owner@example.com', role: 'owner', createdAt: '2026-01-01T00:00:00Z',
}
const member: ProjectMember = {
  userId: 'member', email: 'member@example.com', role: 'member', createdAt: '2026-01-02T00:00:00Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    members: [owner, member], invites: [], repoConfig: null, repoConfigError: null,
    loading: false, error: null, isAdmin: true, isOwner: true,
    refresh: vi.fn(), rename: vi.fn(), updateAllowedOrigins: vi.fn(), saveAgentInstructions: vi.fn(),
    invite: vi.fn().mockResolvedValue(undefined), changeRole: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn(), cancelInvite: vi.fn(), ...overrides,
  }
}

function view(current = 'owner', selectedProject = project) {
  return render(<ProjectSettings
    project={selectedProject}
    apiBase="/api"
    accessToken="token"
    currentUserId={current}
    onBack={vi.fn()}
    onProjectsChanged={vi.fn()}
  />)
}

beforeEach(() => vi.mocked(useProjectSettings).mockReset())

describe('ProjectSettings role controls', () => {
  it('confirms owner transfer and keeps the owner protected', async () => {
    const state = settings()
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    expect(screen.queryByLabelText('Role for owner@example.com')).toBeNull()
    expect(screen.queryByLabelText('Remove owner@example.com')).toBeNull()
    const role = screen.getByLabelText('Role for member@example.com') as HTMLSelectElement
    expect(Array.from(role.options).map((option) => option.value)).toEqual(['member', 'admin', 'owner'])

    fireEvent.change(role, { target: { value: 'owner' } })
    expect(screen.getByRole('alertdialog', { name: 'Confirm ownership transfer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(role).toHaveFocus())

    fireEvent.change(role, { target: { value: 'owner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(role).toHaveFocus())

    fireEvent.change(role, { target: { value: 'owner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))
    await waitFor(() => expect(state.changeRole).toHaveBeenCalledWith('member', 'owner'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(role).toHaveFocus())
  })

  it('lets admins manage non-owner roles but not transfer ownership', () => {
    const admin = { ...member, userId: 'admin', email: 'admin@example.com', role: 'admin' as const }
    const state = settings({ members: [owner, admin, member], isOwner: false })
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view('admin')

    const role = screen.getByLabelText('Role for member@example.com') as HTMLSelectElement
    expect(Array.from(role.options).map((option) => option.value)).toEqual(['member', 'admin'])
    fireEvent.change(role, { target: { value: 'admin' } })
    expect(state.changeRole).toHaveBeenCalledWith('member', 'admin')
  })

  it('keeps failed ownership transfers open for retry', async () => {
    const state = settings({ changeRole: vi.fn().mockRejectedValue(new Error('Transfer conflicted')) })
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    fireEvent.change(screen.getByLabelText('Role for member@example.com'), { target: { value: 'owner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Transfer conflicted'))
    expect(screen.getByRole('alertdialog', { name: 'Confirm ownership transfer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Transfer ownership' })).not.toBeDisabled()
  })

  it('moves focus to the team heading when the transfer selector is gone', async () => {
    const change = deferred<void>()
    const state = settings({ changeRole: vi.fn().mockReturnValue(change.promise) })
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    const role = screen.getByLabelText('Role for member@example.com')
    fireEvent.change(role, { target: { value: 'owner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))
    role.remove()
    change.resolve()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Team (2)' })).toHaveFocus())
  })

  it('normalizes a non-error ownership transfer rejection', async () => {
    const state = settings({ changeRole: vi.fn().mockRejectedValue('Transfer conflicted') })
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    fireEvent.change(screen.getByLabelText('Role for member@example.com'), { target: { value: 'owner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong'))
  })

  it('serializes member mutations while one is pending', async () => {
    const change = deferred<void>()
    const admin = { ...member, userId: 'admin', email: 'admin@example.com', role: 'admin' as const }
    let removeAdmin!: HTMLElement
    const state = settings({
      members: [owner, admin, member],
      changeRole: vi.fn().mockImplementation(() => {
        removeAdmin.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return change.promise
      }),
    })
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    removeAdmin = screen.getByLabelText('Remove admin@example.com')
    fireEvent.change(screen.getByLabelText('Role for member@example.com'), { target: { value: 'admin' } })

    expect(screen.getByLabelText('Role for admin@example.com')).toBeDisabled()
    expect(screen.getByLabelText('Remove admin@example.com')).toBeDisabled()
    expect(state.removeMember).not.toHaveBeenCalled()

    change.resolve()
    await waitFor(() => expect(screen.getByLabelText('Role for admin@example.com')).not.toBeDisabled())
  })

  it('blocks other member mutations while confirming an ownership transfer', () => {
    const admin = { ...member, userId: 'admin', email: 'admin@example.com', role: 'admin' as const }
    const state = settings({ members: [owner, admin, member] })
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    fireEvent.change(screen.getByLabelText('Role for member@example.com'), { target: { value: 'owner' } })

    expect(screen.getByLabelText('Role for admin@example.com')).toBeDisabled()
    expect(screen.getByLabelText('Remove admin@example.com')).toBeDisabled()
    expect(screen.getByLabelText('Role for member@example.com')).toBeDisabled()
    expect(screen.getByLabelText('Remove member@example.com')).toBeDisabled()
  })

  it('does not surface a stale role error after switching projects', async () => {
    const change = deferred<void>()
    const state = settings({ changeRole: vi.fn().mockReturnValue(change.promise) })
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    const rendered = view()

    fireEvent.change(screen.getByLabelText('Role for member@example.com'), { target: { value: 'owner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))
    rendered.rerender(<ProjectSettings
      project={{ ...project, publicKey: 'other' }}
      apiBase="/api"
      accessToken="token"
      currentUserId="owner"
      onBack={vi.fn()}
      onProjectsChanged={vi.fn()}
    />)

    change.reject(new Error('Stale transfer error'))
    await waitFor(() => expect(screen.queryByText('Stale transfer error')).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('submits and resets the selected invitation role', async () => {
    const state = settings()
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    fireEvent.change(screen.getByLabelText('Invite by email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Invitation role'), { target: { value: 'admin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))

    await waitFor(() => expect(state.invite).toHaveBeenCalledWith('new@example.com', 'admin'))
    expect((screen.getByLabelText('Invitation role') as HTMLSelectElement).value).toBe('member')
  })

  it('ignores an allowed-domain response from a previously selected project', async () => {
    const updateA = deferred<Project>()
    const projectA = { ...project, allowedOrigins: ['a.example'] }
    const projectB = { ...project, publicKey: 'other', slug: 'other', name: 'Other', allowedOrigins: ['b.example'] }
    const stateA = settings({ updateAllowedOrigins: vi.fn().mockReturnValue(updateA.promise) })
    const stateB = settings({
      updateAllowedOrigins: vi.fn().mockResolvedValue({
        ...projectB,
        allowedOrigins: ['b.example', 'new.example'],
      }),
    })
    vi.mocked(useProjectSettings).mockImplementation((_api, _token, projectKey) => (
      projectKey === project.publicKey ? stateA : stateB
    ) as never)
    const rendered = view('owner', projectA)

    fireEvent.click(screen.getByLabelText('Remove a.example'))
    rendered.rerender(<ProjectSettings
      project={projectB}
      apiBase="/api"
      accessToken="token"
      currentUserId="owner"
      onBack={vi.fn()}
      onProjectsChanged={vi.fn()}
    />)
    await act(async () => {
      updateA.resolve({ ...projectA, allowedOrigins: [] })
      await updateA.promise
    })

    expect(screen.getByText('b.example')).toBeTruthy()
    expect(screen.queryByText('a.example')).toBeNull()
    fireEvent.change(screen.getByLabelText('Add allowed domain'), { target: { value: 'new.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(stateB.updateAllowedOrigins).toHaveBeenCalledWith(['b.example', 'new.example']))
  })

  it('rejects an invalid invitation form submission', () => {
    const state = settings()
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    const inviteButton = screen.getByRole('button', { name: 'Invite' })
    fireEvent.submit(inviteButton.closest('form')!)
    expect(state.invite).not.toHaveBeenCalled()
  })

  it('saves updated agent instructions', async () => {
    const state = settings({
      repoConfig: { agentInstructions: 'old' },
      saveAgentInstructions: vi.fn().mockResolvedValue(undefined),
    })
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    fireEvent.change(screen.getByLabelText('Agent instructions'), { target: { value: 'new' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).find((button) => !button.hasAttribute('disabled'))!)

    await waitFor(() => expect(state.saveAgentInstructions).toHaveBeenCalledWith('new'))
  })

  it('renders loading and empty team states', () => {
    vi.mocked(useProjectSettings).mockReturnValue(settings({ loading: true, members: [] }) as never)
    const rendered = view()
    expect(document.querySelector('.animate-spin')).toBeTruthy()

    vi.mocked(useProjectSettings).mockReturnValue(settings({ loading: false, members: [] }) as never)
    rendered.rerender(<ProjectSettings
      project={project}
      apiBase="/api"
      accessToken="token"
      currentUserId="owner"
      onBack={vi.fn()}
      onProjectsChanged={vi.fn()}
    />)
    expect(screen.getByText('No members yet.')).toBeTruthy()
  })

  it('removes a non-owner member', async () => {
    const state = settings({ removeMember: vi.fn().mockResolvedValue(undefined) })
    vi.mocked(useProjectSettings).mockReturnValue(state as never)
    view()

    fireEvent.click(screen.getByLabelText('Remove member@example.com'))
    await waitFor(() => expect(state.removeMember).toHaveBeenCalledWith('member'))
  })

  it('shows read-only member roles and falls back to a user id during transfer', () => {
    const anonymous = { ...member, email: null }
    vi.mocked(useProjectSettings).mockReturnValue(settings({ members: [owner, anonymous] }) as never)
    const ownerView = view()
    fireEvent.change(screen.getByLabelText('Role for member'), { target: { value: 'owner' } })
    expect(screen.getByText(/Transfer ownership to/).textContent).toContain('member')
    ownerView.unmount()

    vi.mocked(useProjectSettings).mockReturnValue(settings({
      members: [owner, member], isAdmin: false, isOwner: false,
    }) as never)
    view('member')
    expect(screen.getAllByText('member').length).toBeGreaterThan(0)
  })
})
