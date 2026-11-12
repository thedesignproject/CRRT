import { expect, it } from 'vitest'
import { manifestSchema } from './contracts'
import { captureManifest, lifecycleFixtures } from './fixtures'
it('provides validated tab/window manifests and every backend lifecycle state for frontend adapters', () => {
  expect(manifestSchema.parse(captureManifest)).toEqual(captureManifest)
  expect(lifecycleFixtures.map(f => f.state)).toEqual(['recording', 'uploading', 'processing', 'ready', 'failed'])
  expect(lifecycleFixtures[4].failure?.retryable).toBe(true)
  expect(lifecycleFixtures[0].durationMs).toBeNull()
})
