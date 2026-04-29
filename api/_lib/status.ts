export type ReviewStatus = 'open' | 'accepted' | 'rejected'
export const IMPLEMENTATION_STATUSES = ['unassigned', 'claimed', 'in_progress', 'blocked', 'done'] as const
export type ImplementationStatus = typeof IMPLEMENTATION_STATUSES[number]

export function fromLegacyStatus(status: string | null | undefined): ReviewStatus {
  if (status === 'approved' || status === 'accepted') return 'accepted'
  if (status === 'rejected') return 'rejected'
  return 'open'
}

export function toLegacyStatus(status: ReviewStatus): 'pending' | 'approved' | 'rejected' {
  if (status === 'accepted') return 'approved'
  if (status === 'rejected') return 'rejected'
  return 'pending'
}

