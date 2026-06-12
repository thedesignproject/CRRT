import { describe, expect, it } from 'vitest'
import { buildPrompt } from './prompts.js'

describe('buildPrompt', () => {
  it('explains text_range anchors to agents', () => {
    const prompt = buildPrompt('generic', {
      appUrl: 'https://crrt.ai/',
      slug: 'share-slug',
      token: 'share-token',
      pageUrl: null,
      projectKey: 'demo-project',
      projectName: 'Demo',
      repoConfig: null,
    })

    expect(prompt).toContain('Comments with targetType "text_range" anchor to selected text')
    expect(prompt).toContain('anchor.selectedText is the exact quote')
  })
})
