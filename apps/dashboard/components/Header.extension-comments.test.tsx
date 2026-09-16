import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./UserMenu', () => ({ UserMenu: () => null }))
vi.mock('./AddProjectPopover', () => ({ AddProjectPopover: () => null }))
import { Header } from './Header'

const fn = vi.fn()
const props = { projects: [], projectsLoading: false, projectsError: null, commentsLoading: false, selectedProject: '', commentCount: 0, setSelectedProject: fn, setStatusFilter: fn, setSelectedCommentId: fn, addProjectOpen: false, setAddProjectOpen: fn, onAddProject: fn, onCheckAvailability: fn, addProjectBusy: false, addProjectError: null, onOpenCmd: fn, onOpenSettings: fn, settingsActive: false, onOpenExtensionComments: fn, extensionCommentsActive: false, apiBase: '/api', accessToken: 'token', onProjectsChanged: fn, onOpenCommentActivity: fn, theme: 'dark' as const, toggleTheme: fn, user: { id: 'u' } as never, onSignOut: fn, superadmin: false, superAdminActive: false, onOpenSuperAdmin: fn }

describe('Header extension comments navigation', () => {
  it('places settings and super admin only in the sidebar footer and preserves permissions', () => {
    const onOpenSettings = vi.fn()
    const view = render(<Header {...props} selectedProject="one" superadmin settingsActive onOpenSettings={onOpenSettings} />)
    const footer = screen.getByRole('navigation', { name: 'Workspace administration' })
    expect(footer.parentElement).toBe(screen.getByRole('complementary', { name: 'Workspace navigation' }))
    expect(footer).toBe(footer.parentElement?.lastElementChild)
    expect(within(footer).getByRole('button', { name: 'Super admin' })).toBeInTheDocument()
    const settings = within(footer).getByRole('button', { name: 'Project settings' })
    expect(settings).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(settings)
    expect(onOpenSettings).toHaveBeenCalledOnce()
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: /Project settings|Super admin/ })).toBeNull()
    view.rerender(<Header {...props} selectedProject="one" canManageProject={false} />)
    expect(screen.queryByRole('button', { name: 'Project settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Super admin' })).toBeNull()
  })
  it('keeps administration and project navigation accessible in the new shell', () => {
    const onOpenSuperAdmin = vi.fn()
    const view = render(<Header {...props} superadmin superAdminActive onOpenSuperAdmin={onOpenSuperAdmin} />)
    expect(screen.getByRole('navigation', { name: 'Projects' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Super admin' }))
    expect(onOpenSuperAdmin).toHaveBeenCalledOnce()
    view.rerender(<Header {...props} superadmin superAdminActive={false} />)
    expect(screen.getByRole('button', { name: 'Super admin' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('opens and highlights the project-independent view', () => {
    const view = render(<Header {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'My comments' })); expect(fn).toHaveBeenCalled()
    view.rerender(<Header {...props} extensionCommentsActive />)
    expect(screen.getByRole('button', { name: 'My comments' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('never highlights a project or shows its settings alongside My comments', () => {
    const project = { publicKey: 'one', name: 'Project One', slug: 'one', allowedOrigins: [], createdAt: '', updatedAt: '' }
    const view = render(<Header {...props} projects={[project]} selectedProject="one" commentCount={3} />)
    expect(screen.getByRole('button', { name: /Project One/ })).toHaveAttribute('aria-pressed', 'true')
    view.rerender(<Header {...props} projects={[project]} selectedProject="one" extensionCommentsActive />)
    expect(screen.getByRole('button', { name: /Project One/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'My comments' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Project settings' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Search feedback' })).toBeDisabled()
    fn.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Project One' }))
    expect(fn).toHaveBeenNthCalledWith(1, 'one')
    expect(fn).toHaveBeenNthCalledWith(2, 'open')
    expect(fn).toHaveBeenNthCalledWith(3, '')
    view.rerender(<Header {...props} projects={[project]} selectedProject="one" commentsLoading />)
    expect(screen.getByRole('button', { name: 'My comments' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Project One' })).toHaveAttribute('aria-pressed', 'true')
  })
})
