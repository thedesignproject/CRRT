import { AVATAR_COLORS } from './constants'
import type { ReviewStatus } from './types'

export function avatarColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getInitials(name: string | null | undefined): string | null {
  if (!name) return null
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  // Whole characters, not UTF-16 halves: names can start with an emoji.
  const first = (part: string) => Array.from(part)[0]!
  if (parts.length === 1) return first(parts[0]!).toUpperCase()
  return (first(parts[0]!) + first(parts[parts.length - 1]!)).toUpperCase()
}

export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function normalizeReviewStatus(value: unknown): ReviewStatus {
  if (value === 'accepted' || value === 'rejected') return value
  return 'open'
}
