import { PremiumAgentBridge } from '../../../src/components/PremiumAgentBridge'
import { FeedbackWidgetStyles } from '../../../src/components/FeedbackWidget/styles'
const params = new URLSearchParams(location.search)
const state = params.get('state') ?? 'ready'
const session = { accessToken: 'visual-widget-token', displayName: 'Visual Reviewer', expiresAt: '2026-11-05T12:00:00.000Z' }
const noop = () => {}
export function WidgetAgentHarness() {
  return <div data-fw-crrt="" data-crrt-theme={params.get('theme')}>
    <FeedbackWidgetStyles />
    <main style={{ padding: 40 }}><h1>A page worth reviewing</h1><p>Review the selected feedback with your agent.</p></main>
    <PremiumAgentBridge apiBase="/api" projectId="visual-project" pageUrl="https://example.test/pricing" widgetSession={state.startsWith('login-') ? null : session} loginBusy={state === 'login-busy'} loginError={state === 'login-error' ? 'Sign-in was cancelled. Try again.' : ''} onLogin={async () => {}} onClose={noop} />
  </div>
}
