export type StoredProjectRole = 'admin' | 'member' | 'guest'
export type ProjectRole = 'owner' | StoredProjectRole

export type ProjectCapability =
  | 'feedback:read'
  | 'feedback:create'
  | 'feedback:manage'
  | 'agent:operate'
  | 'integrations:send'
  | 'project:manage'

const CAPABILITIES: Record<ProjectRole, readonly ProjectCapability[]> = {
  owner: ['feedback:read', 'feedback:create', 'feedback:manage', 'agent:operate', 'integrations:send', 'project:manage'],
  admin: ['feedback:read', 'feedback:create', 'feedback:manage', 'agent:operate', 'integrations:send', 'project:manage'],
  member: ['feedback:read', 'feedback:create', 'feedback:manage', 'agent:operate', 'integrations:send'],
  guest: ['feedback:read', 'feedback:create'],
}

export function effectiveProjectRole(role: StoredProjectRole, isOwner = false): ProjectRole {
  return isOwner ? 'owner' : role
}

export function projectCapabilities(role: ProjectRole): ProjectCapability[] {
  return [...CAPABILITIES[role]]
}

export function canProject(role: ProjectRole, capability: ProjectCapability) {
  return CAPABILITIES[role].includes(capability)
}
