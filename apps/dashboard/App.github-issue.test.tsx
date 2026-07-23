import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({
  projects: [{
    publicKey: 'project-1',
    slug: 'project-1',
    name: 'Project',
    allowedOrigins: [],
    createdAt: '',
    updatedAt: '',
  }],
  comments: [],
  fn: vi.fn(),
}))

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    session: { access_token: 'session-token' },
    user: { id: 'user-1', email: 'ada@example.com' },
    loading: false,
    signOut: fixtures.fn,
  }),
}))
vi.mock('./hooks/useProjects', () => ({
  useProjects: () => ({
    projects: fixtures.projects,
    loading: false,
    error: null,
    claimProject: fixtures.fn,
    checkAvailability: fixtures.fn,
    refresh: fixtures.fn,
  }),
}))
vi.mock('./hooks/useComments', () => ({
  useComments: () => ({
    comments: fixtures.comments,
    commentsProjectId: 'project-1',
    loading: false,
    error: null,
    refresh: fixtures.fn,
  }),
}))
vi.mock('./hooks/useAgentSession', () => ({
  useAgentSession: () => ({
    session: null,
    shareState: null,
    events: fixtures.comments,
    error: null,
    copyPrompt: fixtures.fn,
  }),
}))
vi.mock('./hooks/useSuperAdmin', () => ({ useSuperAdmin: () => ({ superadmin: false }) }))

vi.mock('./components/CommentDetail', () => ({
  CommentDetail: (props: { apiBase: string; accessToken: string }) => (
    <div data-testid="detail">{props.apiBase}:{props.accessToken}</div>
  ),
}))
vi.mock('./components/Header', () => ({ Header: () => null }))
vi.mock('./components/CommentList', () => ({
  CommentList: (props: { toggleBulkSelect: (id: string) => void }) => (
    <button onClick={() => props.toggleBulkSelect('comment-1')}>toggle test comment</button>
  ),
}))
vi.mock('./components/AgentSidebar', () => ({ AgentSidebar: () => null }))
vi.mock('./components/StatusBar', () => ({ StatusBar: () => null }))
vi.mock('./components/LoginPage', () => ({ LoginPage: () => null }))
vi.mock('./components/ResetPasswordPage', () => ({ ResetPasswordPage: () => null }))
vi.mock('./components/WelcomeScreen', () => ({ WelcomeScreen: () => null }))
vi.mock('./components/AddProjectPopover', () => ({ AddProjectPopover: () => null }))
vi.mock('./components/ProjectSettings', () => ({ ProjectSettings: () => null }))
vi.mock('./components/SuperAdminPanel', () => ({ SuperAdminPanel: () => null }))
vi.mock('./components/CommandPalette', () => ({ CommandPalette: () => null }))

import { App } from './App'

describe('<App /> GitHub issue wiring', () => {
  it('passes the authenticated API context to comment actions', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent(
      'https://crrt.ai/api:session-token',
    ))
    fireEvent.click(screen.getByRole('button', { name: 'toggle test comment' }))
  })
})
