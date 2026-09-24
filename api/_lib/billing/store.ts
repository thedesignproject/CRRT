import { randomUUID } from 'node:crypto'
import { getServiceSupabase } from '../supabase.js'

export interface BillingAccount {
  user_id: string
  customer_id: string | null
  subscription_id: string | null
  subscription_status: string | null
  price_id: string | null
  period_end: string | null
  cancel_at_period_end: boolean
  checkout_attempt: string
  checkout_session_id: string | null
  lock_token: string | null
}

export class BillingBusyError extends Error {}

export async function getAccount(userId: string): Promise<BillingAccount | null> {
  const { data, error } = await getServiceSupabase().from('billing_accounts').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw new Error('Billing account read failed')
  return data
}

export async function accountForCustomer(customerId: string): Promise<BillingAccount | null> {
  const { data, error } = await getServiceSupabase().from('billing_accounts').select('*').eq('customer_id', customerId).maybeSingle()
  if (error) throw new Error('Billing customer lookup failed')
  return data
}

export async function withAccount<T>(userId: string, operation: (account: BillingAccount, save: (values: Partial<BillingAccount>) => Promise<void>) => Promise<T>): Promise<T> {
  const db = getServiceSupabase()
  const { error: insertError } = await db.from('billing_accounts').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (insertError) throw new Error('Billing account creation failed')
  const token = randomUUID()
  const now = Date.now()
  const { data, error } = await db.from('billing_accounts').update({ lock_token: token, lock_expires_at: new Date(now + 120_000).toISOString() })
    .eq('user_id', userId).or(`lock_expires_at.is.null,lock_expires_at.lt.${new Date(now).toISOString()}`).select('*').maybeSingle()
  if (error) throw new Error('Billing lock failed')
  if (!data) throw new BillingBusyError('Billing is updating. Please try again.')
  const save = async (values: Partial<BillingAccount>) => {
    const { data: saved, error: saveError } = await db.from('billing_accounts').update({ ...values, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('lock_token', token).select('user_id').maybeSingle()
    if (saveError || !saved) throw new Error('Billing update failed')
  }
  try {
    return await operation(data, save)
  } finally {
    // Never release another worker's lease after an expired worker resumes.
    const { error: releaseError } = await db.from('billing_accounts').update({ lock_token: null, lock_expires_at: null }).eq('user_id', userId).eq('lock_token', token)
    if (releaseError) throw new Error('Billing lock release failed')
  }
}

export async function recordEvent(eventId: string, eventType: string) {
  const { error } = await getServiceSupabase().from('billing_webhook_events').upsert({ event_id: eventId, event_type: eventType }, { onConflict: 'event_id', ignoreDuplicates: true })
  if (error) throw new Error('Billing event recording failed')
}
