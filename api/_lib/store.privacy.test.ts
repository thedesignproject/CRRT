import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from './supabase.js'
import { getProject, getProjectMember, updateProject, listProjectsForUser, listProjectMembers, listProjectMemberIds, listComments, listAcceptedCommentsForPage, listAcceptedCommentsByIds, listAcceptedCommentsForProject, listCommentsForShare } from './store.js'
import { projectFeedbackAllowed } from './project-capabilities.js'
const project = { public_key: 'p', name: 'P', slug: 'p', widget_private: true, feedback_access: 'admins', created_at: '', updated_at: '' }
const member = { project_key: 'p', user_id: 'u', role: 'member', is_owner: false, projects: project }
let rows: Record<string, any>, update: any
beforeEach(() => {
  rows = { projects: [project], project_members: [member], comments: null, feedback_share_items: [{ comment_id: 'c' }] }
  update = vi.fn()
  vi.mocked(getServiceSupabase).mockReturnValue({
    from: (table: string) => {
      const q: any = { then: (yes: any) => Promise.resolve({ data: rows[table], error: null }).then(yes), maybeSingle: async () => ({ data: rows[table]?.[0], error: null }) }
      for (const method of ['select', 'eq', 'in', 'order']) q[method] = () => q
      q.update = (value: any) => { update(value); return q }
      return q
    },
  } as never)
})
it('maps privacy settings, saves both choices, and removes aggregate capabilities for restricted members', async () => {
  expect((await getProject('p'))?.feedbackAccess).toBe('admins')
  await updateProject('p', { widgetPrivate: true, feedbackAccess: 'admins' })
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ widget_private: true, feedback_access: 'admins' }))
  expect((await listProjectsForUser('u'))[0].capabilities).toEqual(['feedback:create'])
  expect((await getProjectMember('u', 'p'))?.feedbackAllowed).toBe(false)
})
it('filters non-admin notification recipients while preserving the complete member list', async () => {
  vi.stubEnv('SUPABASE_SECRET_KEY', '')
  expect(await listProjectMemberIds('p')).toEqual([])
  expect(await listProjectMembers('p', true)).toEqual([])
  expect(await listProjectMembers('p')).toHaveLength(1)
  rows.project_members = [{ ...member, role: 'admin' }]
  expect(await listProjectMemberIds('p')).toEqual(['u'])
  expect(await listProjectMembers('p', true)).toHaveLength(1)
  vi.unstubAllEnvs()
})
it('handles null comment result sets across widget and agent read paths', async () => {
  expect(await listComments('p')).toEqual([])
  expect(await listAcceptedCommentsForPage('p', 'url')).toEqual([])
  expect(await listAcceptedCommentsByIds('p', ['c'])).toEqual([])
  expect(await listAcceptedCommentsForProject('p')).toEqual([])
  expect(await listCommentsForShare({ id: 's', projectId: 'p', scopeType: 'selection', scopePageUrl: null })).toEqual([])
})
it('allows public/team projects and restricts private admin-only projects to owner/admin', () => {
  expect(projectFeedbackAllowed('member')).toBe(true)
  expect(projectFeedbackAllowed('member', true, 'team')).toBe(true)
  expect(projectFeedbackAllowed('member', true, 'admins')).toBe(false)
  expect(projectFeedbackAllowed('owner', true, 'admins')).toBe(true)
  expect(projectFeedbackAllowed('admin', true, 'admins')).toBe(true)
})
