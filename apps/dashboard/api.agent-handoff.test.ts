import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginBillingCheckout, createShare, getPrompt } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('authenticated Agent handoff API', () => {
  it('creates an exact selection, fetches its prompt, and starts checkout', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ shareId: 'share-1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ prompt: 'Fix these items' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://checkout.example/session' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await createShare('/api', 'token', { projectId: 'project/1', scopeType: 'selection', commentIds: ['c1', 'c2'] })
    await getPrompt('/api', 'token', 'share/1', 'claude-code')
    await expect(beginBillingCheckout('/api', 'token')).resolves.toEqual({ url: 'https://checkout.example/session' })

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/feedback-shares', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ projectId: 'project/1', scopeType: 'selection', commentIds: ['c1', 'c2'] }),
    }))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/feedback-shares/share%2F1/prompt?target=claude-code', expect.anything())
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/v1/billing', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'checkout' }),
    }))
  })

  it('exposes structured entitlement failures to the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'Upgrade the project plan to use Agent', code: 'upgrade_required',
    }), { status: 402 })))

    await expect(createShare('/api', 'token', {})).rejects.toMatchObject({
      message: 'Upgrade the project plan to use Agent', status: 402, code: 'upgrade_required',
    })
  })
})

it('preserves an API error without an entitlement code', async () => {
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Selection changed'}),{status:409})))
 await expect(createShare('/api','token',{})).rejects.toMatchObject({message:'Selection changed',status:409,code:undefined})
})
