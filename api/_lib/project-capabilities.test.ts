import { describe, expect, it } from 'vitest'
import { canProject, effectiveProjectRole, feedbackVisibilityForRole, projectCapabilities } from './project-capabilities.js'

describe('project capabilities', () => {
  it('keeps guests in feedback contribution and internal roles in execution', () => {
    expect(projectCapabilities('guest')).toEqual(['feedback:read', 'feedback:create'])
    expect(canProject('guest', 'feedback:create')).toBe(true)
    expect(canProject('guest', 'feedback:manage')).toBe(false)
    expect(canProject('member', 'agent:operate')).toBe(true)
    expect(canProject('member', 'project:manage')).toBe(false)
    expect(canProject('admin', 'project:manage')).toBe(true)
    expect(effectiveProjectRole('admin', true)).toBe('owner')
    expect(feedbackVisibilityForRole('guest', 'internal')).toBe('shared')
    expect(feedbackVisibilityForRole('member', 'internal')).toBe('internal')
  })
})
