import { z } from 'zod'
import { RecordError, StorybookError } from '../../api/_lib/domain-errors.js'
import { assertRecordEnabled } from '../../api/_lib/record/features.js'
import { getServiceSupabase } from '../../api/_lib/supabase.js'
import { checked, ensure, type McpIdentity } from './auth.js'
import type { DashboardResult } from './dashboard-adapter.js'
import type { DashboardOperation } from './dashboard-operations.js'

type Read = (name: string, query: Record<string, string>) => Promise<DashboardResult>
async function recoverReceipt(operation: DashboardOperation, query: Record<string, string>, body: Record<string, unknown>, actor: McpIdentity, receipt: DashboardResult, read: Read): Promise<DashboardResult> {
  if (receipt.ok && ['storybook.pair', 'shares.create', 'audits.create', 'billing.action', 'recordings.agent_payload'].includes(operation.name)) {
    const data = z.record(z.string(), z.unknown()).parse(receipt.data)
    if (operation.name === 'storybook.pair') {
      const { ownerAccess } = await import('../../api/_lib/storybook.js')
      await ownerAccess(z.string().parse(body.projectKey), actor.user_id)
      const connection = await checked(await getServiceSupabase().from('storybook_connections').select('revoked_at,claimed_at,expires_at')
        .eq('id', z.string().parse(data.connectionId)).eq('project_key', body.projectKey).eq('created_by', actor.user_id).maybeSingle())
      ensure(connection && !connection.revoked_at && !connection.claimed_at && Date.parse(connection.expires_at) > Date.now(), 410, 'pairing_unavailable')
      return { ...receipt, code: 'operation_recovered' }
    }
    if (operation.name === 'shares.create') {
      const current = await read('shares.prompt', { shareId: z.string().parse(data.shareId), target: 'generic' })
      if (!current.ok) return current
      const tokenUrl = z.object({ tokenUrl: z.url() }).parse(current.data).tokenUrl
      return { ...receipt, code: 'operation_recovered', data: { ...data, tokenUrl, token: new URL(tokenUrl).searchParams.get('token') } }
    }
    if (operation.name === 'audits.create') {
      const current = await read('audits.read', { auditId: z.string().parse(data.auditId) })
      if (!current.ok) return current
      return { ...receipt, code: 'operation_recovered' }
    }
    if (operation.name === 'billing.action') {
      // Billing handlers always bind the customer to actor.user_id. The live
      // connection was revalidated before reading this actor-bound receipt.
      return { ...receipt, code: 'operation_recovered' }
    }
    // The remaining recoverable operation is the quota-counted Record read.
    assertRecordEnabled()
    const { owned } = await import('../../api/_lib/record/core.js')
    const { recordAccess, agentArtifactAccess } = await import('../../api/_lib/record/agent.js')
    const payload = z.object({ recording: z.object({ revision: z.number() }), project: z.object({ key: z.string() }).nullable() }).parse(data.payload)
    const revalidate = async () => {
      assertRecordEnabled()
      const current = await owned(actor.user_id, query.id)
      await recordAccess(actor.user_id, current)
      ensure(current.revision === payload.recording.revision && current.project_key === (payload.project?.key ?? null) && current.state === 'ready', 409, 'record_conflict')
      return current
    }
    const current = await revalidate()
    const { artifacts } = await import('../../api/_lib/record/storage.js')
    const artifactAccess = await agentArtifactAccess(current, await artifacts(query.id))
    await revalidate()
    return { ...receipt, data: { ...data, artifactAccess }, code: 'operation_recovered' }
  }
  // Other writes can be inspected using ordinary resource reads. Do not expose
  // historical project data after membership/ownership has changed.
  return { ok: receipt.ok, status: receipt.status, data: null, code: 'operation_already_recorded', retryable: false,
    action: 'This operation was already recorded and was not executed again. Read the affected resource to obtain its current authorized state.' }
}


export async function recoverDashboardReceipt(...args: Parameters<typeof recoverReceipt>): Promise<DashboardResult> {
  try { return await recoverReceipt(...args) }
  catch (error) {
    if (!(error instanceof RecordError || error instanceof StorybookError)) throw error
    return { ok: false, status: error.status, data: null, code: error.code,
      retryable: error instanceof RecordError ? error.retryable : false,
      action: 'Resolve the reported access, plan, feature availability or resource condition before retrying the same request. Do not reinstall MCP.' }
  }
}
