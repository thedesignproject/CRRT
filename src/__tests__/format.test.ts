import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { avatarColor, getInitials, normalizeReviewStatus, timeAgo } from '../components/FeedbackWidget/format'
import { AVATAR_COLORS } from '../components/FeedbackWidget/constants'

describe('avatarColor', () => {
  it('returns a color from AVATAR_COLORS', () => {
    expect(AVATAR_COLORS).toContain(avatarColor('abc'))
  })

  it('is deterministic for the same id', () => {
    expect(avatarColor('user-1')).toBe(avatarColor('user-1'))
  })

  it('handles empty string', () => {
    expect(AVATAR_COLORS).toContain(avatarColor(''))
  })
})

describe('getInitials', () => {
  it('returns null for null/undefined/empty', () => {
    expect(getInitials(null)).toBeNull()
    expect(getInitials(undefined)).toBeNull()
    expect(getInitials('')).toBeNull()
    expect(getInitials('   ')).toBeNull()
  })

  it('returns single uppercase letter for one-word names', () => {
    expect(getInitials('alice')).toBe('A')
    expect(getInitials('  bob  ')).toBe('B')
  })

  it('returns first + last initials for multi-word names', () => {
    expect(getInitials('Ada Lovelace')).toBe('AL')
    expect(getInitials('grace b hopper')).toBe('GH')
    expect(getInitials('  john   doe  ')).toBe('JD')
  })
})

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const at = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString()

  it('reports just now under 5 seconds', () => {
    expect(timeAgo(at(2000))).toBe('just now')
  })

  it('reports seconds under a minute', () => {
    expect(timeAgo(at(30_000))).toBe('30s ago')
  })

  it('reports minutes under an hour', () => {
    expect(timeAgo(at(15 * 60_000))).toBe('15 min ago')
  })

  it('reports hours under a day', () => {
    expect(timeAgo(at(5 * 3_600_000))).toBe('5h ago')
  })

  it('reports days otherwise', () => {
    expect(timeAgo(at(3 * 86_400_000))).toBe('3d ago')
  })
})

describe('normalizeReviewStatus', () => {
  it('passes through accepted and rejected', () => {
    expect(normalizeReviewStatus('accepted')).toBe('accepted')
    expect(normalizeReviewStatus('rejected')).toBe('rejected')
  })

  it('falls back to open for everything else', () => {
    expect(normalizeReviewStatus('open')).toBe('open')
    expect(normalizeReviewStatus(undefined)).toBe('open')
    expect(normalizeReviewStatus(null)).toBe('open')
    expect(normalizeReviewStatus('')).toBe('open')
    expect(normalizeReviewStatus(42)).toBe('open')
  })
})
