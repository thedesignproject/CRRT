import { z } from 'zod'
import { PLAN_RESOURCES } from './plans.js'

const failureSchema = z.object({
  code: z.literal('plan_limit'), resource: z.enum(PLAN_RESOURCES),
  usage: z.number().int().nonnegative(), limit: z.number().int().nonnegative().nullable(),
  resetAt: z.string().nullable(), action: z.enum(['manage_billing','upgrade_or_wait']),
})
export function parsePlanFailure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
  if (!message.startsWith('cloud_plan_limit:')) return null
  try {
    const parsed = failureSchema.safeParse(JSON.parse(message.slice('cloud_plan_limit:'.length)))
    return parsed.success ? parsed.data : null
  } catch { return null }
}
export const PLAN_MESSAGES = {
  subscription: 'The project owner needs an active Cloud trial or subscription. Existing feedback remains readable and exportable.',
  projects: 'The project owner has reached the project limit. Delete an unused project or upgrade the plan.',
  internal_users: 'The project owner has reached the internal-user limit. Remove an unused member or invitation, or upgrade. Guests are unlimited.',
  comments: 'The project owner has used this billing window’s comment allowance. Wait for renewal or upgrade.',
  product_audits: 'The project owner has used this billing window’s Product Audit credits. Wait for renewal or upgrade.',
} as const
