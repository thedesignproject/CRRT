import { afterEach, expect, it, vi } from 'vitest'
import { updateReviewStatus } from './api'
afterEach(() => vi.unstubAllGlobals())
it.each([undefined, '2026-10-29T12:00:00.123456Z'])('preserves the optional mutation version without rounding %s', async (expectedUpdatedAt) => {
 const fetch=vi.fn().mockResolvedValue({ok:true,status:200,text:async()=>JSON.stringify({id:'c'})})
 vi.stubGlobal('fetch',fetch)
 await updateReviewStatus('/api','session','c','open',expectedUpdatedAt)
 expect(fetch).toHaveBeenCalledWith('/api/v1/comments/c/review-status',expect.objectContaining({body:JSON.stringify({reviewStatus:'open',expectedUpdatedAt})}))
})
