import { expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { detectAffected, readResources, selectAffected, shardPaths } from './lighthouse-affected.mjs'

const read = (file: string) => readFileSync(file, 'utf8')
const resources = readResources(read)
const all = ['/resources', ...resources.map(resource => `/resources/${resource.slug}`)]
const select = (files: string[], current = resources, previous = resources) => selectAffected({ files, current, previous }).paths
const file = 'apps/landing/resources/content.ts'

const manifest = JSON.parse(read('package.json'))
const packageSelection = (before: unknown, after: unknown, files = ['package.json']) => selectAffected({
  files, current: resources, previous: resources,
  packageBefore: JSON.stringify(before), packageAfter: JSON.stringify(after),
}).paths

it.each(['vercel-build', 'now-build', 'deploy-build', 'cloud:check', 'db:migrate', 'test:coverage', 'test:diff-coverage'])('skips CI-only package command changes to %s', name => {
  const current = structuredClone(manifest)
  current.scripts[name] = 'updated deployment or CI command'
  expect(packageSelection(manifest, current)).toEqual([])
  expect(packageSelection(current, manifest)).toEqual([])
  expect(packageSelection(manifest, current, ['package.json', 'apps/landing/resources/ResourceArtwork.tsx'])).toEqual(['/resources'])
})

it('ignores JSON formatting and object key order, while preserving array order', () => {
  expect(packageSelection(manifest, Object.fromEntries(Object.entries(manifest).reverse()))).toEqual([])
  const current = structuredClone(manifest)
  current.files.reverse()
  expect(packageSelection(manifest, current)).toEqual(all)
})

it.each(['dependencies', 'devDependencies', 'overrides', 'engines', 'packageManager'])('keeps package %s changes as full-audit inputs', key => {
  expect(packageSelection(manifest, { ...manifest, [key]: { changed: 'value' } })).toEqual(all)
})

it.each(['build:landing', 'audit:resources', 'test', 'prebuild:landing', 'unknown-command'])('keeps build and unclassified script %s changes as full-audit inputs', name => {
  const current = structuredClone(manifest)
  current.scripts[name] = 'changed command'
  expect(packageSelection(manifest, current)).toEqual(all)
})

it('protects CI aliases referenced by other commands in either revision, including indirect calls and dynamic commands', () => {
  for (const command of ['bun run deploy-build', 'bun run helper', 'bun run $BUILD_COMMAND']) {
    const before = structuredClone(manifest)
    before.scripts['build:landing'] = command
    before.scripts.helper = 'bun run deploy-build'
    const after = structuredClone(before)
    after.scripts['deploy-build'] = 'changed deployment'
    expect(packageSelection(before, after)).toEqual(all)
    after.scripts['build:landing'] = manifest.scripts['build:landing']
    expect(packageSelection(before, after)).toEqual(all)
  }
})

it('falls back for malformed, missing, or unexpected package data', () => {
  for (const invalid of [null, [], {}, { scripts: [] }, { scripts: { test: 12 } }]) {
    expect(packageSelection(manifest, invalid)).toEqual(all)
  }
  expect(selectAffected({ files: ['package.json'], current: resources, packageBefore: '{', packageAfter: '{}' }).paths).toEqual(all)
})

it('skips only explicit deployment helpers and keeps unknown scripts and shared changes conservative', () => {
  const helpers = ['run-vercel-build.mjs', 'vercel-api-package.mjs', 'verify-vercel-output.mjs', 'build-vercel-output.ts', 'build-public-function.ts', 'check-cloud-deployment.ts'].map(name => `scripts/${name}`)
  expect(select(helpers)).toEqual([])
  expect(select([...helpers, 'apps/landing/resources/resources.css'])).toEqual(all)
  expect(select(['scripts/new-deployment-helper.ts'])).toEqual(all)
})

it('skips Record contracts, secret-scan exceptions, and deployment configuration without hiding resource changes', () => {
  const files = [
    'shared/record/contracts.ts', 'shared/record/limits.ts',
    'scripts/record-contracts-node.test.ts', '.gitleaksignore', 'vercel.json',
    'scripts/lighthouse-affected.mjs', 'scripts/lighthouse-affected.test.ts',
    'docs/vercel-managed-build.md',
  ]
  expect(select(files)).toEqual([])
  expect(select([...files, 'apps/landing/resources/ResourceArtwork.tsx'])).toEqual(['/resources'])
  expect(select([...files, 'apps/landing/resources/resources.css'])).toEqual(all)
  expect(select([...files, 'shared/new-input.ts'])).toEqual(all)
})

it('reads package metadata from both revisions without executing it and falls back on missing history', () => {
  const current = structuredClone(manifest)
  current.scripts['vercel-build'] = 'throw new Error("must not execute")'
  const calls: string[][] = []
  const git = (args: string[]) => {
    calls.push(args)
    return args[0] === 'diff' ? 'package.json\0' : JSON.stringify(manifest)
  }
  expect(detectAffected({ base: 'base', read: path => path === 'package.json' ? JSON.stringify(current) : read(path), git }).paths).toEqual([])
  expect(calls[1]).toEqual(['show', 'base:package.json'])
  expect(detectAffected({ base: 'base', read, git: args => { if (args[0] === 'diff') return 'package.json\0'; throw new Error('missing base') } }).paths).toEqual(all)
})

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

it('skips gitignore-only changes without hiding affected pages or unknown root inputs', () => {
  expect(select(['.gitignore'])).toEqual([])
  expect(select(['.gitignore', 'apps/landing/resources/ResourceArtwork.tsx'])).toEqual(['/resources'])
  expect(select(['.gitignore', 'bun.lock'])).toEqual(all)
  expect(select(['.gitignore', 'unknown-root-config'])).toEqual(all)
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


it('skips document contracts and local/MCP verification helpers without hiding widget edits',()=>{
  const files=['shared/documents.ts','scripts/local-api.ts','scripts/local-supabase.ts','scripts/verify-mcp-package.mjs']
  expect(select(files)).toEqual([])
  expect(select([...files,'src/components/FeedbackWidget/index.tsx'])).toEqual(all)
})

it('skips document-only development dependencies and release version metadata',()=>{
  const after=structuredClone(manifest)
  after.version='99.0.0'
  for(const name of ['jsdom','@types/jsdom','dompurify','marked'])after.devDependencies[name]='99.0.0'
  expect(packageSelection(manifest,after)).toEqual([])
  expect(packageSelection(after,manifest)).toEqual([])
  expect(packageSelection(manifest,after,['package.json','src/components/FeedbackWidget/index.tsx'])).toEqual(all)
  expect(packageSelection(manifest,{...after,dependencies:{...after.dependencies,marked:'99.0.0'}})).toEqual(all)
})

const locked=(name:string,metadata:object={})=>[`${name}@1.0.0`,'',metadata,`integrity-${name}`]
const lock=(roots:object,packages:object,extra:object={})=>JSON.stringify({lockfileVersion:3,configVersion:1,workspaces:{'':{devDependencies:roots}},packages,...extra})
const lockSelection=(before:string,after:string,files=['bun.lock'])=>selectAffected({files,current:resources,lockBefore:before,lockAfter:after}).paths
const beforeLock=()=>lock({vite:'1',consumer:'1'},{vite:locked('vite',{optionalPeers:['jsdom'],peerDependencies:{jsdom:'*'}}),consumer:locked('consumer',{dependencies:{url:'1'}}),url:locked('url')})
const documentLock=()=>lock({vite:'1',consumer:'1',jsdom:'1',marked:'1'},{vite:locked('vite',{optionalPeers:['jsdom'],peerDependencies:{jsdom:'*'}}),consumer:locked('consumer',{dependencies:{url:'1'}}),'consumer/url':locked('url'),url:locked('url-new'),jsdom:locked('jsdom',{dependencies:{url:'2'}}),marked:locked('marked')})

it('ignores exclusively document dependencies despite harmless dependency hoisting',()=>{
  expect(lockSelection(beforeLock(),documentLock())).toEqual([])
  expect(lockSelection(documentLock(),beforeLock())).toEqual([])
  expect(lockSelection(beforeLock(),documentLock(),['bun.lock','apps/landing/resources/ResourceArticle.tsx'])).toEqual(all.slice(1))
})

it('audits changed shared versions, integrity, overrides, root constraints, and peer resolutions',()=>{
  for(const change of [
    (value:any)=>{value.packages['consumer/url'][0]='url@2.0.0'},
    (value:any)=>{value.packages['consumer/url'][3]='different-integrity'},
    (value:any)=>{value.overrides={url:'2'}},
    (value:any)=>{value.workspaces[''].devDependencies.consumer='2'},
    (value:any)=>{value.packages.consumer[2].peerDependencies={url:'2'};delete value.packages['consumer/url']},
  ]){
    const value=JSON.parse(documentLock());change(value)
    expect(lockSelection(beforeLock(),JSON.stringify(value))).toEqual(all)
  }
  for(const field of ['dependencies','optionalDependencies']){
    const before=JSON.parse(documentLock())
    before.packages.consumer[2]={ [field]:{jsdom:'1'},peerDependencies:{jsdom:'1'},optionalPeers:['jsdom'] }
    const after=structuredClone(before);after.packages.jsdom[0]='jsdom@2.0.0'
    expect(lockSelection(JSON.stringify(before),JSON.stringify(after))).toEqual(all)
  }
})

it('preserves distinct dependency contexts and cycles instead of erasing peer changes',()=>{
  const value={a:locked('a',{dependencies:{nested:'1'}}),b:locked('b',{dependencies:{nested:'1'}}),'a/nested':locked('nested',{dependencies:{leaf:'1'}}),'b/nested':locked('nested',{dependencies:{leaf:'1'}}),'a/leaf':locked('leaf'), 'b/leaf':locked('other-leaf',{dependencies:{b:'1'}})}
  const before=lock({a:'1',b:'1'},value)
  expect(lockSelection(before,before)).toEqual([])
  const after=structuredClone(value);[after['a/leaf'],after['b/leaf']]=[after['b/leaf'],after['a/leaf']]
  expect(lockSelection(before,lock({a:'1',b:'1'},after))).toEqual(all)
})

it('retains full audits for unknown or incomplete lockfiles and unresolved required dependencies',()=>{
  for(const source of ['{','{}',lock({}, {},{lockfileVersion:4}),lock({missing:'1'},{}),lock({broken:'1'},{broken:[]}),lock({a:'1'},{a:locked('a',{dependencies:{missing:'1'}})})]){
    expect(lockSelection(beforeLock(),source)).toEqual(all)
    expect(lockSelection(source,beforeLock())).toEqual(all)
  }
  const optional=lock({a:'1'},{a:locked('a',{optionalDependencies:{absent:'1'}})})
  expect(lockSelection(optional,optional)).toEqual([])
  for(const entry of [{},[],[1,'',{},'hash'],['a',1,{},'hash'],['a','',null,'hash'],['a','','metadata','hash'],['a','',[],'hash'],['a','',{},1]]){
    expect(lockSelection(beforeLock(),lock({broken:'1'},{broken:entry}))).toEqual(all)
  }
})

it('ignores only literal landing cache paths, retaining other build changes and unsafe expressions',()=>{
  const before="export default () => ({\n  root: __dirname,\n})\n"
  const after=before.replace('  root:',"  cacheDir: path.resolve(envDir, 'node_modules/.vite-landing'),\n  root:")
  const pick=(a:string,b:string)=>selectAffected({files:['apps/landing/vite.config.ts'],current:resources,viteBefore:a,viteAfter:b}).paths
  expect(pick(before,after)).toEqual([]);expect(pick(after,before)).toEqual([])
  expect(pick(after,after.replace('.vite-landing','.vite-another'))).toEqual([])
  expect(pick(before,after.replace('__dirname','otherRoot'))).toEqual(all)
  expect(pick(before,after.replace("'node_modules/.vite-landing'",'execute()'))).toEqual(all)
  expect(pick(before,after.replace('.vite-landing','../outside'))).toEqual(all)
  expect(select(['apps/landing/vite.config.ts'])).toEqual(all)
})

it('reads lockfiles and Vite configuration from both revisions without executing either',()=>{
  const before="export default () => ({\n})\n",after="export default () => ({\n  cacheDir: path.resolve(envDir, 'node_modules/.vite-landing'),\n})\n"
  const sources:Record<string,string>={'bun.lock':documentLock(),'apps/landing/vite.config.ts':after}
  const previous:Record<string,string>={'bun.lock':beforeLock(),'apps/landing/vite.config.ts':before}
  const result=detectAffected({base:'base',read:path=>sources[path]??read(path),git:args=>args[0]==='diff'?'bun.lock\0apps/landing/vite.config.ts\0':previous[args[1].slice('base:'.length)]})
  expect(result.paths).toEqual([])
})

it('keeps the ignored document packages outside landing, widget, and build-script imports',()=>{
  function inspect(directory:string){
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      const path=directory+'/'+entry.name
      if(entry.isDirectory()){
        if(!['dist','node_modules','__tests__','tests'].includes(entry.name))inspect(path)
      }else if(/\.[cm]?[jt]sx?$/.test(path)&&!(/\.(test|spec)\./.test(path))){
        expect(read(path),path).not.toMatch(/\b(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)['"](?:jsdom|@types\/jsdom|dompurify|marked)(?:['"/])/)
      }
    }
  }
  for(const root of ['apps/landing','src','scripts'])inspect(root)
})
