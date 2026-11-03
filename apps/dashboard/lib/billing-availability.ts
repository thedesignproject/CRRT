// Navigation hint only. The API remains authoritative for every billing action.
// Keep this in memory so a page reload checks the deployment's current settings.
const availability = new Map<string, Promise<boolean>>()

export function billingAvailabilityOnce(apiBase: string, userId: string, accessToken: string): Promise<boolean> {
  const key = JSON.stringify([apiBase, userId])
  let result = availability.get(key)
  if (!result) {
    result = fetch(`${apiBase}/v1/billing?availability=1`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async response => {
        if (!response.ok) throw new Error('Unavailable')
        return response.json()
      })
      .then((value: { enabled: boolean }) => value.enabled === true)
      .catch(() => {
        availability.delete(key)
        return false
      })
    availability.set(key, result)
  }
  return result
}
