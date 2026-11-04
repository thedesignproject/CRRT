import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { detectAffected, readResources, selectAffected, shardPaths } from './lighthouse-affected.mjs'

const read = (file: string) => readFileSync(file, 'utf8')
const resources = readResources(read)
const all = ['/resources', ...resources.map(resource => `/resources/${resource.slug}`)]
const select = (files: string[], current = resources, previous = resources) => selectAffected({ files, current, previous }).paths
const file = 'apps/landing/resources/content.ts'

it('assigns every affected URL to exactly one balanced shard, without empty runners', () => {
  expect(shardPaths([])).toEqual([])
  expect(shardPaths(['/resources'])).toEqual([{ number: 1, total: 1, paths: '/resources' }])
  for (let count = 1; count <= 40; count++) {
    const paths = Array.from({ length: count }, (_, index) => `/resources/page-${index}`)
    const shards = shardPaths(paths)
    const groups = shards.map(shard => shard.paths.split(','))
    expect(shards).toHaveLength(Math.min(3, count))
    expect(groups.flat().sort()).toEqual([...paths].sort())
    expect(new Set(groups.flat()).size).toBe(count)
    expect(Math.max(...groups.map(group => group.length)) - Math.min(...groups.map(group => group.length))).toBeLessThanOrEqual(1)
    expect(shards.map(shard => shard.number)).toEqual(Array.from({ length: shards.length }, (_, index) => index + 1))
    expect(shards.every(shard => shard.total === shards.length)).toBe(true)
  }
  expect(shardPaths(all).map(shard => shard.paths.split(',').length)).toEqual([8, 7, 7])
})

it('reads every real resource, including the spread collection and calculators', () => {
  expect(resources).toHaveLength(21)
  expect(resources.filter(resource => resource.tool)).toHaveLength(3)
})

it('skips unrelated applications, docs, tests, and empty changes', () => {
  expect(select([])).toEqual([])
  expect(select(['api/feedback.ts', 'apps/dashboard/App.tsx', 'apps/extension/main.ts', 'docs/ci.md', 'README.md', 'scripts/public-pages.test.ts', 'src/__tests__/theme.ts'])).toEqual([])
})

it('selects the library, shared articles, and calculators separately', () => {
  expect(select(['apps/landing/resources/ResourceArtwork.tsx'])).toEqual(['/resources'])
  expect(select(['apps/landing/resources/ResourcesIndex.tsx', 'apps/landing/resources/ResourceFigure.tsx'])).toEqual(['/resources'])
  expect(select(['apps/landing/resources/ResourceArticle.tsx'])).toEqual(all.slice(1))
  expect(select(['apps/landing/resources/readResourceData.ts'])).toEqual(all.slice(1))
  const tools = resources.filter(resource => resource.tool).map(resource => `/resources/${resource.slug}`)
  expect(select(['apps/landing/resources/ResourceTool.tsx'])).toEqual(tools)
  expect(select(['apps/landing/resources/toolCalculations.ts'])).toEqual(tools)
  expect(select(['apps/landing/resources/ResourceFigure.tsx', 'apps/landing/resources/ResourceTool.tsx'])).toEqual(['/resources', ...tools])
})

it('selects only changed article bodies when shared catalog bytes stay the same', () => {
  const current = structuredClone(resources)
  current[0].answer = current[0].answer.replace('Design tokens', 'Design values')
  expect(select([file], current)).toEqual([all[1]])
  expect(select(['apps/landing/resources/additionalContent.ts'], current)).toEqual([all[1]])
  expect(select([file])).toEqual([])
})

it('audits all pages for changed catalog metadata, reading time, additions, removals, and order', () => {
  const title = structuredClone(resources)
  title[0].title += ' updated'
  expect(select([file], title)).toEqual(all)
  const longer = structuredClone(resources)
  longer[0].answer += ' more'.repeat(500)
  expect(select([file], longer)).toEqual(all)
  const added = [...resources, { ...resources[0], slug: 'new-guide' }]
  expect(select([file], added)).toEqual([...all, '/resources/new-guide'])
  expect(select([file], resources.slice(1))).toEqual(['/resources', ...all.slice(2)])
  expect(select([file], [...resources].reverse())).toEqual(['/resources', ...all.slice(1).reverse()])
})

it.each([
  'apps/landing/resources/resources.css', 'apps/landing/components/Navigation.tsx',
  'apps/landing/resources/new-helper.ts', 'src/design-system/theme.tsx',
  'branding/crrt/tokens.css', 'shared/new-input.ts', 'scripts/build-landing.ts',
  'package.json', 'bun.lock', '.nvmrc', '.github/workflows/resources-quality.yml', 'unknown/input.ts',
])('falls back to every page for shared or unclassified input %s', input => {
  expect(select([input])).toEqual(all)
})

it('uses NUL-separated changed paths and a full PR diff, including deleted/renamed inputs', () => {
  const calls: string[][] = []
  const git = (args: string[]) => { calls.push(args); return 'apps/landing/resources/ResourceTool.tsx\0' }
  expect(detectAffected({ base: 'base-sha', head: 'head-sha', read, git }).paths).toHaveLength(3)
  expect(calls).toEqual([['diff', '--name-only', '--no-renames', '-z', 'base-sha', 'head-sha']])
  expect(select(['apps/landing/resources/ResourceArtwork.tsx', 'apps/landing/resources/renamed-artwork.tsx'])).toEqual(all)
})

it('compares base content without executing it', () => {
  const currentRead = (path: string) => read(path).replace('start with one screen', 'start with a screen')
  const git = (args: string[]) => args[0] === 'diff' ? `${file}\0` : read(args[1].slice('base:'.length))
  expect(detectAffected({ base: 'base', read: currentRead, git }).paths).toEqual(all) // Shared title.
})

it('falls back on missing history, content parsing errors, or unfamiliar syntax', () => {
  const fail = () => { throw new Error('No history') }
  expect(detectAffected({ base: 'base', read, git: fail }).paths).toEqual(all)
  const invalidBase = (args: string[]) => args[0] === 'diff' ? `${file}\0` : 'throw new Error("never execute")'
  expect(detectAffected({ base: 'base', read, git: invalidBase }).paths).toEqual(all)
  expect(detectAffected({ base: undefined, read, git: fail }).paths).toEqual(all)
  expect(detectAffected({ base: '000000', read, git: fail }).paths).toEqual(all)
  expect(detectAffected({ base: 'base', force: true, read, git: fail }).paths).toEqual(all)
  expect(selectAffected({ files: [file], current: resources }).paths).toEqual(all)
  for (const extra of [
    '\nimport x from "unknown"', '\nconst unexpected = 1', '\nthrow 1',
    '\nexport { resources }',
  ]) expect(() => readResources(path => read(path) + extra)).toThrow()
  expect(() => readResources(path => read(path).replace("slug: 'design-tokens-for-ai-prototypes'", "slug: execute()"))).toThrow()
})
