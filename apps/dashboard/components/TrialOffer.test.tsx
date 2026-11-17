import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('../../posthog', () => ({ default: { capture } }))
import { TrialOffer, trialOfferSnoozed } from './TrialOffer'
import { route } from '../lib/routes'

const KEY = 'crrt:dashboard:trial-offer-dismissed-at'
const DAY = 24 * 60 * 60 * 1000
const fetchMock = vi.fn()
let store: Record<string, string>
let sequence = 0
const props = () => ({ apiBase: '/api', accessToken: 'session', userId: `user-${++sequence}` })
const availability = (body: unknown) => fetchMock.mockResolvedValue({ ok: true, json: async () => body })

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value } })
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); capture.mockReset()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('offers the trial while one is available and links to billing', async () => {
  availability({ enabled: true, trialAvailable: true })
  render(<TrialOffer {...props()} />)
  const offer = await screen.findByRole('dialog', { name: 'Try CRRT Cloud free for 14 days' })
  expect(offer).toHaveTextContent("you won't be charged if you cancel before the trial ends")
  const start = screen.getByRole('link', { name: 'Start free trial' })
  expect(start).toHaveAttribute('href', route('/billing'))
  expect(capture).toHaveBeenCalledWith('trial_offer_shown')
  fireEvent.click(start)
  expect(capture).toHaveBeenCalledWith('trial_offer_clicked')
})

it.each([
  ['no trial left', { enabled: true, trialAvailable: false }],
  ['billing off', { enabled: false, trialAvailable: true }],
  ['an old API', { enabled: true }],
])('stays hidden with %s', async (_label, body) => {
  availability(body)
  render(<TrialOffer {...props()} />)
  await act(async () => {})
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(capture).not.toHaveBeenCalled()
})

it.each(['Not now', 'Dismiss'])('remembers "%s" for 30 days', async (label) => {
  availability({ enabled: true, trialAvailable: true })
  render(<TrialOffer {...props()} />)
  fireEvent.click(await screen.findByRole('button', { name: label }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(capture).toHaveBeenCalledWith('trial_offer_dismissed')
  const dismissedAt = Date.parse(store[KEY]!)
  expect(Date.now() - dismissedAt).toBeLessThan(1000)
  cleanup(); fetchMock.mockClear()
  render(<TrialOffer {...props()} />)
  await act(async () => {})
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('snoozes for exactly 30 days and ignores missing, invalid, or future dates', () => {
  const now = Date.parse('2026-11-17T12:00:00Z')
  expect(trialOfferSnoozed(now)).toBe(false)
  store[KEY] = new Date(now - 29 * DAY).toISOString(); expect(trialOfferSnoozed(now)).toBe(true)
  store[KEY] = new Date(now - 30 * DAY).toISOString(); expect(trialOfferSnoozed(now)).toBe(false)
  store[KEY] = 'garbage'; expect(trialOfferSnoozed(now)).toBe(false)
  store[KEY] = new Date(now + DAY).toISOString(); expect(trialOfferSnoozed(now)).toBe(false)
})

it('treats blocked storage as dismissed and survives a failed save', async () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
  expect(trialOfferSnoozed()).toBe(true)
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota') } })
  availability({ enabled: true, trialAvailable: true })
  render(<TrialOffer {...props()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('ignores a late answer after unmounting', async () => {
  let resolve!: (value: unknown) => void
  fetchMock.mockReturnValue(new Promise((done) => { resolve = done }))
  const view = render(<TrialOffer {...props()} />)
  view.unmount()
  await act(async () => resolve({ ok: true, json: async () => ({ enabled: true, trialAvailable: true }) }))
  expect(capture).not.toHaveBeenCalled()
})
