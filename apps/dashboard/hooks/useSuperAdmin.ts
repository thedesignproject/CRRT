import { useEffect, useState } from 'react'
import { getSuperAdminStatus } from '../api'
import { mocksEnabled } from '../lib/mocks'

export interface UseSuperAdminResult {
  superadmin: boolean
  loading: boolean
}

/**
 * Resolves whether the signed-in user is a super admin via /v1/admin/me. This
 * only gates UI visibility — every admin data endpoint re-checks server-side,
 * so a forged `true` here grants nothing. Fails closed (false) on any error.
 */
export function useSuperAdmin(apiBase: string, accessToken: string): UseSuperAdminResult {
  const [superadmin, setSuperadmin] = useState(false)
  const [loading, setLoading] = useState(!mocksEnabled)

  useEffect(() => {
    if (mocksEnabled) return
    let cancelled = false
    getSuperAdminStatus(apiBase, accessToken)
      .then((res) => { if (!cancelled) setSuperadmin(res.isSuperAdmin) })
      .catch(() => { if (!cancelled) setSuperadmin(false) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [apiBase, accessToken])

  return { superadmin, loading }
}
