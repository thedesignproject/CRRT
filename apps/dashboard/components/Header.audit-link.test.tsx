import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./UserMenu', () => ({ UserMenu: () => null }))
import { Header } from './Header'
describe('dashboard audit launcher link', () => {
  it('uses the dashboard base-aware audit route', () => {
    render(<Header
      projects={[]} projectsLoading={false} projectsError={null} commentsLoading={false} selectedProject="" commentCount={0} setSelectedProject={vi.fn()} setStatusFilter={vi.fn()} setSelectedCommentId={vi.fn()}
      addProjectOpen={false} setAddProjectOpen={vi.fn()} onAddProject={vi.fn()} onCheckAvailability={vi.fn()} addProjectBusy={false} addProjectError={null} onOpenCmd={vi.fn()} onOpenSettings={vi.fn()} settingsActive={false}
      apiBase="/api" accessToken="token" onProjectsChanged={vi.fn()} onOpenCommentActivity={vi.fn()} theme="dark" toggleTheme={vi.fn()} user={{ id: 'user' } as never} onSignOut={vi.fn()} superadmin={false} superAdminActive={false} onOpenSuperAdmin={vi.fn()}
    />)
    const link = screen.getByRole('link', { name: 'Run audit' })
    expect(link).toHaveAttribute('href', '/audits/new'); expect(link).not.toHaveClass('hidden')
  })
})
