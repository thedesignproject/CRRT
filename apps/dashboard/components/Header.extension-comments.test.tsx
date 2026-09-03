import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./UserMenu', () => ({ UserMenu: () => null }))
vi.mock('./AddProjectPopover', () => ({ AddProjectPopover: () => null }))
import { Header } from './Header'

const fn = vi.fn()
const props = { projects: [], projectsLoading: false, projectsError: null, commentsLoading: false, selectedProject: '', commentCount: 0, setSelectedProject: fn, setStatusFilter: fn, setSelectedCommentId: fn, addProjectOpen: false, setAddProjectOpen: fn, onAddProject: fn, onCheckAvailability: fn, addProjectBusy: false, addProjectError: null, onOpenCmd: fn, onOpenSettings: fn, settingsActive: false, onOpenExtensionComments: fn, extensionCommentsActive: false, apiBase: '/api', accessToken: 'token', onProjectsChanged: fn, onOpenCommentActivity: fn, theme: 'dark' as const, toggleTheme: fn, user: { id: 'u' } as never, onSignOut: fn, superadmin: false, superAdminActive: false, onOpenSuperAdmin: fn }

describe('Header extension comments navigation', () => {
  it('opens and highlights the project-independent view', () => {
    const view = render(<Header {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'My comments' })); expect(fn).toHaveBeenCalled()
    view.rerender(<Header {...props} extensionCommentsActive />)
    expect(screen.getByRole('button', { name: 'My comments' })).toHaveClass('bg-primary')
  })

  it('never highlights a project or shows its settings alongside My comments', () => {
    const project = { publicKey: 'one', name: 'Project One', slug: 'one', allowedOrigins: [], createdAt: '', updatedAt: '' }
    const view = render(<Header {...props} projects={[project]} selectedProject="one" commentCount={3} />)
    expect(screen.getByRole('button', { name: /Project One/ })).toHaveAttribute('aria-pressed', 'true')
    view.rerender(<Header {...props} projects={[project]} selectedProject="one" extensionCommentsActive />)
    expect(screen.getByRole('button', { name: /Project One/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'My comments' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Project settings' })).toBeNull()
    expect(screen.getByRole('button', { name: /Search Feedback/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Project One' })); expect(fn).toHaveBeenCalledWith('one')
    view.rerender(<Header {...props} projects={[project]} selectedProject="one" commentsLoading />)
    expect(screen.getByRole('button', { name: 'My comments' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Project One' })).toHaveAttribute('aria-pressed', 'true')
  })
})
