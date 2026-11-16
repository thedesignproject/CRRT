import { widgetRequest, type WidgetLoginSession } from '../../lib/widgetLogin'
export type SendDestination = { listenerId: string; label: string; repoUrl: string; online: boolean; stopped: boolean }
export type SentFeedback = { dispatchId: string; commentId: string; listenerId: string; state: string; reason: string | null }
export type DeliveryState = { listeners: SendDestination[]; dispatches: SentFeedback[] }
export async function fetchDelivery(apiBase: string, projectKey: string, pageUrl: string, session: WidgetLoginSession): Promise<DeliveryState> {
  const query = new URLSearchParams({ projectKey, pageUrl })
  const result = await (await widgetRequest(apiBase, `/v1/widget/agent/dispatch?${query}`, session)).json()
  if (!Array.isArray(result.listeners) || !Array.isArray(result.dispatches)) throw new Error('Invalid delivery state')
  return result
}
export async function sendFeedback(apiBase: string, session: WidgetLoginSession, input: {
  projectKey: string; pageUrl: string; listenerId: string; commentId: string; expectedUpdatedAt: string; idempotencyKey: string
}): Promise<{ dispatchId: string; state: string }> {
  return (await widgetRequest(apiBase, '/v1/widget/agent/dispatch', session, { method: 'POST', body: JSON.stringify(input) })).json()
}
