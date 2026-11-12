import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { resourceMinutes } from '../apps/landing/resources/model.ts'

const contentFiles = ['apps/landing/resources/content.ts', 'apps/landing/resources/additionalContent.ts']
const resourceRoot = 'apps/landing/resources/'
// These commands/files do not participate in the local static Lighthouse build.
// Keep this list explicit: new scripts remain full-audit inputs by default.
const ciScripts = ['vercel-build', 'now-build', 'deploy-build', 'cloud:check', 'db:migrate', 'test:coverage', 'test:diff-coverage']
// These dependencies are only consumed by document rendering/tests, not landing.
const documentDependencies = ['jsdom', '@types/jsdom', 'dompurify', 'marked']
const deploymentFiles = [
  'vercel.json', 'scripts/lighthouse-affected.mjs',
  'scripts/run-vercel-build.mjs', 'scripts/vercel-api-package.mjs',
  'scripts/verify-vercel-output.mjs', 'scripts/build-vercel-output.ts',
  'scripts/build-public-function.ts', 'scripts/check-cloud-deployment.ts',
  'scripts/verify-mcp-package.mjs',
  'scripts/local-api.ts', 'scripts/local-supabase.ts',
]

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

function ciOnlyPackage(before, after) {
  const manifests = [JSON.parse(before), JSON.parse(after)]
  if (manifests.some(pkg => !pkg || typeof pkg !== 'object' || Array.isArray(pkg) || !pkg.scripts || typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts))) return false
  const changed = ciScripts.filter(name => manifests[0].scripts[name] !== manifests[1].scripts[name])
  // A CI alias referenced by any non-CI command might now affect the build.
  // Check both revisions, including pre/post hooks, without executing commands.
  if (manifests.some(pkg => Object.entries(pkg.scripts).some(([name, command]) =>
    typeof command !== 'string' || (!ciScripts.includes(name) && changed.length > 0 && (command.includes('$') || changed.some(alias => command.includes(alias)))),
  ))) return false
  for (const pkg of manifests) {
    for (const name of ciScripts) delete pkg.scripts[name]
    for (const name of documentDependencies) delete pkg.devDependencies?.[name]
    delete pkg.version
  }
  return JSON.stringify(canonical(manifests[0])) === JSON.stringify(canonical(manifests[1]))
}

function landingLock(source) {
  const { config: lock, error } = ts.parseConfigFileTextToJson('bun.lock', source)
  if (error || lock?.lockfileVersion !== 3 || Object.keys(lock.workspaces).join() !== '') throw new Error('Unknown lockfile format')
  const packages = lock.packages
  delete lock.packages
  const root = lock.workspaces['']
  for (const name of documentDependencies) delete root.devDependencies?.[name]
  delete root.version
  const keys = Object.keys(packages)
  function resolve(name, parent = '') {
    while (parent) {
      if (packages[`${parent}/${name}`]) return `${parent}/${name}`
      parent = keys.filter(key => parent.startsWith(`${key}/`)).sort((a, b) => b.length - a.length)[0] ?? ''
    }
    if (!packages[name]) throw new Error(`Unresolved lockfile dependency: ${name}`)
    return name
  }
  const identity = key => {
    const entry = packages[key]
    if (!Array.isArray(entry) || entry.length !== 4 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string' || !entry[2] || typeof entry[2] !== 'object' || Array.isArray(entry[2]) || typeof entry[3] !== 'string') throw new Error('Unknown package entry')
    return [entry[0], entry[1], entry[3]]
  }
  const roots = Object.fromEntries([...new Set(Object.keys({ ...root.dependencies, ...root.devDependencies, ...root.optionalDependencies, ...root.peerDependencies }))].map(name => [name, resolve(name)]))
  const pending = Object.values(roots), nodes = new Map()
  while (pending.length) {
    const key = pending.pop()
    if (nodes.has(key)) continue
    identity(key)
    const entry = packages[key], metadata = entry[2], resolved = {}
    for (const name of Object.keys({ ...metadata.dependencies, ...metadata.optionalDependencies, ...metadata.peerDependencies })) {
      if (documentDependencies.includes(name) && metadata.optionalPeers?.includes(name) && !metadata.dependencies?.[name] && !metadata.optionalDependencies?.[name]) continue
      try {
        const child = resolve(name, key)
        resolved[name] = child
        pending.push(child)
      } catch (error) {
        if (!metadata.optionalDependencies?.[name] && !metadata.optionalPeers?.includes(name)) throw error
        resolved[name] = null
      }
    }
    nodes.set(key, { entry, resolved })
  }
  // Preserve locations only when equal package versions have different resolved
  // contexts (including peers). Ordinary hoisting alone must not trigger audits.
  const ambiguous = new Set()
  const id = key => JSON.stringify(identity(key))
  const reference = key => key === null ? null : [...identity(key), ...(ambiguous.has(id(key)) ? [key] : [])]
  const signature = node => JSON.stringify(canonical({ entry: node.entry, resolved: Object.fromEntries(Object.entries(node.resolved).map(([name, key]) => [name, reference(key)])) }))
  let changed
  do {
    changed = false
    const contexts = new Map()
    for (const [key, node] of nodes) {
      const value = signature(node), packageId = id(key)
      if (contexts.has(packageId) && contexts.get(packageId) !== value && !ambiguous.has(packageId)) { ambiguous.add(packageId); changed = true }
      contexts.set(packageId, value)
    }
  } while (changed)
  const records = [...new Set([...nodes].map(([key, node]) => JSON.stringify([ambiguous.has(id(key)) ? key : null, signature(node)])))].sort()
  // Compare resolved versions and integrity, not physical hoisting locations.
  return JSON.stringify(canonical({ lock, roots: Object.fromEntries(Object.entries(roots).map(([name, key]) => [name, reference(key)])), records }))
}

function cacheOnlyConfig(before, after) {
  const strip = source => source.replace(/^[ \t]*cacheDir: path\.resolve\(envDir, (['"])node_modules\/\.vite[-\w]*\1\),\r?\n/gm, '')
  return strip(before) === strip(after)
}

// Read data without executing code from either revision. New syntax or imports
// deliberately force a full audit until the selector understands them.
function literal(node, extra) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(item => {
    if (ts.isSpreadElement(item)) {
      if (item.expression.getText() !== 'additionalResources' || !extra) throw new Error('Unknown resource spread')
      return extra
    }
    return [literal(item)]
  })
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) throw new Error('Unknown resource property')
    return [property.name.text, literal(property.initializer)]
  }))
  throw new Error('Unknown resource expression')
}

function readArray(source, name, extra) {
  const tree = ts.createSourceFile('content.ts', source, ts.ScriptTarget.Latest, true)
  if (tree.parseDiagnostics.length) throw new Error('Invalid resource source')
  let value
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement)) {
      const target = statement.moduleSpecifier.text
      if (!['./model.ts', './additionalContent.ts'].includes(target)) throw new Error('Unknown resource import')
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier?.text !== './model.ts' || statement.exportClause) throw new Error('Unknown resource export')
    } else if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
      const declaration = statement.declarationList.declarations[0]
      if (declaration.name.getText() !== name || !declaration.initializer) throw new Error('Unknown resource declaration')
      value = literal(declaration.initializer, extra)
    } else throw new Error('Unknown resource statement')
  }
  if (!Array.isArray(value)) throw new Error('Missing resource array')
  return value
}

export function readResources(read) {
  const extra = readArray(read(contentFiles[1]), 'additionalResources')
  const resources = readArray(read(contentFiles[0]), 'resources', extra)
  const slugs = resources.map(resource => resource.slug)
  if (slugs.some(slug => typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) || new Set(slugs).size !== slugs.length) throw new Error('Invalid resource slugs')
  return resources
}

function catalog(resources) {
  return resources.map(({ answer, sections, questions, sources, related, seoTitle, ...metadata }) => ({
    ...metadata, minutes: resourceMinutes({ ...metadata, answer, sections, questions, sources, related, seoTitle }),
  }))
}

/** Unknown production inputs audit everything; only known unrelated inputs skip. */
export function selectAffected({ files, current, previous, packageBefore, packageAfter, lockBefore, lockAfter, viteBefore, viteAfter }) {
  const all = ['/resources', ...current.map(resource => `/resources/${resource.slug}`)]
  const selected = new Set()
  const reasons = []
  const full = reason => ({ paths: all, reasons: [reason] })
  for (const file of files) {
    // Record contracts are used by the API, dashboard, and extension, not the
    // public resource build. Ignore only this known unrelated shared domain.
    if (file === '.gitignore' || file === '.gitleaksignore' || file === 'shared/documents.ts' || file.startsWith('shared/record/')) continue
    if (/(^|\/)(__tests__|tests)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /\.(md|mdx)$/.test(file)) continue
    if (file === 'package.json') {
      try {
        if (!ciOnlyPackage(packageBefore, packageAfter)) return full('Package dependencies, build commands, or unclassified settings changed')
      } catch {
        return full('Package comparison unavailable or invalid')
      }
      reasons.push('Only known non-landing package settings changed')
    } else if (file === 'bun.lock') {
      try {
        if (landingLock(lockBefore) !== landingLock(lockAfter)) return full('Landing dependency resolutions changed')
      } catch {
        return full('Lockfile comparison unavailable or invalid')
      }
      reasons.push('Only document dependency resolutions changed')
    } else if (file === 'apps/landing/vite.config.ts') {
      if (typeof viteBefore !== 'string' || typeof viteAfter !== 'string' || !cacheOnlyConfig(viteBefore, viteAfter)) return full('Landing build configuration changed')
      reasons.push('Only the landing cache directory changed')
    } else if (deploymentFiles.includes(file)) {
      reasons.push('Deployment-only helper changed')
    } else if (contentFiles.includes(file)) {
      if (!previous) return full('Base resource content unavailable')
      // Catalog bytes are shared by every resource page. A changed title,
      // ordering, reading time, etc. therefore affects all pages, not just links.
      if (JSON.stringify(catalog(previous)) !== JSON.stringify(catalog(current))) return full('Shared resource catalog changed')
      const old = new Map(previous.map(resource => [resource.slug, resource]))
      for (const resource of current) {
        if (JSON.stringify(resource) !== JSON.stringify(old.get(resource.slug))) selected.add(`/resources/${resource.slug}`)
      }
      reasons.push('Resource article content changed')
    } else if (['ResourceTool.tsx', 'toolCalculations.ts'].some(name => file === resourceRoot + name)) {
      for (const resource of current.filter(resource => resource.tool)) selected.add(`/resources/${resource.slug}`)
      reasons.push('Shared calculator code changed')
    } else if (['ResourcesIndex.tsx', 'ResourceFigure.tsx', 'ResourceArtwork.tsx'].some(name => file === resourceRoot + name)) {
      selected.add('/resources')
      reasons.push('Resource library code changed')
    } else if (file === resourceRoot + 'ResourceArticle.tsx' || file === resourceRoot + 'readResourceData.ts') {
      for (const path of all.slice(1)) selected.add(path)
      reasons.push('Shared article code changed')
    } else if (file.startsWith('apps/landing/') || file.startsWith('src/') || file.startsWith('branding/') || file.startsWith('shared/') || file.startsWith('scripts/') || file === '.github/workflows/resources-quality.yml' || !file.includes('/')) {
      return full(`Shared or unclassified production input: ${file}`)
    } else if (!['api/', 'db/', 'docs/', 'rules/', 'apps/dashboard/', 'apps/extension/', 'packages/', '.github/', '.agents/', '.claude/', 'server/', 'workflows/', 'supabase/', 'pr/'].some(prefix => file.startsWith(prefix))) {
      return full(`Unclassified input: ${file}`)
    }
  }
  return { paths: all.filter(path => selected.has(path)), reasons: [...new Set(reasons)] }
}

export function detectAffected({ base, head = 'HEAD', force = false, git, read }) {
  // Failure to read current URLs cannot safely produce an empty selection.
  // Let the workflow fall back to the audit script's full current-page list.
  const current = readResources(read)
  const all = reason => ({ paths: ['/resources', ...current.map(resource => `/resources/${resource.slug}`)], reasons: [reason] })
  if (force) return all('Manual full audit')
  if (!base || /^0+$/.test(base)) return all('No comparison base available')
  try {
    const files = git(['diff', '--name-only', '--no-renames', '-z', base, head]).split('\0').filter(Boolean)
    const previous = files.some(file => contentFiles.includes(file))
      ? readResources(file => git(['show', `${base}:${file}`])) : undefined
    const packages = files.includes('package.json')
      ? { packageBefore: git(['show', `${base}:package.json`]), packageAfter: read('package.json') } : {}
    const locks = files.includes('bun.lock') ? { lockBefore: git(['show', `${base}:bun.lock`]), lockAfter: read('bun.lock') } : {}
    const vite = files.includes('apps/landing/vite.config.ts') ? { viteBefore: git(['show', `${base}:apps/landing/vite.config.ts`]), viteAfter: read('apps/landing/vite.config.ts') } : {}
    return selectAffected({ files, current, previous, ...packages, ...locks, ...vite })
  } catch (error) {
    return all(`Full audit fallback: ${error.message}`)
  }
}

/** Each URL belongs to one runner per profile; its three audits stay together. */
export function shardPaths(paths) {
  const total = Math.min(3, paths.length)
  return Array.from({ length: total }, (_, index) => ({
    number: index + 1,
    total,
    paths: paths.filter((_, position) => position % total === index).join(','),
  }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = detectAffected({
    base: process.env.LIGHTHOUSE_BASE,
    head: process.env.LIGHTHOUSE_HEAD || 'HEAD',
    force: process.env.LIGHTHOUSE_FULL === 'true',
    git: args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }),
    read: file => readFileSync(file, 'utf8'),
  })
  const shards = shardPaths(result.paths)
  console.log(JSON.stringify({ ...result, shards }, null, 2))
  // Empty output lets a failed/skipped selector use the workflow's one full
  // audit fallback instead of constructing an invalid empty matrix.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `shards=${shards.length ? JSON.stringify(shards) : ''}\nrun=${result.paths.length > 0}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Lighthouse affected pages\n\n${result.paths.length ? result.paths.map(path => `- \`${path}\``).join('\n') : 'No resource pages affected; both Lighthouse audits skipped.'}\n\n${shards.length} parallel shard(s) per profile.\n\n${result.reasons.join('\n\n')}\n`)
}
