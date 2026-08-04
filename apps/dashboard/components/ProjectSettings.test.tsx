import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function settings(overrides: Record<string, unknown> = {}) {
  return {
    members: [owner, member], invites: [], repoConfig: null, repoConfigError: null,
    loading: false, error: null, isAdmin: true, isOwner: true,
    refresh: vi.fn(), rename: vi.fn(), updateAllowedOrigins: vi.fn(), saveAgentInstructions: vi.fn(),
    invite: vi.fn().mockResolvedValue(undefined), changeRole: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn(), cancelInvite: vi.fn(), ...overrides,
  }
}

function view(current = 'owner') {
  return render(<ProjectSettings
    project={project}
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
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fireEvent.change(role, { target: { value: 'owner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))
    await waitFor(() => expect(state.changeRole).toHaveBeenCalledWith('member', 'owner'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
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
