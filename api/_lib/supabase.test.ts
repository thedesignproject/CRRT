import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

import { createClient } from '@supabase/supabase-js'
import { getNonPersistentSupabase, getServiceSupabase, getSupabase } from './supabase.js'

const origUrl = process.env.SUPABASE_URL
const origKey = process.env.SUPABASE_KEY
const origServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

beforeEach(() => {
  vi.mocked(createClient).mockClear()
  process.env.SUPABASE_URL = 'https://supa.example'
  process.env.SUPABASE_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key'
})

afterEach(() => {
  process.env.SUPABASE_URL = origUrl
  process.env.SUPABASE_KEY = origKey
  process.env.SUPABASE_SERVICE_ROLE_KEY = origServiceKey
})

describe('getSupabase', () => {
  it('builds an anon-key client', () => {
    getSupabase()
    expect(createClient).toHaveBeenCalledWith('https://supa.example', 'anon-key')
  })

  it('throws when SUPABASE_URL is missing', () => {
    delete process.env.SUPABASE_URL
    expect(() => getSupabase()).toThrow(/missing Supabase credentials/)
  })

  it('throws when SUPABASE_KEY is missing', () => {
    delete process.env.SUPABASE_KEY
    expect(() => getSupabase()).toThrow(/missing Supabase credentials/)
  })
})

describe('getServiceSupabase', () => {
  it('builds a service-role client with persistSession disabled', () => {
    getServiceSupabase()
    expect(createClient).toHaveBeenCalledWith(
      'https://supa.example',
      'svc-key',
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  })

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => getServiceSupabase()).toThrow(/missing Supabase credentials/)
  })

  it('throws when SUPABASE_URL is missing', () => {
    delete process.env.SUPABASE_URL
    expect(() => getServiceSupabase()).toThrow(/missing Supabase credentials/)
  })
})

describe('getNonPersistentSupabase', () => {
  it('builds an isolated anon-key auth client', () => {
    getNonPersistentSupabase()
    expect(createClient).toHaveBeenCalledWith(
      'https://supa.example',
      'anon-key',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    )
  })

  it('requires both public Supabase settings', () => {
    delete process.env.SUPABASE_URL
    expect(() => getNonPersistentSupabase()).toThrow(/missing Supabase credentials/)
    process.env.SUPABASE_URL = 'https://supa.example'
    delete process.env.SUPABASE_KEY
    expect(() => getNonPersistentSupabase()).toThrow(/missing Supabase credentials/)
  })
})
