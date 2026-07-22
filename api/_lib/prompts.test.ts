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

  const REPO_CONFIG = {
    repoUrl: 'https://github.com/acme/widgets',
    localPath: null,
    defaultBranch: 'main',
    installCommand: null,
    devCommand: null,
    testCommand: null,
    buildCommand: null,
    agentInstructions: null as string | null,
  }

  const baseInput = {
    appUrl: 'https://crrt.ai/',
    slug: 'share-slug',
    token: 'share-token',
    pageUrl: null,
    projectKey: 'demo-project',
    projectName: 'Demo',
  }

  it('renders agent instructions as a labeled section, verbatim', () => {
    const prompt = buildPrompt('claude-code', {
      ...baseInput,
      repoConfig: { ...REPO_CONFIG, agentInstructions: 'Read AGENTS.md first and follow its read order before any change.' },
    })

    expect(prompt).toContain(
      '## Project instructions (from the team)\n\nRead AGENTS.md first and follow its read order before any change.',
    )
    // The legacy terse rendering is gone.
    expect(prompt).not.toContain('- Extra:')
    // The rest of the prompt is not reordered: instructions come after the repo block.
    expect(prompt.indexOf('Project + repo:')).toBeLessThan(prompt.indexOf('## Project instructions'))
  })

  it('omits the instructions section when none are set', () => {
    for (const repoConfig of [null, REPO_CONFIG]) {
      const prompt = buildPrompt('generic', { ...baseInput, repoConfig })
      expect(prompt).not.toContain('## Project instructions')
      expect(prompt).not.toContain('- Extra:')
    }
  })

  it('keeps markdown structure (headers, lists) intact', () => {
    const markdown = '## Read order\n\n1. PRODUCT.md\n2. DESIGN.md\n\n- Never invent tokens\n- Cite rules by `id`'
    const prompt = buildPrompt('codex', {
      ...baseInput,
      repoConfig: { ...REPO_CONFIG, agentInstructions: markdown },
    })

    expect(prompt).toContain(markdown)
  })
})
