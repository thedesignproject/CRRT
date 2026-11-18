// Navigation hint only. The API remains authoritative for every billing action.
// Keep this in memory so a page reload checks the deployment's current settings.
export type BillingAvailability = { enabled: boolean; trialAvailable: boolean; planRequired: boolean }
type Availability = BillingAvailability
const availability = new Map<string, Promise<Availability>>()

export function billingStatusOnce(apiBase: string, userId: string, accessToken: string): Promise<Availability> {
  const key = JSON.stringify([apiBase, userId])
  let result = availability.get(key)
  if (!result) {
    result = fetch(`${apiBase}/v1/billing?availability=1`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async response => {
        if (!response.ok) throw new Error('Unavailable')
        return response.json()
      })
      .then((value: Partial<Availability>) => {
        const enabled = value.enabled === true
        return { enabled, trialAvailable: enabled && value.trialAvailable === true, planRequired: enabled && value.planRequired === true }
      })
      .catch(() => {
        availability.delete(key)
        return { enabled: false, trialAvailable: false, planRequired: false }
      })
    availability.set(key, result)
  }
  return result
}

export function billingAvailabilityOnce(apiBase: string, userId: string, accessToken: string): Promise<boolean> {
  return billingStatusOnce(apiBase, userId, accessToken).then(value => value.enabled)
}

// Whether this user can still start a Cloud free trial (hint for the offer).
export function trialOfferOnce(apiBase: string, userId: string, accessToken: string): Promise<boolean> {
  return billingStatusOnce(apiBase, userId, accessToken).then(value => value.trialAvailable)
}
