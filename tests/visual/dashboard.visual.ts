import { test, expect } from './fixtures/test'
import { dashboardStates, auditStates, authHandoffStates } from './inventory'
for (const state of dashboardStates) {
  test(`dashboard / ${state}`, async ({ capture }) => {
    const auth = ['login', 'signup', 'forgot-password'].includes(state)
    const routes: Record<string, string> = { billing: 'billing', login: 'login', signup: 'signup', 'forgot-password': 'forgot-password', 'reset-password': 'reset-password', 'mcp-connections': 'mcp-auth', 'mcp-consent': 'mcp-auth', 'audit-new': 'audits/new' }
    const route = routes[state] || ''
    const query = new URLSearchParams()
    if (auth) { query.set('mock', 'off'); query.set('auth', 'out') }
    if (state === 'empty-account') query.set('mock', 'empty')
    if (state === 'onboarding') query.set('mock', 'onboarding')
    if (state === 'inbox') query.set('view', 'extension-comments')
    if (state === 'mcp-consent') { query.set('client_id', 'visual-client'); query.set('redirect_uri', 'https://example.test/callback'); query.set('state', 'visual') }
    await capture(`/dashboard/${route}?${query}`, state, async page => {
      if (auth) { await expect(page.getByPlaceholder('you@team.com')).toBeVisible(); return }
      if (route) {
        if (state === 'mcp-connections') {
          await expect(page.getByRole('heading', { name: 'MCP connections', exact: true })).toBeVisible()
          await expect(page.getByRole('status', { name: 'Loading connections' })).toHaveCount(0)
          await expect(page.getByText('Codex', { exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible()
        }
        if (state === 'reset-password') await expect(page.getByLabel('new password', { exact: true })).toBeVisible()
        if (state === 'billing') { await expect(page.getByRole('heading', { name: 'Billing & usage' })).toBeVisible(); await expect(page.getByText(/Loading billing/)).toHaveCount(0) }
        return
      }
      if (state === 'empty-account') { await expect(page.getByRole('heading').first()).toBeVisible(); return }
      await expect(page.getByRole('button', { name: 'Add project', exact: true })).toBeVisible()
      if (state === 'add-project') await page.getByRole('button', { name: 'Add project', exact: true }).click()
      if (state === 'project-settings') { await page.getByRole('button', { name: 'Project settings', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Project settings' })).toBeVisible(); await expect(page.getByText('Loading company access…')).toHaveCount(0) }
      if (state === 'agent-panel') await page.getByRole('button', { name: /^Agents,/ }).click()
      if (state === 'super-admin') { await page.getByRole('button', { name: /Super admin/i }).click(); await expect(page.getByRole('region', { name: 'Super admin' })).toBeVisible() }
      if (state === 'detail') await page.getByText(/El headline está muy largo/).first().click()
      if (state === 'feedback') await expect(page.getByText(/El headline está muy largo/).first()).toBeVisible()
    })
  })
}
for (const state of auditStates) {
  test(`dashboard / audit-${state}`, async ({ capture }) => {
    await capture('/dashboard/audits/11111111-1111-4111-8111-111111111111', state, async page => {
      await expect(page.getByText(/product audit ·/).first()).toBeVisible()
      await expect(page.getByText('Loading audit state…')).toHaveCount(0)
      if (state.endsWith('-findings')) await expect(page.getByText('Primary action is difficult to read', { exact: true })).toBeVisible()
    })
  })
}
for (const state of authHandoffStates) {
  test(`dashboard / ${state}`, async ({ capture }) => {
    const widget = state.startsWith('widget-')
    const query = new URLSearchParams({ mock: 'off', auth: 'out', state: 's'.repeat(43) })
    if (widget) { query.set('projectKey', 'visual-project'); query.set('origin', 'http://127.0.0.1:4380'); query.set('codeChallenge', 'p'.repeat(43)) }
    else { query.set('code_challenge', 'p'.repeat(43)); query.set('redirect_uri', `https://${'a'.repeat(32)}.chromiumapp.org/crrt-auth`); query.set('intent', 'signin') }
    await capture(`/dashboard/${widget ? 'widget' : 'extension'}-auth?${query}`, state, async page => {
      await expect(page.getByPlaceholder('you@team.com')).toBeVisible()
      await expect(page.getByRole('button', { name: /authenticate/i })).toBeVisible()
    })
  })
}
