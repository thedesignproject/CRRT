import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import posthog from '../../posthog'
import { trialOfferOnce } from '../lib/billing-availability'
import { route } from '../lib/routes'

const DISMISSED_KEY = 'crrt:dashboard:trial-offer-dismissed-at'
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

const primaryButton = 'inline-flex min-h-9 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90'
const secondaryButton = 'inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent'

// Dismissal is remembered for 30 days in this browser. Blocked storage counts
// as dismissed so the offer cannot reappear on every page load.
export function trialOfferSnoozed(now = Date.now()) {
  try {
    const dismissedAt = Date.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '')
    return now - dismissedAt >= 0 && now - dismissedAt < SNOOZE_MS
  } catch {
    return true
  }
}

function snoozeTrialOffer() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, new Date().toISOString())
  } catch {
    /* localStorage unavailable */
  }
}

// Shown while the signed-in user can still start a Cloud free trial.
export function TrialOffer({ apiBase, accessToken, userId }: { apiBase: string; accessToken: string; userId: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (trialOfferSnoozed()) return
    let active = true
    void trialOfferOnce(apiBase, userId, accessToken).then((available) => {
      if (!active || !available) return
      setVisible(true)
      posthog.capture('trial_offer_shown')
    })
    return () => { active = false }
  }, [apiBase, userId, accessToken])

  if (!visible) return null
  const dismiss = () => {
    snoozeTrialOffer()
    setVisible(false)
    posthog.capture('trial_offer_dismissed')
  }
  return (
    <div role="dialog" aria-modal="false" aria-labelledby="trial-offer-title" aria-describedby="trial-offer-detail" className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl">
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <X size={15} />
      </button>
      <h2 id="trial-offer-title" className="pr-6 text-base font-semibold text-foreground">Try CRRT Cloud free for 14 days</h2>
      <p id="trial-offer-detail" className="mt-2 text-sm leading-6 text-muted-foreground">Turn your team's feedback into reviewed fixes on managed Cloud, with nothing to host. A card is required, and you won't be charged if you cancel before the trial ends.</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={dismiss} className={secondaryButton}>Not now</button>
        <a href={route('/billing')} onClick={() => posthog.capture('trial_offer_clicked')} className={primaryButton}>Start free trial</a>
      </div>
    </div>
  )
}
