import { resources } from '../../apps/landing/resources/content'
// One example per screen/template; extra viewport checks are opt-in.
export const publicScreens = [
  { id: 'home', path: '/' }, { id: 'docs', path: '/docs' },
  { id: 'install', path: '/docs/install' }, { id: 'agent-handoff', path: '/docs/agent-handoff' },
  { id: 'self-host', path: '/docs/self-host' }, { id: 'resources', path: '/resources' },
  { id: 'privacy', path: '/privacy' }, { id: 'support', path: '/support' },
  ...[resources.find(r => !r.tool)!, ...resources.filter(r => r.tool)]
    .map(r => ({ id: `resource-${r.slug}`, path: `/resources/${r.slug}` })),
]
export const auditStates = ['running', 'completed-findings', 'failed']
export const dashboardStates = ['feedback', 'empty-account', 'onboarding', 'detail', 'add-project', 'project-settings', 'inbox', 'billing', 'login', 'signup', 'forgot-password', 'reset-password', 'mcp-connections', 'mcp-consent', 'audit-new', 'agent-panel', 'super-admin']
export const authHandoffStates = ['widget-auth-login', 'extension-auth-login']
export const widgetStates = ['idle', 'launcher', 'selecting', 'composer-filled', 'screenshot-failed', 'sending', 'send-error', 'submitted', 'name-entry', 'private-login', 'sidebar', 'sidebar-empty', 'sidebar-edit', 'tracker-picker']
export const widgetAgentStates = ['ready', 'handoff', 'upgrade_required', 'error']
export const extensionStates = ['disclosure', 'signed-out', 'signed-in', 'auth-error', 'ambiguous', 'restricted', 'local-expanded', 'import-error']
export const addonStates = ['ready', 'authentication_required', 'offline_error']
export const mobileScreens = ['public / home', 'dashboard / feedback', 'widget / sidebar']
export const inventory = {
  public: [...publicScreens.map(s => s.id), ...auditStates.map(s => `audit-${s}`)],
  dashboard: [...dashboardStates, ...authHandoffStates, ...auditStates.map(s => `audit-${s}`)],
  widget: widgetStates, 'widget-agent': widgetAgentStates,
  extension: extensionStates, addon: addonStates,
}
